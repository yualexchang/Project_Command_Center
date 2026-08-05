import { useState, useEffect, useRef } from "react";

// ---------- constants ----------
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

// ---------- logo ----------
function Logo({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Project Command Center" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r="30" fill={INK} />
      <path d="M32 32 L32 5 A27 27 0 0 1 55.4 18.5 Z" fill={DELEGATED} opacity="0.5" />
      <line x1="32" y1="32" x2="55.4" y2="18.5" stroke="#C9CAE8" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="23" fill="none" stroke={DELEGATED} strokeWidth="1.4" opacity="0.85" />
      <circle cx="32" cy="32" r="15.5" fill="none" stroke="#8B98A5" strokeWidth="1" opacity="0.55" />
      <circle cx="32" cy="32" r="8" fill="none" stroke="#8B98A5" strokeWidth="1" opacity="0.35" />
      <line x1="5" y1="32" x2="59" y2="32" stroke="#5C6B7A" strokeWidth="1" opacity="0.45" />
      <line x1="32" y1="5" x2="32" y2="59" stroke="#5C6B7A" strokeWidth="1" opacity="0.45" />
      <circle cx="41.5" cy="21.5" r="2.4" fill="#EEF4EE" />
      <circle cx="21.5" cy="40.5" r="2" fill="#D9A441" />
      <circle cx="43.5" cy="42" r="2" fill="#C96A5B" />
      <circle cx="32" cy="32" r="2.6" fill={BG} />
    </svg>
  );
}

// ---------- speed dials ----------
const DIAL = { done: "#2E7D52", delegated: "#4A4E9E", track: "#C7D0D9" }; // validated: CVD-safe on white
const PORTCO_DIALS = [
  { key: "BravoFit", match: /bravo|project fit/i },
  { key: "IMO", match: /\bimo\b|sea lion/i },
  { key: "KEP", match: /kep|kindling|caryl|primrose/i },
  { key: "Penske", match: /penske/i },
];
const OTHER_PROJECTS = /admin|command center|fep fund|general/i;

function dialArc(cx, cy, r, a0, a1) {
  // 0deg = left end of the semicircle, 180deg = right end, sweeping over the top
  const pt = (a) => {
    const rad = ((180 - a) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

function Gauge({ label, done, delegated, open, hero = false }) {
  const size = hero ? 200 : 136;
  const strokeW = hero ? 15 : 11;
  const cx = size / 2;
  const r = size / 2 - strokeW / 2 - 2;
  const cy = size / 2 + 4;
  const total = done + delegated + open;
  const pct = total ? Math.round((done / total) * 100) : null;
  const gapDeg = (2 / (Math.PI * r)) * 180; // ~2px surface gap between segments

  const parts = [
    { v: done, color: DIAL.done },
    { v: delegated, color: DIAL.delegated },
    { v: open, color: DIAL.track },
  ].filter((p) => p.v > 0);

  const segs = [];
  let acc = 0;
  parts.forEach((p, i) => {
    const span = (p.v / total) * 180;
    const a0 = acc + (i > 0 ? gapDeg / 2 : 0);
    const a1 = acc + span - (i < parts.length - 1 ? gapDeg / 2 : 0);
    if (a1 > a0) segs.push({ d: dialArc(cx, cy, r, a0, a1), color: p.color });
    acc += span;
  });

  const needleAngle = total ? (done / total) * 180 : 0;
  const nRad = ((180 - needleAngle) * Math.PI) / 180;
  const nLen = r - strokeW / 2 - 5;
  const nx = cx + nLen * Math.cos(nRad);
  const ny = cy - nLen * Math.sin(nRad);

  return (
    <div style={{ textAlign: "center", padding: "4px 6px" }}>
      <svg width={size} height={cy + 8} style={{ display: "block", margin: "0 auto" }}>
        {segs.length === 0 && <path d={dialArc(cx, cy, r, 0, 180)} fill="none" stroke={DIAL.track} strokeWidth={strokeW} strokeLinecap="round" />}
        {segs.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={strokeW} strokeLinecap="butt" />
        ))}
        {total > 0 && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={INK} strokeWidth={hero ? 2.5 : 2} />
            <circle cx={cx} cy={cy} r={hero ? 5 : 4} fill={INK} />
          </>
        )}
      </svg>
      <div style={{ fontSize: hero ? 26 : 18, fontWeight: 700, color: INK, marginTop: 2, lineHeight: 1.1 }}>
        {pct === null ? "—" : `${pct}%`}
      </div>
      <div style={{ fontFamily: MONO, fontSize: hero ? 12 : 10, letterSpacing: 1.2, color: SOFT, marginTop: 3 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: hero ? 12 : 11, color: FAINT, marginTop: 2 }}>
        {total === 0 ? "no tasks" : `${done} done · ${delegated} delegated · ${open} open`}
      </div>
    </div>
  );
}

