import { useState, useEffect, useRef } from "react";

// ---------- constants ----------
const STORE_KEY = "deal-desk-v1";
const PRI = { high: 0, medium: 1, low: 2 };
const PRI_COLOR = { high: "#B3382C", medium: "#9A6B00", low: "#3D6B4F" };
const DELEGATED = "#4A4E9E"; // delegated tasks switch to the indigo theme
const STATUS_NEXT = { todo: "progress", progress: "done", done: "todo" };

const INK = "#16202B";
const SOFT = "#5C6B7A";
const FAINT = "#8B98A5";
const LINE = "#DCE3EA";
const BG = "#F4F6F8";
const CARD = "#FFFFFF";
const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const RANGES = [
  { key: "last", label: "Since last sync", days: null },
  { key: "1", label: "Past 24 hours", days: 1 },
  { key: "3", label: "Past 3 days", days: 3 },
  { key: "7", label: "Past 7 days", days: 7 },
  { key: "14", label: "Past 2 weeks", days: 14 },
  { key: "30", label: "Past month", days: 30 },
  { key: "90", label: "Past 3 months", days: 90 },
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- date helpers ----------
function daysUntil(dstr) {
  if (!dstr) return null;
  const d = new Date(dstr + "T23:59:59");
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}
function chipFor(dstr, prefix) {
  const n = daysUntil(dstr);
  if (n === null) return null;
  if (n < 0) return { text: `${prefix} OVERDUE ${Math.abs(n)}d`, color: "#B3382C" };
  if (n === 0) return { text: `${prefix} TODAY`, color: "#B3382C" };
  if (n <= 3) return { text: `${prefix} ${n}d`, color: "#9A6B00" };
  return { text: `${prefix} ${dstr}`, color: FAINT };
}
function fmtTime(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function plusDays(n) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

// ---------- API helpers ----------
function responseText(data) {
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
function extractJSONArray(data) {
  const clean = responseText(data).replace(/```json|```/g, "").trim();
  const s = clean.indexOf("[");
  const e = clean.lastIndexOf("]");
  if (s === -1 || e === -1) throw new Error("No JSON array found in response");
  return JSON.parse(clean.slice(s, e + 1));
}
function extractJSONObject(data) {
  const clean = responseText(data).replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON object found in response");
  return JSON.parse(clean.slice(s, e + 1));
}
// Recover as many COMPLETE tasks as possible from a cut-off reply.
// Returns an array (possibly partial), or null if nothing parseable.
function salvageJSONArray(data) {
  const clean = responseText(data).replace(/```json|```/g, "").trim();
  const s = clean.indexOf("[");
  if (s === -1) return null;
  const e = clean.lastIndexOf("]");
  if (e > s) {
    try { return JSON.parse(clean.slice(s, e + 1)); } catch (_) { /* fall through */ }
  }
  const lastObj = clean.lastIndexOf("}");
  if (lastObj > s) {
    try { return JSON.parse(clean.slice(s, lastObj + 1) + "]"); } catch (_) { /* fall through */ }
  }
  return null;
}

async function callClaude(prompt, useMcp, maxTokens = 4000) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (useMcp) {
    body.mcp_servers = [
      { type: "url", url: "https://microsoft365.mcp.claude.com/mcp", name: "microsoft-365" },
    ];
  }
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt * 1500));
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`the API was busy (${res.status})`);
        continue; // transient — retry
      }
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = j?.error?.message || ""; } catch (_) {}
        throw new Error(`API error ${res.status}${detail ? ` — ${detail.slice(0, 160)}` : ""}`);
      }
      return res.json();
    } catch (e) {
      // TypeError: "Failed to fetch" = network/connection level, worth retrying
      if (e instanceof TypeError) { lastErr = new Error("the connection to the API dropped (\"Failed to fetch\")"); continue; }
      throw e;
    }
  }
  throw lastErr || new Error("the request failed after 3 attempts");
}

// ---------- task model ----------
function normalizeTask(raw, source) {
  return {
    id: uid(),
    title: String(raw.title || "Untitled task").slice(0, 120),
    project: String(raw.project || "General").trim() || "General",
    priority: ["high", "medium", "low"].includes(raw.priority) ? raw.priority : "medium",
    deadline: raw.deadline && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline) ? raw.deadline : null,
    deadlineType: ["explicit", "implicit"].includes(raw.deadlineType) ? raw.deadlineType : raw.deadline ? "implicit" : null,
    status: "todo",
    assignedBy: String(raw.assignedBy || raw.sender || ""),
    addressedTo: String(raw.addressedTo || "You"),
    askType: ["external", "internal"].includes(raw.askType) ? raw.askType : "internal",
    needsCall: !!raw.needsCall,
    emailBlurb: String(raw.emailBlurb || raw.summary || ""),
    steps: Array.isArray(raw.steps) ? raw.steps.map(String).slice(0, 8) : [],
    context: "",
    reassignedTo: null,
    followUpDate: null,
    notes: [],
    links: [],
    sender: raw.sender || "",
    subject: raw.subject || "",
    src: source,
    rank: Date.now() + Math.random(),
    createdAt: new Date().toISOString(),
  };
}
// backfill fields on tasks saved by older versions of this desk
function migrate(t) {
  return { ...normalizeTask(t, t.src || "manual"), ...t, id: t.id || uid(), notes: t.notes || [], links: t.links || [], steps: t.steps || [] };
}

const SYNC_SCHEMA = `{"title": "action-oriented, <=10 words", "project": "deal/project bucket", "priority": "high|medium|low", "deadline": "YYYY-MM-DD or null", "deadlineType": "explicit (a date/time is stated) | implicit (urgency implied, you inferred the date) | null", "assignedBy": "person who is asking", "addressedTo": "who the ask is directed at (e.g. 'You', 'You + Justin', 'Deal team')", "askType": "external (counterparty, owner, lender, advisor outside your firm) | internal (colleague at your firm)", "needsCall": true if resolving this requires scheduling or coordinating a call/meeting as an intermediate step else false, "emailBlurb": "2-3 sentences IN YOUR OWN WORDS: what is being asked, by whom, and why it matters", "steps": ["3-5 short suggested steps to complete this task"], "sender": "email sender name", "subject": "email subject"}`;

// ---------- component ----------
export default function MorningDealDesk() {
  const [tasks, setTasks] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [sortBy, setSortBy] = useState("priority");
  const [fStatus, setFStatus] = useState("open"); // open | delegated | done | all
  const [fPriority, setFPriority] = useState("all");
  const [fProject, setFProject] = useState("all");
  const [fAsk, setFAsk] = useState("all"); // all | external | internal

  const [syncRange, setSyncRange] = useState("last");
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total, label, found}
  const [syncNote, setSyncNote] = useState("");
  const [error, setError] = useState("");
  const [syncDetail, setSyncDetail] = useState("");
  const [showDetail, setShowDetail] = useState(false);

  const [expanded, setExpanded] = useState(new Set());
  const [planning, setPlanning] = useState(new Set());

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const blankDraft = {
    title: "", project: "", priority: "medium", deadline: "", deadlineType: "explicit",
    assignedBy: "", addressedTo: "You", askType: "internal", needsCall: false,
    emailBlurb: "", link: "",
  };
  const [draft, setDraft] = useState(blankDraft);
  const saveTimer = useRef(null);

  // backup / restore
  const [backupMode, setBackupMode] = useState(null); // null | "export" | "restore"
  const [backupJSON, setBackupJSON] = useState("");
  const [backupMeta, setBackupMeta] = useState(null); // {count, projects, savedAt}
  const [restoreText, setRestoreText] = useState("");
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreErr, setRestoreErr] = useState("");
  const [copied, setCopied] = useState(false);

  // load
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORE_KEY);
        if (r && r.value) {
          const d = JSON.parse(r.value);
          setTasks((d.tasks || []).map(migrate));
          setLastSync(d.lastSync || null);
        }
      } catch (e) { /* first run */ }
      setLoaded(true);
    })();
  }, []);

  // save (debounced)
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORE_KEY, JSON.stringify({ tasks, lastSync }));
      } catch (e) {
        setError("Couldn't save — changes may not persist this session.");
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [tasks, lastSync, loaded]);

  const projects = [...new Set(tasks.map((t) => t.project))].sort();

  // ---------- sync ----------
  function buildChunks(sinceISO) {
    const start = new Date(sinceISO).getTime();
    const now = Date.now();
    const totalDays = Math.max((now - start) / 86400000, 0.01);
    const stepDays = totalDays <= 7 ? 1 : totalDays <= 14 ? 2 : totalDays <= 31 ? 3 : 7;
    const chunks = [];
    let a = start;
    while (a < now) {
      const b = Math.min(a + stepDays * 86400000, now);
      chunks.push({ from: new Date(a).toISOString(), to: new Date(b).toISOString() });
      a = b;
    }
    return chunks.length ? chunks : [{ from: new Date(start).toISOString(), to: new Date(now).toISOString() }];
  }
  const dayLabel = (iso) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

  async function morningSync() {
    setSyncing(true); setError(""); setSyncNote(""); setProgress(null);
    const detailLog = [];
    try {
      const range = RANGES.find((r) => r.key === syncRange) || RANGES[0];
      let since;
      if (range.days) {
        since = new Date(Date.now() - range.days * 86400000).toISOString();
      } else {
        const dayAgo = new Date(Date.now() - 86400000).toISOString();
        since = lastSync && lastSync < dayAgo ? lastSync : dayAgo;
      }
      const knownProjects = projects.length ? projects.join(", ") : "none yet";
      const chunks = buildChunks(since);
      detailLog.push(`range: ${range.label} → ${chunks.length} slice${chunks.length > 1 ? "s" : ""}`);

      // seen set grows as slices land, so duplicates across slices are caught too
      const seen = new Set(
        tasks.map((t) => (t.sender + "|" + t.subject).toLowerCase())
          .concat(tasks.map((t) => t.title.toLowerCase()))
      );
      let totalFound = 0;
      let truncatedSlices = 0;
      const failedSlices = [];

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const label = `${dayLabel(c.from)} → ${dayLabel(c.to)}`;
        setProgress({ done: i, total: chunks.length, label, found: totalFound });

        try {
          const prompt = `You are triaging Outlook email for a private equity deal professional. Use the Microsoft 365 email tools to search the inbox for emails received after ${c.from} and on or before ${c.to} (today is ${new Date().toISOString().slice(0, 10)}). Stay strictly inside that window. Read enough of each relevant email to judge it.

CREATE A TASK ONLY IF the email requires THIS USER'S own action: a direct ask addressed to them, a decision they own, a document they must review/send, or a deadline they are responsible for.

EXCLUDE entirely: newsletters and news digests, automated notifications and system alerts, calendar invites/acceptances, mass distributions, threads where the user is only CC'd with no direct ask, pure FYI updates, and anything clearly another team member's responsibility.

Bucket each task under a deal or project name inferred from the email. Reuse these existing buckets when they fit: ${knownProjects}. Otherwise create a sensible new bucket name.

Priority: high = urgent, senior counterparty waiting, or deadline within ~2 days; medium = normal; low = minor. For deadlines, mark deadlineType "explicit" when a date/time is stated in the email, "implicit" when you inferred one from urgency; deadline null when neither. Write emailBlurb IN YOUR OWN WORDS — do not copy sentences from the email, and keep it to 2 sentences. Give exactly 3 short suggested steps (under 15 words each). Keep every field tight — brevity matters more than completeness.

Respond with ONLY a raw JSON array (no markdown, no preamble). Each element: ${SYNC_SCHEMA}

Respond with [] ONLY if you successfully searched the inbox and genuinely found no actionable emails in the window. If the email tools are unavailable, the search fails, or you cannot read the messages, do NOT return [] — instead respond with the word ERROR followed by a one-sentence reason.`;

          const data = await callClaude(prompt, true);
          const blocks = data.content || [];
          const toolUses = blocks.filter((b) => b.type === "mcp_tool_use");
          const toolErrors = blocks.filter((b) => b.type === "mcp_tool_result" && b.is_error);
          const rawText = responseText(data).trim();
          const truncated = data.stop_reason === "max_tokens";

          detailLog.push(
            `slice ${i + 1}/${chunks.length} [${label}]: ${toolUses.length} tool call${toolUses.length !== 1 ? "s" : ""}, ` +
            `stop=${data.stop_reason}${toolErrors.length ? `, ${toolErrors.length} tool error(s)` : ""}`
          );
          toolUses.forEach((u) => detailLog.push(`  → ${u.name}(${JSON.stringify(u.input || {}).slice(0, 110)})`));

          if (toolErrors.length)
            throw new Error("mailbox tools returned an error — the Microsoft 365 connection may need re-authorizing");
          if (rawText.toUpperCase().startsWith("ERROR"))
            throw new Error(rawText.slice(0, 200));

          let items = salvageJSONArray(data);
          if (items === null) {
            if (truncated) { truncatedSlices++; detailLog.push(`  ! cut off before any complete task — nothing recoverable`); items = []; }
            else throw new Error(`unreadable reply: "${rawText.slice(0, 160) || "(empty)"}"`);
          } else if (truncated) {
            truncatedSlices++;
            detailLog.push(`  ! reply cut off — recovered ${items.length} complete task(s)`);
          }
          if (!Array.isArray(items)) items = [];
          if (items.length === 0 && toolUses.length === 0)
            throw new Error("replied without searching the mailbox — check the Microsoft 365 connection");

          const fresh = items.map((r) => normalizeTask(r, "email"))
            .filter((t) => {
              const k1 = (t.sender + "|" + t.subject).toLowerCase();
              const k2 = t.title.toLowerCase();
              if (seen.has(k1) || seen.has(k2)) return false;
              seen.add(k1); seen.add(k2);
              return true;
            });
          totalFound += fresh.length;
          detailLog.push(`  = ${fresh.length} new task(s) from this slice`);
          if (fresh.length) setTasks((prev) => [...fresh, ...prev]); // land tasks live, slice by slice
        } catch (sliceErr) {
          // One bad window shouldn't cost you the rest of the run.
          failedSlices.push({ label, msg: sliceErr.message });
          detailLog.push(`  ✗ slice failed: ${sliceErr.message}`);
        }
        setProgress({ done: i + 1, total: chunks.length, label, found: totalFound });
      }

      setLastSync(new Date().toISOString());
      const parts = [];
      parts.push(totalFound
        ? `${totalFound} new task${totalFound > 1 ? "s" : ""} added (${range.label.toLowerCase()}, ${chunks.length} slice${chunks.length > 1 ? "s" : ""}).`
        : `${chunks.length - failedSlices.length} of ${chunks.length} slice${chunks.length > 1 ? "s" : ""} searched — nothing new judged actionable for you.`);
      if (truncatedSlices)
        parts.push(`${truncatedSlices} slice${truncatedSlices > 1 ? "s were" : " was"} cut off mid-reply; complete tasks were recovered.`);
      if (failedSlices.length)
        parts.push(`${failedSlices.length} slice${failedSlices.length > 1 ? "s" : ""} failed (${failedSlices.map((f) => f.label).join(", ")}) — re-run to retry just those. Reason: ${failedSlices[0].msg}`);
      setSyncNote(parts.join(" "));
    } catch (e) {
      setError(`Sync failed: ${e.message}. Progress up to this point was kept — already-captured tasks won't duplicate on retry.`);
    } finally {
      setSyncDetail(detailLog.join("\n"));
      setSyncing(false);
      setProgress(null);
    }
  }

  // ---------- per-task deep plan ----------
  async function researchPlan(t) {
    setPlanning((p) => new Set(p).add(t.id));
    setError("");
    try {
      const prompt = `You are helping a private equity deal professional tackle one task. Use the Microsoft 365 email tools to find the full context:
1. Search the mailbox for the email chain with subject "${t.subject || t.title}"${t.sender ? ` involving ${t.sender}` : ""} and read the latest messages in it.
2. Also search for OLDER related threads about "${t.project}" to understand history, prior commitments, and open items.

The task: "${t.title}" — ${t.emailBlurb || "no summary yet"}.

Then respond with ONLY a raw JSON object (no markdown, no preamble):
{"emailBlurb": "2-4 sentences IN YOUR OWN WORDS: the ask, who wants it, current state of the thread", "context": "1-3 sentences of relevant history from older threads (prior commitments, what's already been sent, who owes what)", "steps": ["a concrete, ordered 4-7 step game plan to complete this task, referencing specific people/documents where the emails support it"], "needsCall": true/false, "deadline": "YYYY-MM-DD or null", "deadlineType": "explicit|implicit|null"}

If the mailbox tools fail, respond with the word ERROR and a one-sentence reason.`;
      const data = await callClaude(prompt, true);
      const rawText = responseText(data).trim();
      if (rawText.toUpperCase().startsWith("ERROR")) throw new Error(rawText.slice(0, 250));
      const obj = extractJSONObject(data);
      update(t.id, {
        emailBlurb: obj.emailBlurb || t.emailBlurb,
        context: obj.context || t.context,
        steps: Array.isArray(obj.steps) && obj.steps.length ? obj.steps.map(String) : t.steps,
        needsCall: typeof obj.needsCall === "boolean" ? obj.needsCall : t.needsCall,
        deadline: obj.deadline && /^\d{4}-\d{2}-\d{2}$/.test(obj.deadline) ? obj.deadline : t.deadline,
        deadlineType: ["explicit", "implicit"].includes(obj.deadlineType) ? obj.deadlineType : t.deadlineType,
      });
    } catch (e) {
      setError(`Couldn't research "${t.title}": ${e.message}`);
    } finally {
      setPlanning((p) => { const n = new Set(p); n.delete(t.id); return n; });
    }
  }

  // ---------- import ----------
  async function runImport() {
    if (!importText.trim()) return;
    setImporting(true); setError("");
    try {
      const prompt = `Parse this personal to-do list into structured tasks. Today is ${new Date().toISOString().slice(0, 10)}. Respond with ONLY a raw JSON array (no markdown, no preamble). Each element: ${SYNC_SCHEMA} — use empty strings / null / false for anything the list doesn't state; emailBlurb may restate the item in your own words; steps may be a short suggested plan.

LIST:
${importText.slice(0, 4000)}`;
      const data = await callClaude(prompt, false);
      const items = extractJSONArray(data);
      const fresh = items.map((r) => normalizeTask(r, "import"));
      setTasks((prev) => [...prev, ...fresh]);
      setImportText(""); setShowImport(false);
      setSyncNote(`${fresh.length} task${fresh.length !== 1 ? "s" : ""} imported.`);
    } catch (e) {
      setError(`Import failed: ${e.message}`);
    } finally { setImporting(false); }
  }

  // ---------- mutations ----------
  const update = (id, patch) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));
  const toggleExpand = (id) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function addManual() {
    if (!draft.title.trim()) return;
    const t = normalizeTask({
      ...draft,
      deadline: draft.deadline || null,
      deadlineType: draft.deadline ? draft.deadlineType : null,
      steps: [],
    }, "manual");
    if (draft.link.trim()) t.links = [{ id: uid(), path: draft.link.trim() }];
    setTasks((prev) => [t, ...prev]);
    setDraft(blankDraft);
    setShowAdd(false);
  }

  // ---------- backup / restore ----------
  async function openExport() {
    setBackupMode("export"); setCopied(false); setBackupJSON(""); setBackupMeta(null);
    let payload;
    try {
      // Read what is actually persisted, not just in-memory state.
      const r = await window.storage.get(STORE_KEY);
      payload = r && r.value ? JSON.parse(r.value) : { tasks, lastSync };
    } catch (e) {
      payload = { tasks, lastSync }; // nothing saved yet — fall back to live state
    }
    const backup = {
      backupOf: STORE_KEY,
      exportedAt: new Date().toISOString(),
      taskCount: (payload.tasks || []).length,
      tasks: payload.tasks || [],
      lastSync: payload.lastSync || null,
    };
    setBackupJSON(JSON.stringify(backup, null, 2));
    setBackupMeta({
      count: backup.taskCount,
      projects: [...new Set((backup.tasks || []).map((t) => t.project))].sort(),
      savedAt: backup.exportedAt,
    });
  }

  function copyBackup() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(backupJSON).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 2500); },
        () => setCopied(false)
      );
    }
  }

  function downloadBackup() {
    try {
      const blob = new Blob([backupJSON], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deal-desk-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setCopied(false);
    }
  }

  function openRestore() {
    setBackupMode("restore"); setRestoreText(""); setRestorePreview(null); setRestoreErr("");
  }

  function previewRestore(text) {
    setRestoreText(text);
    setRestoreErr(""); setRestorePreview(null);
    if (!text.trim()) return;
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { setRestoreErr("That isn't valid JSON — paste the whole backup, including the outer { }."); return; }
    const arr = Array.isArray(parsed) ? parsed : parsed.tasks;
    if (!Array.isArray(arr)) { setRestoreErr("No tasks array found. Expected a backup with a \"tasks\" list."); return; }
    const valid = arr.filter((t) => t && typeof t === "object" && typeof t.title === "string" && t.title.trim());
    if (!valid.length) { setRestoreErr("The tasks list is empty or no entries have a title."); return; }
    setRestorePreview({
      count: valid.length,
      skipped: arr.length - valid.length,
      projects: [...new Set(valid.map((t) => t.project || "General"))].sort(),
      exportedAt: parsed.exportedAt || null,
      lastSync: parsed.lastSync || null,
      tasks: valid,
    });
  }

  function confirmRestore() {
    if (!restorePreview) return;
    // Every restored task goes through migrate() so older backups gain new fields.
    const restored = restorePreview.tasks.map((t) => migrate({ ...t, id: t.id || uid() }));
    setTasks(restored);
    setLastSync(restorePreview.lastSync || null);
    setExpanded(new Set());
    setBackupMode(null);
    setSyncNote(`Restored ${restored.length} task${restored.length !== 1 ? "s" : ""} from backup — your previous list was replaced.`);
    setError("");
  }

  function reassign(t) {
    const name = window.prompt(`Reassign "${t.title}" to whom?`);
    if (!name || !name.trim()) return;
    const def = plusDays(3);
    const fu = window.prompt(`Follow-up reminder date (YYYY-MM-DD):`, def);
    update(t.id, {
      reassignedTo: name.trim(),
      followUpDate: fu && /^\d{4}-\d{2}-\d{2}$/.test(fu) ? fu : def,
      notes: [...t.notes, { id: uid(), date: new Date().toISOString().slice(0, 10), text: `Reassigned to ${name.trim()}` }],
    });
  }
  function takeBack(t) {
    update(t.id, {
      reassignedTo: null, followUpDate: null,
      notes: [...t.notes, { id: uid(), date: new Date().toISOString().slice(0, 10), text: "Taken back" }],
    });
  }
  function addNote(t) {
    const txt = window.prompt(`Progress note for "${t.title}":`);
    if (!txt || !txt.trim()) return;
    update(t.id, { notes: [...t.notes, { id: uid(), date: new Date().toISOString().slice(0, 10), text: txt.trim() }] });
  }
  function addLink(t) {
    const p = window.prompt("Paste a link, SharePoint/Egnyte URL, or file path:");
    if (!p || !p.trim()) return;
    update(t.id, { links: [...t.links, { id: uid(), path: p.trim() }] });
  }

  // ---------- view ----------
  let visible = tasks.filter((t) => {
    if (fStatus === "open" && (t.status === "done" || t.reassignedTo)) return false;
    if (fStatus === "delegated" && !t.reassignedTo) return false;
    if (fStatus === "done" && t.status !== "done") return false;
    if (fPriority !== "all" && t.priority !== fPriority) return false;
    if (fProject !== "all" && t.project !== fProject) return false;
    if (fAsk !== "all" && t.askType !== fAsk) return false;
    return true;
  });
  const effDate = (t) => (t.reassignedTo ? t.followUpDate : t.deadline);
  const cmpDeadline = (a, b) => {
    const da = effDate(a) ? daysUntil(effDate(a)) : 9999;
    const db = effDate(b) ? daysUntil(effDate(b)) : 9999;
    return da - db;
  };
  const sorters = {
    priority: (a, b) => PRI[a.priority] - PRI[b.priority] || cmpDeadline(a, b),
    deadline: cmpDeadline,
    project: (a, b) => a.project.localeCompare(b.project) || PRI[a.priority] - PRI[b.priority],
    rank: (a, b) => a.rank - b.rank,
  };
  visible = [...visible].sort(sorters[sortBy]);

  function move(id, dir) {
    setTasks((prev) => {
      const ordered = [...prev].sort((a, b) => a.rank - b.rank);
      const i = ordered.findIndex((t) => t.id === id);
      const j = i + dir;
      if (j < 0 || j >= ordered.length) return prev;
      const a = ordered[i], b = ordered[j];
      return prev.map((t) => (t.id === a.id ? { ...t, rank: b.rank } : t.id === b.id ? { ...t, rank: a.rank } : t));
    });
  }

  const grouped = sortBy === "project";
  const groups = grouped
    ? [...new Set(visible.map((t) => t.project))].map((p) => ({ name: p, items: visible.filter((t) => t.project === p) }))
    : [{ name: null, items: visible }];

  const openCount = tasks.filter((t) => t.status !== "done" && !t.reassignedTo).length;
  const delegatedCount = tasks.filter((t) => t.reassignedTo && t.status !== "done").length;
  const dueSoon = tasks.filter((t) => t.status !== "done" && effDate(t) && daysUntil(effDate(t)) <= 3).length;

  // ---------- styles ----------
  const btn = (primary) => ({
    fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 4,
    cursor: "pointer", border: `1px solid ${primary ? INK : LINE}`,
    background: primary ? INK : CARD, color: primary ? "#fff" : INK,
  });
  const sel = {
    fontFamily: SANS, fontSize: 12, padding: "4px 6px", border: `1px solid ${LINE}`,
    borderRadius: 4, background: CARD, color: INK,
  };
  const tag = (color, filled) => ({
    fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    color: filled ? "#fff" : color, background: filled ? color : "transparent",
    border: `1px solid ${color}`, borderRadius: 3, padding: "1px 6px",
  });
  const linkBtn = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    fontFamily: MONO, fontSize: 11, color: SOFT, textDecoration: "underline",
  };

  if (!loaded)
    return (
      <div style={{ fontFamily: SANS, color: SOFT, background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading your desk…
      </div>
    );

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: SANS, color: INK }}>

      {/* ---- backup / restore modal ---- */}
      {backupMode && (
        <div onClick={() => setBackupMode(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,32,43,0.45)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: CARD, borderRadius: 8, border: `1px solid ${LINE}`, width: "100%", maxWidth: 680, boxShadow: "0 12px 40px rgba(22,32,43,0.25)" }}>

            {/* modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.5, color: SOFT }}>
                {backupMode === "export" ? "EXPORT BACKUP" : "RESTORE FROM BACKUP"}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button style={{ ...linkBtn }} onClick={() => (backupMode === "export" ? openRestore() : openExport())}>
                  {backupMode === "export" ? "restore instead →" : "← export instead"}
                </button>
                <button style={{ ...sel, cursor: "pointer", color: SOFT }} onClick={() => setBackupMode(null)}>✕</button>
              </div>
            </div>

            {/* EXPORT */}
            {backupMode === "export" && (
              <div style={{ padding: 18 }}>
                {backupMeta ? (
                  <>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", background: BG, border: `1px solid ${LINE}`, borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1 }}>TASKS</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{backupMeta.count}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1 }}>DEALS / PROJECTS</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{backupMeta.projects.length}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1 }}>TAKEN</div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{fmtTime(backupMeta.savedAt)}</div>
                      </div>
                    </div>
                    {backupMeta.projects.length > 0 && (
                      <div style={{ fontSize: 12, color: SOFT, marginBottom: 12 }}>
                        Includes: {backupMeta.projects.join(" · ")}
                      </div>
                    )}
                    <textarea readOnly value={backupJSON} rows={12}
                      onFocus={(e) => e.target.select()}
                      style={{ width: "100%", boxSizing: "border-box", fontFamily: MONO, fontSize: 11, border: `1px solid ${LINE}`, borderRadius: 4, padding: 10, color: INK, background: "#FBFCFD", resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button style={btn(true)} onClick={copyBackup}>{copied ? "✓ Copied" : "Copy to clipboard"}</button>
                      <button style={btn(false)} onClick={downloadBackup}>Download .json</button>
                      <span style={{ fontSize: 11, color: FAINT }}>
                        If the download is blocked, select the text above and copy it manually.
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ color: SOFT, fontSize: 13 }}>Reading saved data…</div>
                )}
              </div>
            )}

            {/* RESTORE */}
            {backupMode === "restore" && (
              <div style={{ padding: 18 }}>
                <div style={{ fontSize: 13, color: SOFT, marginBottom: 8 }}>
                  Paste a backup below. You'll see a preview and confirm before anything is overwritten.
                </div>
                <textarea value={restoreText} onChange={(e) => previewRestore(e.target.value)} rows={8}
                  placeholder='{ "backupOf": "deal-desk-v1", "tasks": [ … ] }'
                  style={{ width: "100%", boxSizing: "border-box", fontFamily: MONO, fontSize: 11, border: `1px solid ${restoreErr ? "#E3C4BE" : LINE}`, borderRadius: 4, padding: 10, color: INK, resize: "vertical" }} />

                {restoreErr && (
                  <div style={{ background: "#F9ECEA", border: "1px solid #E3C4BE", borderRadius: 4, padding: "8px 12px", fontSize: 12, color: "#8C3226", marginTop: 8 }}>
                    {restoreErr}
                  </div>
                )}

                {restorePreview && (
                  <>
                    <div style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 6, padding: "12px 14px", marginTop: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1, marginBottom: 6 }}>PREVIEW</div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                        {restorePreview.count} task{restorePreview.count !== 1 ? "s" : ""} across {restorePreview.projects.length} deal{restorePreview.projects.length !== 1 ? "s" : ""}/project{restorePreview.projects.length !== 1 ? "s" : ""}
                      </div>
                      <div style={{ fontSize: 12, color: SOFT }}>{restorePreview.projects.join(" · ")}</div>
                      {restorePreview.exportedAt && (
                        <div style={{ fontSize: 11, color: FAINT, fontFamily: MONO, marginTop: 6 }}>
                          backup taken {fmtTime(restorePreview.exportedAt)}
                        </div>
                      )}
                      {restorePreview.skipped > 0 && (
                        <div style={{ fontSize: 11, color: "#9A6B00", marginTop: 6 }}>
                          {restorePreview.skipped} entr{restorePreview.skipped === 1 ? "y" : "ies"} will be skipped (no title).
                        </div>
                      )}
                    </div>
                    <div style={{ background: "#F9ECEA", border: "1px solid #E3C4BE", borderRadius: 4, padding: "10px 12px", fontSize: 12, color: "#8C3226", marginTop: 10 }}>
                      This <b>replaces</b> your current list of {tasks.length} task{tasks.length !== 1 ? "s" : ""}. Export a backup of the current list first if you might want it back.
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button style={{ ...btn(true), background: "#8C3226", borderColor: "#8C3226" }} onClick={confirmRestore}>
                        Replace my list with this backup
                      </button>
                      <button style={btn(false)} onClick={() => setBackupMode(null)}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 20px 80px" }}>

        {/* masthead */}
        <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 14, marginBottom: 6 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: SOFT }}>
            MORNING DEAL DESK · {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5 }}>
                {openCount} on you · {delegatedCount} delegated · {dueSoon} due ≤3d
              </div>
              <div style={{ fontSize: 12, color: FAINT, fontFamily: MONO, marginTop: 4 }}>
                last inbox sync: {fmtTime(lastSync)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={syncRange} onChange={(e) => setSyncRange(e.target.value)} style={sel} title="Sync window">
                {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <button style={btn(true)} onClick={morningSync} disabled={syncing}>
                {syncing ? "Reading inbox…" : "☕ Sync"}
              </button>
              <button style={btn(false)} onClick={() => { setShowAdd(!showAdd); setShowImport(false); }}>+ Task</button>
              <button style={btn(false)} onClick={() => { setShowImport(!showImport); setShowAdd(false); }}>Import</button>
              <button style={btn(false)} onClick={openExport} title="Export / restore a backup of your list">⇄ Backup</button>
            </div>
          </div>
        </div>

        {/* notices */}
        {syncing && (
          <div style={{ background: "#EDF2F7", border: `1px solid ${LINE}`, borderRadius: 4, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: SOFT, marginBottom: 8, fontFamily: MONO }}>
              <span>
                {progress
                  ? `Scanning ${progress.label} — slice ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
                  : "Preparing sync…"}
              </span>
              <span>{progress ? `${progress.found} task${progress.found !== 1 ? "s" : ""} found so far` : ""}</span>
            </div>
            <div style={{ height: 8, background: "#DCE3EA", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${progress ? Math.max((progress.done / progress.total) * 100, 4) : 4}%`,
                background: INK, borderRadius: 4, transition: "width 0.6s ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>
              The range is scanned in day-sized slices so no single reply overflows — new tasks land in the list below as each slice finishes.
            </div>
          </div>
        )}
        {syncNote && !syncing && (
          <div style={{ background: "#EEF4EE", border: "1px solid #CBDCCB", borderRadius: 4, padding: "10px 14px", fontSize: 13, color: "#2F5233", marginTop: 12 }}>
            {syncNote}
          </div>
        )}
        {error && (
          <div style={{ background: "#F9ECEA", border: "1px solid #E3C4BE", borderRadius: 4, padding: "10px 14px", fontSize: 13, color: "#8C3226", marginTop: 12 }}>
            {error}
          </div>
        )}
        {syncDetail && !syncing && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setShowDetail(!showDetail)} style={linkBtn}>
              {showDetail ? "hide sync details" : "view sync details"}
            </button>
            {showDetail && (
              <pre style={{ background: "#EDF2F7", border: `1px solid ${LINE}`, borderRadius: 4, padding: 12, fontSize: 11, fontFamily: MONO, color: SOFT, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 6 }}>
                {syncDetail}
              </pre>
            )}
          </div>
        )}

        {/* add form — full detail parity with synced tasks */}
        {showAdd && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: 16, marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <input placeholder="Task title *" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ ...sel, padding: 8, gridColumn: "1 / -1" }} />
              <input placeholder="Deal / project" value={draft.project} onChange={(e) => setDraft({ ...draft, project: e.target.value })} list="proj-list" style={{ ...sel, padding: 8 }} />
              <datalist id="proj-list">{projects.map((p) => <option key={p} value={p} />)}</datalist>
              <input placeholder="Assigned by (who's asking)" value={draft.assignedBy} onChange={(e) => setDraft({ ...draft, assignedBy: e.target.value })} style={{ ...sel, padding: 8 }} />
              <input placeholder="Addressed to (You / You + team)" value={draft.addressedTo} onChange={(e) => setDraft({ ...draft, addressedTo: e.target.value })} style={{ ...sel, padding: 8 }} />
              <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} style={sel}>
                <option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>
              </select>
              <select value={draft.askType} onChange={(e) => setDraft({ ...draft, askType: e.target.value })} style={sel}>
                <option value="internal">Internal ask</option><option value="external">External ask</option>
              </select>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} style={{ ...sel, flex: 1 }} />
                <select value={draft.deadlineType} onChange={(e) => setDraft({ ...draft, deadlineType: e.target.value })} style={sel}>
                  <option value="explicit">Explicit</option><option value="implicit">Implicit</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: SOFT }}>
                <input type="checkbox" checked={draft.needsCall} onChange={(e) => setDraft({ ...draft, needsCall: e.target.checked })} />
                Needs a call first
              </label>
              <input placeholder="Link / file path (optional)" value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} style={{ ...sel, padding: 8, gridColumn: "1 / -1", fontFamily: MONO, fontSize: 11 }} />
              <textarea placeholder="Details / blurb (optional)" value={draft.emailBlurb} onChange={(e) => setDraft({ ...draft, emailBlurb: e.target.value })} rows={2} style={{ ...sel, padding: 8, gridColumn: "1 / -1", fontFamily: SANS, resize: "vertical" }} />
            </div>
            <button style={{ ...btn(true), marginTop: 10 }} onClick={addManual}>Add task</button>
          </div>
        )}

        {/* import */}
        {showImport && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: 16, marginTop: 14 }}>
            <div style={{ fontSize: 13, color: SOFT, marginBottom: 8 }}>
              Paste your existing to-do list in any format — Claude parses it into fully-structured tasks.
            </div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6}
              placeholder={"e.g.\n- Confirm exec summary bullet for AES deck (Justin) — Friday\n- Call Primrose owner back end of week"}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: MONO, fontSize: 12, border: `1px solid ${LINE}`, borderRadius: 4, padding: 10, color: INK }} />
            <button style={{ ...btn(true), marginTop: 8 }} onClick={runImport} disabled={importing}>
              {importing ? "Parsing…" : "Import with AI"}
            </button>
          </div>
        )}

        {/* filter bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, margin: "18px 0 10px" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[["open", "On me"], ["delegated", "Delegated"], ["done", "Done"], ["all", "All"]].map(([k, l]) => (
              <button key={k} onClick={() => setFStatus(k)}
                style={{ ...btn(false), padding: "5px 12px", fontSize: 12, background: fStatus === k ? INK : CARD, color: fStatus === k ? "#fff" : SOFT, border: `1px solid ${fStatus === k ? INK : LINE}` }}>
                {l}
              </button>
            ))}
            <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} style={sel}>
              <option value="all">Any priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <select value={fProject} onChange={(e) => setFProject(e.target.value)} style={sel}>
              <option value="all">All deals/projects</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={fAsk} onChange={(e) => setFAsk(e.target.value)} style={sel}>
              <option value="all">External + internal</option><option value="external">External asks</option><option value="internal">Internal asks</option>
            </select>
          </div>
          <div style={{ fontSize: 12, color: SOFT, display: "flex", alignItems: "center", gap: 6 }}>
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={sel}>
              <option value="priority">Priority</option>
              <option value="deadline">Deadline</option>
              <option value="project">Project</option>
              <option value="rank">My order</option>
            </select>
          </div>
        </div>

        {/* empty state */}
        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: FAINT, fontSize: 14, border: `1px dashed ${LINE}`, borderRadius: 8, background: CARD }}>
            An empty desk. Pick a window and hit <b style={{ color: INK }}>Sync</b>, or <b style={{ color: INK }}>Import</b> your existing list.
          </div>
        )}
        {tasks.length > 0 && visible.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 20px", color: FAINT, fontSize: 13 }}>
            Nothing matches these filters.
          </div>
        )}

        {/* task list */}
        {groups.map((g) => (
          <div key={g.name || "flat"}>
            {g.name && (
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.5, color: SOFT, margin: "22px 0 8px", borderBottom: `1px solid ${LINE}`, paddingBottom: 4 }}>
                ▸ {g.name.toUpperCase()} <span style={{ color: FAINT }}>({g.items.length})</span>
              </div>
            )}
            {g.items.map((t) => {
              const isOpen = expanded.has(t.id);
              const done = t.status === "done";
              const railColor = done ? LINE : t.reassignedTo ? DELEGATED : PRI_COLOR[t.priority];
              const dChip = t.reassignedTo
                ? chipFor(t.followUpDate, "FOLLOW UP")
                : chipFor(t.deadline, "DUE");
              const isPlanning = planning.has(t.id);
              return (
                <div key={t.id} style={{
                  background: t.reassignedTo && !done ? "#F7F7FC" : CARD,
                  border: `1px solid ${t.reassignedTo && !done ? "#D5D6EC" : LINE}`,
                  borderLeft: `4px solid ${railColor}`,
                  borderRadius: 6, marginBottom: 8, opacity: done ? 0.55 : 1,
                }}>
                  {/* ---- overview row ---- */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px" }}>
                    <button onClick={() => update(t.id, { status: STATUS_NEXT[t.status] })}
                      title={t.status === "todo" ? "Mark in progress" : t.status === "progress" ? "Mark done" : "Reopen"}
                      style={{
                        width: 22, height: 22, borderRadius: "50%", marginTop: 2, flexShrink: 0, cursor: "pointer",
                        border: `2px solid ${done ? "#3D6B4F" : t.status === "progress" ? "#9A6B00" : FAINT}`,
                        background: done ? "#3D6B4F" : t.status === "progress" ? "linear-gradient(90deg,#9A6B00 50%,transparent 50%)" : "transparent",
                        color: "#fff", fontSize: 13, lineHeight: "18px", padding: 0,
                      }}>
                      {done ? "✓" : ""}
                    </button>

                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => toggleExpand(t.id)}>
                      <div style={{ fontSize: 15, fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>
                        {t.title}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
                        {t.assignedBy && (
                          <span style={{ fontSize: 11, color: SOFT }}>
                            <b>{t.assignedBy}</b> → {t.addressedTo || "You"}
                          </span>
                        )}
                        {!grouped && (
                          <span style={{ fontFamily: MONO, fontSize: 10, color: SOFT, background: BG, border: `1px solid ${LINE}`, borderRadius: 3, padding: "1px 6px" }}>
                            {t.project}
                          </span>
                        )}
                        <span style={tag(t.askType === "external" ? "#7A4A1F" : SOFT, false)}>
                          {t.askType === "external" ? "EXT" : "INT"}
                        </span>
                        {dChip && (
                          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: dChip.color }}>
                            {dChip.text}{!t.reassignedTo && t.deadline ? (t.deadlineType === "explicit" ? " ·E" : " ·I") : ""}
                          </span>
                        )}
                        {t.needsCall && !done && <span style={tag("#1F5E7A", false)}>📞 CALL FIRST</span>}
                        {t.reassignedTo && !done && <span style={tag(DELEGATED, true)}>WITH {t.reassignedTo.toUpperCase()}</span>}
                        {t.status === "progress" && !done && (
                          <span style={{ fontFamily: MONO, fontSize: 10, color: "#9A6B00", fontWeight: 700 }}>IN PROGRESS</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                      {sortBy === "rank" && (
                        <>
                          <button style={{ ...sel, cursor: "pointer" }} onClick={() => move(t.id, -1)} title="Move up">↑</button>
                          <button style={{ ...sel, cursor: "pointer" }} onClick={() => move(t.id, 1)} title="Move down">↓</button>
                        </>
                      )}
                      <button onClick={() => toggleExpand(t.id)} title={isOpen ? "Collapse" : "Expand"}
                        style={{ ...sel, cursor: "pointer", color: SOFT }}>
                        {isOpen ? "▾" : "▸"}
                      </button>
                    </div>
                  </div>

                  {/* ---- expanded detail ---- */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${LINE}`, padding: "12px 14px 14px 48px", fontSize: 13 }}>
                      {t.emailBlurb && (
                        <div style={{ color: INK, marginBottom: 8 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1 }}>THE ASK · </span>
                          {t.emailBlurb}
                        </div>
                      )}
                      {t.context && (
                        <div style={{ color: SOFT, marginBottom: 8 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1 }}>CONTEXT · </span>
                          {t.context}
                        </div>
                      )}
                      {t.steps.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1, marginBottom: 4 }}>SUGGESTED PLAN</div>
                          <ol style={{ margin: 0, paddingLeft: 18, color: INK }}>
                            {t.steps.map((s, i) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}
                          </ol>
                        </div>
                      )}
                      {t.links.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1, marginBottom: 4 }}>FILES & LINKS</div>
                          {t.links.map((l) => (
                            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                              {/^https?:\/\//i.test(l.path)
                                ? <a href={l.path} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 11, color: "#1F5E7A", wordBreak: "break-all" }}>{l.path}</a>
                                : <span style={{ fontFamily: MONO, fontSize: 11, color: SOFT, wordBreak: "break-all" }}>{l.path}</span>}
                              <button style={{ ...linkBtn, color: FAINT }} onClick={() => navigator.clipboard && navigator.clipboard.writeText(l.path)}>copy</button>
                              <button style={{ ...linkBtn, color: FAINT }} onClick={() => update(t.id, { links: t.links.filter((x) => x.id !== l.id) })}>remove</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {t.notes.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: 1, marginBottom: 4 }}>PROGRESS LOG</div>
                          {t.notes.map((n) => (
                            <div key={n.id} style={{ fontSize: 12, color: SOFT, marginBottom: 2 }}>
                              <span style={{ fontFamily: MONO, fontSize: 10, color: FAINT }}>{n.date}</span> — {n.text}
                            </div>
                          ))}
                        </div>
                      )}
                      {t.sender && (
                        <div style={{ fontSize: 11, color: FAINT, marginBottom: 10 }}>✉ {t.sender}{t.subject ? ` — ${t.subject}` : ""}</div>
                      )}

                      {/* inline edits */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                        <select value={t.priority} onChange={(e) => update(t.id, { priority: e.target.value })}
                          style={{ ...sel, fontFamily: MONO, fontSize: 10, fontWeight: 700, color: PRI_COLOR[t.priority] }}>
                          <option value="high">HIGH</option><option value="medium">MED</option><option value="low">LOW</option>
                        </select>
                        <select value={t.askType} onChange={(e) => update(t.id, { askType: e.target.value })} style={{ ...sel, fontSize: 10 }}>
                          <option value="external">EXTERNAL</option><option value="internal">INTERNAL</option>
                        </select>
                        <input type="date" value={t.deadline || ""} onChange={(e) => update(t.id, { deadline: e.target.value || null })} style={{ ...sel, fontSize: 10 }} title="Deadline" />
                        {t.reassignedTo && (
                          <input type="date" value={t.followUpDate || ""} onChange={(e) => update(t.id, { followUpDate: e.target.value || null })} style={{ ...sel, fontSize: 10, borderColor: "#C9CAE8" }} title="Follow-up date" />
                        )}
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: SOFT }}>
                          <input type="checkbox" checked={t.needsCall} onChange={(e) => update(t.id, { needsCall: e.target.checked })} /> call first
                        </label>
                      </div>

                      {/* actions */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button style={{ ...btn(false), fontSize: 12, padding: "6px 10px" }} onClick={() => researchPlan(t)} disabled={isPlanning}>
                          {isPlanning ? "Researching threads…" : "🔍 Research context & re-plan"}
                        </button>
                        {t.reassignedTo
                          ? <button style={{ ...btn(false), fontSize: 12, padding: "6px 10px", borderColor: "#C9CAE8", color: DELEGATED }} onClick={() => takeBack(t)}>↩ Take back</button>
                          : <button style={{ ...btn(false), fontSize: 12, padding: "6px 10px" }} onClick={() => reassign(t)}>→ Reassign</button>}
                        <button style={{ ...btn(false), fontSize: 12, padding: "6px 10px" }} onClick={() => addNote(t)}>+ Note</button>
                        <button style={{ ...btn(false), fontSize: 12, padding: "6px 10px" }} onClick={() => addLink(t)}>+ Link / file path</button>
                        <button style={{ ...btn(false), fontSize: 12, padding: "6px 10px", color: "#8C3226" }} onClick={() => remove(t.id)}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ marginTop: 28, fontSize: 11, color: FAINT, fontFamily: MONO, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          Sync excludes CC-only, newsletters, automated notices, and items owned by others · deadlines marked ·E (stated in email) or ·I (inferred) · indigo = delegated, tracked by follow-up date · saved privately, persists between sessions.
        </div>
      </div>
    </div>
  );
}