function DialRow({ tasks }) {
  const cat = (t) => (t.status === "done" ? "done" : t.reassignedTo ? "delegated" : "open");
  const tally = (list) => {
    const c = { done: 0, delegated: 0, open: 0 };
    list.forEach((t) => c[cat(t)]++);
    return c;
  };

  const claimed = new Set();
  const portcos = PORTCO_DIALS.map((p) => {
    const list = tasks.filter((t) => p.match.test(t.project));
    list.forEach((t) => claimed.add(t.id));
    return { label: p.key, ...tally(list) };
  });
  const rest = tasks.filter((t) => !claimed.has(t.id));
  const other = tally(rest.filter((t) => OTHER_PROJECTS.test(t.project)));
  const liveDeals = tally(rest.filter((t) => !OTHER_PROJECTS.test(t.project)));

  const chip = (color, text) => (
    <span key={text} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: SOFT }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
      {text}
    </span>
  );

  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 8, padding: "14px 16px 10px", marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: FAINT }}>MISSION DIALS</div>
        <div style={{ display: "flex", gap: 14 }}>
          {chip(DIAL.done, "Done")}
          {chip(DIAL.delegated, "Delegated")}
          {chip(DIAL.track, "Open")}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "center", gap: "4px 18px", marginTop: 6 }}>
        <Gauge label="All Tasks" hero {...tally(tasks)} />
        {portcos.map((p) => (
          <Gauge key={p.label} label={p.label} done={p.done} delegated={p.delegated} open={p.open} />
        ))}
        <Gauge label="Live Deals" {...liveDeals} />
        <Gauge label="Other" {...other} />
      </div>
    </div>
  );
}

// ---------- component ----------
export default function CommandCenter() {
  const [tasks, setTasks] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [sortBy, setSortBy] = useState("priority");
  const [fStatus, setFStatus] = useState("open"); // open | delegated | done | all
  const [fPriority, setFPriority] = useState("all");
  const [fProject, setFProject] = useState("all");
  const [fAsk, setFAsk] = useState("all"); // all | external | internal

  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  const [showAdd, setShowAdd] = useState(false);
  const blankDraft = {
    title: "", project: "", priority: "medium", deadline: "", deadlineType: "explicit",
    assignedBy: "", addressedTo: "You", askType: "internal", needsCall: false,
    emailBlurb: "", link: "",
  };
  const [draft, setDraft] = useState(blankDraft);
  const saveTimer = useRef(null);
  const skipNextSave = useRef(false);

  // backup / restore
  const [backupMode, setBackupMode] = useState(null); // null | "export" | "restore"
  const [backupJSON, setBackupJSON] = useState("");
  const [backupMeta, setBackupMeta] = useState(null); // {count, projects, savedAt}
  const [restoreText, setRestoreText] = useState("");
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreErr, setRestoreErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadFromFile() {
    const res = await fetch("/api/tasks");
    if (!res.ok) throw new Error(`API ${res.status}`);
    const d = await res.json();
    skipNextSave.current = true; // loading is not an edit — don't echo it back to disk
    setTasks((d.tasks || []).map(migrate));
    setLastSync(d.lastSync || null);
  }

  // load
  useEffect(() => {
    (async () => {
      try {
        await loadFromFile();
      } catch (e) {
        setError("Couldn't read data/tasks.json — is the dev server running from the repo root?");
      }
      setLoaded(true);
    })();
  }, []);

  // save (debounced) to data/tasks.json via the dev-server API
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks, lastSync }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
      } catch (e) {
        setError("Couldn't save to data/tasks.json — changes may not persist.");
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [tasks, lastSync, loaded]);

  async function refresh() {
    setRefreshing(true); setError("");
    try { await loadFromFile(); }
    catch (e) { setError("Refresh failed — couldn't read data/tasks.json."); }
    finally { setRefreshing(false); }
  }

  const projects = [...new Set(tasks.map((t) => t.project))].sort();

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
    let payload = { tasks, lastSync };
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) payload = await res.json(); // export what's on disk, not just in-memory state
    } catch (e) { /* fall back to live state */ }
    const backup = {
      backupOf: "command-center-v1",
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
      a.download = `command-center-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
                        Git history of data/tasks.json is also a full backup trail.
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
                  placeholder='{ "backupOf": "command-center-v1", "tasks": [ … ] }'
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
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Logo />
              <div>
                <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2.5, color: INK, fontWeight: 700 }}>
                  PROJECT COMMAND CENTER
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: SOFT, marginTop: 3 }}>
                  {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, marginTop: 6 }}>
                  {openCount} on you · {delegatedCount} delegated · {dueSoon} due ≤3d
                </div>
                <div style={{ fontSize: 12, color: FAINT, fontFamily: MONO, marginTop: 4 }}>
                  last inbox sync: {fmtTime(lastSync)} · run <b>/command-center-sync</b> in Claude Code, then refresh
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button style={btn(true)} onClick={refresh} disabled={refreshing}>
                {refreshing ? "Reloading…" : "↻ Refresh"}
              </button>
              <button style={btn(false)} onClick={() => setShowAdd(!showAdd)}>+ Task</button>
              <button style={btn(false)} onClick={openExport} title="Export / restore a backup of your list">⇄ Backup</button>
            </div>
          </div>
        </div>

        {/* speed dials */}
        <DialRow tasks={tasks} />

        {/* notices */}
        {error && (
          <div style={{ background: "#F9ECEA", border: "1px solid #E3C4BE", borderRadius: 4, padding: "10px 14px", fontSize: 13, color: "#8C3226", marginTop: 12 }}>
            {error}
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
            An empty desk. Run <b style={{ color: INK }}>/command-center-sync</b> in Claude Code to triage your inbox, or add a task manually.
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
          Inbox sync + per-task research run in Claude Code (/command-center-sync, /command-center-research) · deadlines marked ·E (stated in email) or ·I (inferred) · indigo = delegated, tracked by follow-up date · saved to data/tasks.json, history in git.
        </div>
      </div>
    </div>
  );
}
