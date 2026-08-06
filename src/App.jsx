import { useState, useEffect, useRef } from "react";

// ---------- constants ----------
const PRI = { high: 0, medium: 1, low: 2 };
const PRI_COLOR = { high: "#6E0F0F", medium: "#C63D2F", low: "#D9822B" }; // darkest red / red / orange
const DONE_COLOR = "#2E7D52"; // green = completed
const PROGRESS_COLOR = "#B58200"; // amber = in progress
const DELEGATED = "#6B4FA1"; // purple = delegated
// left-click advances (todo -> in progress -> done); right-click retreats to todo
const STATUS_NEXT = { todo: "progress", progress: "done", done: "todo" };

// filter-bar cyclers
const SORT_CYCLE = ["priority", "project", "deadline", "fifo", "lifo"];
const SORT_LABEL = { priority: "Priority", project: "Project", deadline: "Deadline", fifo: "FIFO", lifo: "LIFO" };
// FIFO and LIFO are the two ingestion orders; both are hand-reorderable.
const REORDERABLE = ["fifo", "lifo"];
const STATUS_CYCLE = ["open", "delegated", "done", "all"];
const STATUS_LABEL = { open: "On Alex / Open", delegated: "Delegated", done: "Completed", all: "All" };

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
// whole calendar days from today to dstr: 0 = today, 1 = tomorrow, -1 = yesterday.
// Both sides are pinned to local midnight so the answer never depends on the time
// of day; Math.round absorbs the 23/25-hour days at a DST boundary.
function daysUntil(dstr) {
  if (!dstr) return null;
  const d = new Date(dstr + "T00:00:00");
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
// Days from today to the Sunday that closes the current week (weeks run Mon-Sun).
// On Sunday this is 0 — the week ends today, so "this week" is empty and
// everything ahead belongs to next week.
function daysToWeekEnd() {
  const dow = new Date().getDay(); // 0 = Sunday
  return dow === 0 ? 0 : 7 - dow;
}
// Days from today to the last day of the current calendar month. Day 0 of the
// next month is the last day of this one, so this never needs a length table.
function daysToMonthEnd() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return Math.round((end - t) / 86400000);
}
function weekdayOf(dstr) {
  if (!dstr) return "";
  const d = new Date(dstr + "T12:00:00");
  return isNaN(d) ? "" : d.toLocaleDateString([], { weekday: "short" });
}
function chipFor(dstr, prefix) {
  const n = daysUntil(dstr);
  if (n === null) return null;
  if (n < 0) return { text: `${prefix} OVERDUE ${Math.abs(n)}d`, color: "#B3382C" };
  if (n === 0) return { text: `${prefix} TODAY`, color: "#B3382C" };
  if (n <= 3) return { text: `${prefix} ${weekdayOf(dstr)} (${n}d)`, color: "#9A6B00" };
  return { text: `${prefix} ${weekdayOf(dstr)} ${dstr}`, color: FAINT };
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
    bucket: raw.bucket || null, // explicit dial category; null = infer from project name
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
function Logo({ size = 92 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Project Command Center" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r="30" fill={INK} />
      <circle cx="32" cy="32" r="23" fill="none" stroke={DELEGATED} strokeWidth="1.4" opacity="0.85" />
      <circle cx="32" cy="32" r="15.5" fill="none" stroke="#8B98A5" strokeWidth="1" opacity="0.55" />
      <circle cx="32" cy="32" r="8" fill="none" stroke="#8B98A5" strokeWidth="1" opacity="0.35" />
      <line x1="5" y1="32" x2="59" y2="32" stroke="#5C6B7A" strokeWidth="1" opacity="0.45" />
      <line x1="32" y1="5" x2="32" y2="59" stroke="#5C6B7A" strokeWidth="1" opacity="0.45" />
      {/* rotating sweep — the "always scanning" beam */}
      <g>
        <path d="M32 32 L32 5 A27 27 0 0 1 55.4 18.5 Z" fill="#8F7BC4" opacity="0.5" />
        <line x1="32" y1="32" x2="55.4" y2="18.5" stroke="#D5CCEC" strokeWidth="1.6" />
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="4s" repeatCount="indefinite" />
      </g>
      <circle cx="41.5" cy="21.5" r="2.4" fill="#EEF4EE">
        <animate attributeName="opacity" values="1;0.15;1" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="21.5" cy="40.5" r="2" fill="#D9A441">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="4s" begin="1.3s" repeatCount="indefinite" />
      </circle>
      <circle cx="43.5" cy="42" r="2" fill="#C96A5B">
        <animate attributeName="opacity" values="0.6;1;0.15;0.6" dur="4s" begin="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="32" cy="32" r="2.6" fill={BG} />
    </svg>
  );
}

// ---------- buckets & speed dials ----------
const DIAL = { done: DONE_COLOR, progress: PROGRESS_COLOR, delegated: DELEGATED, track: "#C7D0D9" }; // validated: CVD-safe on white
// Categorical bucket palette — validated (one WARN pair covered by direct labels).
const BUCKETS = [
  { key: "BravoFit", color: "#2B6CC4", match: /bravo|project fit/i },
  { key: "IMO", color: "#B8860B", match: /\bimo\b|sea lion/i },
  { key: "KEP", color: "#00939F", match: /kep|kindling|caryl|primrose/i },
  { key: "Penske", color: "#D34F8A", match: /penske/i },
  { key: "AI Projects", color: "#6E7FD1", match: /command center|deal desk|claude|deepseek|\bai\b/i },
  { key: "Admin", color: "#A34E2A", match: /admin|fep fund|general/i },
  { key: "Live Deals", color: "#7E8F1F", match: /botinkit|lincoln|atlas|acquisition|\bdeal\b|\blbo\b|\bjv\b/i },
  { key: "Miscellaneous", color: "#64748B", match: null }, // neutral catch-all: anything not matched above
];
const bucketByKey = (key) => BUCKETS.find((b) => b.key === key) || null;
// An explicit task.bucket always wins; otherwise infer from the project name.
function bucketFor(project, explicit) {
  return (
    (explicit && bucketByKey(explicit)) ||
    BUCKETS.find((b) => b.match && b.match.test(project || "")) ||
    BUCKETS[BUCKETS.length - 1]
  );
}
// display/sort order: portcos first, then live deals, AI, admin, misc
const BUCKET_ORDER = ["BravoFit", "IMO", "KEP", "Penske", "Live Deals", "AI Projects", "Admin", "Miscellaneous"];
const bucketRank = (t) => BUCKET_ORDER.indexOf(bucketFor(t.project, t.bucket).key);

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

// filled pie-wedge — parliament / congress-seating style
function dialWedge(cx, cy, r, a0, a1) {
  const pt = (a) => {
    const rad = ((180 - a) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

function Spinner({ size = 14, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 6 }}>
      <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="3" />
      <path d="M10 2 A8 8 0 0 1 18 10" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

function Gauge({ label, done, inProgress = 0, delegated, open, hero = false, dot = null }) {
  const size = hero ? 150 : 104;
  const strokeW = hero ? 12 : 9;
  const fan = !hero; // small dials render as filled congress-seating fans
  const cx = size / 2;
  const r = fan ? size / 2 - 4 : size / 2 - strokeW / 2 - 2;
  const cy = size / 2 + 4;
  const total = done + inProgress + delegated + open;
  const pct = total ? Math.round((done / total) * 100) : null;
  const gapDeg = (2 / (Math.PI * r)) * 180; // ~2px surface gap between ring segments

  // segment order, left to right: complete, in progress, delegated, open
  const parts = [
    { v: done, color: DIAL.done },
    { v: inProgress, color: DIAL.progress },
    { v: delegated, color: DIAL.delegated },
    { v: open, color: DIAL.track },
  ].filter((p) => p.v > 0);

  const segs = [];
  let acc = 0;
  parts.forEach((p, i) => {
    const span = (p.v / total) * 180;
    if (fan) {
      segs.push({ d: dialWedge(cx, cy, r, acc, acc + span), color: p.color });
    } else {
      const a0 = acc + (i > 0 ? gapDeg / 2 : 0);
      const a1 = acc + span - (i < parts.length - 1 ? gapDeg / 2 : 0);
      if (a1 > a0) segs.push({ d: dialArc(cx, cy, r, a0, a1), color: p.color });
    }
    acc += span;
  });

  const needleAngle = total ? (done / total) * 180 : 0;
  const nRad = ((180 - needleAngle) * Math.PI) / 180;
  const nLen = fan ? r - 3 : r - strokeW / 2 - 5;
  const nx = cx + nLen * Math.cos(nRad);
  const ny = cy - nLen * Math.sin(nRad);

  return (
    <div style={{ textAlign: "center", padding: "4px 6px", maxWidth: size + 70 }}>
      <svg width={size} height={cy + 8} style={{ display: "block", margin: "0 auto" }}>
        {segs.length === 0 &&
          (fan ? (
            <path d={dialWedge(cx, cy, r, 0, 180)} fill={DIAL.track} opacity="0.45" stroke={CARD} strokeWidth="2" />
          ) : (
            <path d={dialArc(cx, cy, r, 0, 180)} fill="none" stroke={DIAL.track} strokeWidth={strokeW} strokeLinecap="round" />
          ))}
        {segs.map((s, i) =>
          fan ? (
            <path key={i} d={s.d} fill={s.color} stroke={CARD} strokeWidth="2" strokeLinejoin="round" />
          ) : (
            <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={strokeW} strokeLinecap="butt" />
          )
        )}
        {total > 0 && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={INK} strokeWidth={hero ? 2 : 1.5} />
            <circle cx={cx} cy={cy} r={hero ? 4 : 3} fill={INK} />
          </>
        )}
      </svg>
      <div style={{ fontSize: hero ? 19 : 14, fontWeight: 700, color: INK, marginTop: 1, lineHeight: 1.1 }}>
        {pct === null ? "—" : `${pct}%`}
      </div>
      <div style={{ fontFamily: MONO, fontSize: hero ? 10 : 9, letterSpacing: 1, color: SOFT, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
        {dot && <span style={{ width: 7, height: 7, borderRadius: 2, background: dot, display: "inline-block", flexShrink: 0 }} />}
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 10, color: FAINT, marginTop: 1 }}>
        {total === 0 ? "no tasks" : `${open} open · ${inProgress} in prog · ${delegated} deleg · ${done} done`}
      </div>
    </div>
  );
}

// The portco rail: which live context rides alongside each portco's dial.
// IMO carries the UK/Germany weather because its sites sit in those two markets
// and demand there is weather-driven; the others just get a clock and a feed.
// Fixed pitch for the rail. Every row gets this height whether its news box is
// full or empty, so the four dials line up instead of drifting with content.
const PORTCO_ROW_H = 148;
const PORTCO_RAIL = [
  { key: "BravoFit", news: { feed: "bravofit", title: "BRAVOFIT · PLNT", symbol: "PLNT" } },
  { key: "IMO", weather: true, news: { feed: "imo", title: "IMO · UK/DE" } },
  { key: "KEP", news: { feed: "earlyed", title: "EARLY ED · CO/UT" } },
  { key: "Penske", news: { feed: "penske", title: "PENSKE · AUTO" } },
];

function DialRow({ tasks, nonce }) {
  const cat = (t) =>
    t.status === "done" ? "done" : t.reassignedTo ? "delegated" : t.status === "progress" ? "inProgress" : "open";
  const tally = (list) => {
    const c = { done: 0, inProgress: 0, delegated: 0, open: 0 };
    list.forEach((t) => c[cat(t)]++);
    return c;
  };

  const byBucket = {};
  BUCKETS.forEach((b) => (byBucket[b.key] = []));
  tasks.forEach((t) => byBucket[bucketFor(t.project, t.bucket).key].push(t));
  const dial = (key) => {
    const b = BUCKETS.find((x) => x.key === key);
    return <Gauge key={key} label={key} dot={b.color} {...tally(byBucket[key])} />;
  };

  const chip = (color, text) => (
    <span key={text} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: SOFT }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
      {text}
    </span>
  );

  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px 8px", marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: FAINT }}>MISSION DIALS</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {chip(DIAL.track, "Open")}
          {chip(DIAL.progress, "In Progress")}
          {chip(DIAL.delegated, "Delegated")}
          {chip(DIAL.done, "Complete")}
        </div>
      </div>

      {/* Left column: the whole book over a 2x2 of the non-portco buckets.
          Right column: one row per portco, dial then that portco's live context.
          Both columns are flex items so the layout stacks instead of crushing
          when the window gets narrow. (Stacked, the divider is left hanging on
          the left block's right edge — cosmetic, and only below ~800px.) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 4, alignItems: "stretch" }}>
        <div style={{
          flex: "1 1 250px", minWidth: 236, maxWidth: 310, display: "flex", flexDirection: "column",
          borderRight: `2px solid ${LINE}`, paddingRight: 18,
        }}>
          {/* the book total reads as a summary panel, not a fifth peer dial */}
          <div style={{
            display: "flex", justifyContent: "center",
            background: "#EDF2F7", border: `1px solid ${LINE}`, borderRadius: 6, padding: "2px 0 6px",
          }}>
            <Gauge label="All Projects" hero {...tally(tasks)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 4px", marginTop: 10 }}>
            {["Live Deals", "AI Projects", "Admin", "Miscellaneous"].map((k) => (
              <div key={k} style={{ display: "flex", justifyContent: "center" }}>{dial(k)}</div>
            ))}
          </div>
        </div>

        <div style={{ flex: "2 1 430px", minWidth: 330, display: "flex", flexDirection: "column" }}>
          {PORTCO_RAIL.map((p, i) => (
            <div key={p.key} style={{
              display: "flex", alignItems: "center", gap: 10,
              // every portco row is the same height whatever its context holds,
              // so the four dials sit on an even pitch down the rail
              minHeight: PORTCO_ROW_H,
              borderTop: i ? `1px solid ${LINE}` : "none",
            }}>
              <div style={{ flexShrink: 0 }}>{dial(p.key)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <ClockCard portco={p.key} />
                {p.weather && <WeatherStrip />}
                <NewsBox nonce={nonce} compact {...p.news} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- portco clocks (top-right corner, next to weather) ----------
const CLOCK_SPOTS = [
  { city: "Sydney", portco: "BravoFit", tz: "Australia/Sydney", flag: "🇦🇺" },
  { city: "London", portco: "IMO", tz: "Europe/London", flag: "🇬🇧" },
  { city: "LA", portco: "Penske", tz: "America/Los_Angeles", flag: "🇺🇸" },
  { city: "Denver", portco: "KEP", tz: "America/Denver", flag: "🇺🇸" },
];

const clockFor = (portco) => CLOCK_SPOTS.find((c) => c.portco === portco) || null;

// One clock, for the portco rail. The portco name is not repeated on the card —
// the dial sitting next to it already names the row. Two lines, not three: the
// flag emoji is gone because Windows composes no flag glyph, so 🇦🇺 rendered as
// a bare "AU" next to the weekday and read like a bug.
function ClockCard({ portco }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000); // re-render every 30s
    return () => clearInterval(id);
  }, []);
  const c = clockFor(portco);
  if (!c) return null;
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: c.tz });
  const day = now.toLocaleDateString([], { weekday: "short", timeZone: c.tz });
  return (
    <div title={`${c.city} local time — ${c.portco}`}
      style={{
        background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 9px",
        textAlign: "center", minWidth: 78, flexShrink: 0,
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: INK, lineHeight: 1.15 }}>{time}</div>
      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.5, color: SOFT, marginTop: 3 }}>
        {day.toUpperCase()} · {c.city.toUpperCase()}
      </div>
    </div>
  );
}

// ---------- weather (top-right corner; Open-Meteo, no API key, cached per day) ----------
// `label` is drawn on the card — no flag emoji, Windows renders those as bare
// letters ("GB", "DE") which reads like a rendering fault rather than a flag.
const WEATHER_SPOTS = [
  { label: "UK", lat: 51.5074, lon: -0.1278 },   // London
  { label: "GERMANY", lat: 52.52, lon: 13.405 }, // Berlin
];
// WMO weather codes -> icon + label
function wxLook(code) {
  if (code === 0) return { icon: "☀️", text: "Clear" };
  if (code <= 2) return { icon: "⛅", text: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", text: "Overcast" };
  if (code === 45 || code === 48) return { icon: "🌫️", text: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", text: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", text: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", text: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "🌧️", text: "Showers" };
  if (code >= 95) return { icon: "⛈️", text: "Storm" };
  return { icon: "🌡️", text: "—" };
}

// "Good weather" day score in [0,1]: 70% dryness, 30% warmth-vs-baseline.
// Severe codes (storms, snow, heavy rain) force dryness to 0.
function wxDayScore(precip, code, temp, baseTemp) {
  const severe =
    code >= 95 || (code >= 71 && code <= 77) || code === 85 || code === 86 || code === 65 || code === 67 || code === 82;
  const dry = severe ? 0 : precip <= 0.5 ? 1 : precip <= 4 ? 0.5 : 0;
  const warm = Math.max(0, Math.min(1, 0.5 + (temp - baseTemp) / 10));
  return 0.7 * dry + 0.3 * warm;
}

// MTD score vs same-calendar-month over the prior 3 years -> % (100 = normal)
function wxFactor(hist, base, month) {
  const inMonth = (dates) => dates.map((d, i) => ({ d, i })).filter((x) => new Date(x.d + "T12:00:00").getMonth() === month);
  const baseDays = inMonth(base.time);
  if (!baseDays.length) return null;
  const baseTemp = baseDays.reduce((s, x) => s + base.temperature_2m_mean[x.i], 0) / baseDays.length;
  const score = (days, src) =>
    days.reduce((s, x) => s + wxDayScore(src.precipitation_sum[x.i] ?? 0, src.weather_code[x.i] ?? 0, src.temperature_2m_mean[x.i] ?? baseTemp, baseTemp), 0) / days.length;
  const histDays = inMonth(hist.time).filter((x) => hist.temperature_2m_mean[x.i] !== null);
  if (histDays.length < 3) return null; // too early in the month to be meaningful
  const baseScore = score(baseDays, base);
  if (!baseScore) return null;
  return Math.round((score(histDays, hist) / baseScore) * 100);
}

function WeatherStrip() {
  const [wx, setWx] = useState(null);
  useEffect(() => {
    (async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      try {
        const cached = JSON.parse(localStorage.getItem("pcc-weather-v2") || "null");
        if (cached && cached.date === today) { setWx(cached.data); return; }
      } catch (e) {}
      try {
        const y = now.getFullYear();
        const results = await Promise.all(
          WEATHER_SPOTS.map(async (s) => {
            const geo = `latitude=${s.lat}&longitude=${s.lon}`;
            // current conditions + this month's daily history (past 31 days covers any MTD)
            const cur = await (await fetch(
              `https://api.open-meteo.com/v1/forecast?${geo}&current=temperature_2m,weather_code&daily=temperature_2m_mean,precipitation_sum,weather_code&past_days=31&forecast_days=1`
            )).json();
            // baseline: prior 3 full years of daily data (filtered to this month client-side)
            const base = await (await fetch(
              `https://archive-api.open-meteo.com/v1/archive?${geo}&start_date=${y - 3}-01-01&end_date=${y - 1}-12-31&daily=temperature_2m_mean,precipitation_sum,weather_code`
            )).json();
            let factor = null;
            try { factor = wxFactor(cur.daily, base.daily, now.getMonth()); } catch (e) {}
            return { label: s.label, temp: Math.round(cur.current.temperature_2m), code: cur.current.weather_code, factor };
          })
        );
        setWx(results);
        localStorage.setItem("pcc-weather-v2", JSON.stringify({ date: today, data: results }));
      } catch (e) {
        /* network blocked or offline — widget simply stays hidden */
      }
    })();
  }, []);

  if (!wx) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {wx.map((w) => {
        const look = wxLook(w.code);
        const fColor = w.factor === null ? FAINT : w.factor >= 100 ? DONE_COLOR : "#B3382C";
        return (
          <div key={w.label}
            title={`${w.label}: ${look.text}, ${w.temp}°C · Weather factor = month-to-date vs same month over the prior 3 years (dryness + warmth heuristic). 100% = normal; higher = drier/hotter than usual; lower = more rain/storm/snow days. Refreshed daily.`}
            style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 8px", textAlign: "center", minWidth: 84, flexShrink: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, color: FAINT }}>{w.label}</div>
            <div style={{ fontSize: 15, lineHeight: 1.2, marginTop: 1 }}>{look.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginTop: 1 }}>{w.temp}°C</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.5, color: SOFT, marginTop: 1 }}>{look.text.toUpperCase()}</div>
            {w.factor !== null && (
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: fColor, marginTop: 2 }}>
                {w.factor >= 100 ? "▲" : "▼"} MTD {w.factor}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- industry news (early education / childcare; refreshed by each sync) ----------
// Live daily quote line (proxied through the dev server; cached per day)
function StockLine({ symbol }) {
  const [q, setQ] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const d = await (await fetch(`/api/stock?symbol=${symbol}`)).json();
        if (!d.error) setQ(d);
      } catch (e) { /* quote unavailable — line hidden */ }
    })();
  }, [symbol]);
  if (!q) return null;
  const up = q.change >= 0;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 2, paddingBottom: 3, borderBottom: `1px solid ${LINE}` }}
      title={`${symbol} last close ${q.price} ${q.currency} (as of ${fmtTime(q.asOf)})`}>
      <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: SOFT }}>{symbol}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>${q.price.toFixed(2)}</span>
      <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: up ? DONE_COLOR : "#B3382C" }}>
        {up ? "▲" : "▼"} {up ? "+" : ""}{q.change.toFixed(2)} ({up ? "+" : ""}{q.pct.toFixed(1)}%)
      </span>
    </div>
  );
}

// `compact` is the portco-rail size: narrower, three headlines instead of four.
// The box always renders — in the rail an absent box would leave a ragged row,
// and "no news yet" is information rather than a reason to disappear.
function NewsBox({ nonce, title, feed = "earlyed", symbol = null, compact = false }) {
  const [news, setNews] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const d = await (await fetch(`/api/news?feed=${feed}`)).json();
        setNews(d);
        setFailed(false);
      } catch (e) {
        setFailed(true); // endpoint absent (e.g. a built bundle) — say so, don't vanish
      }
    })();
  }, [nonce, feed]);

  const items = (news && news.items) || [];
  const limit = compact ? 3 : 4;
  const tone = { positive: DONE_COLOR, negative: "#B3382C", neutral: SOFT };
  const mark = { positive: "▲", negative: "▼", neutral: "▬" };
  const pos = items.filter((i) => i.sentiment === "positive").length;
  const neg = items.filter((i) => i.sentiment === "negative").length;

  return (
    <div style={{
      background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 10px",
      maxWidth: compact ? 300 : 340, minWidth: compact ? 200 : 220,
      // in the rail every box is the same height so the rows stay on an even
      // pitch; a three-item feed and an empty one must not size differently
      ...(compact ? { flex: "1 1 200px", height: 128, overflow: "hidden", display: "flex", flexDirection: "column" } : {}),
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, color: FAINT }}>{title}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>
          <span style={{ color: DONE_COLOR }}>▲{pos}</span> <span style={{ color: "#B3382C" }}>▼{neg}</span>
        </span>
      </div>
      {symbol && <StockLine symbol={symbol} />}
      {items.slice(0, limit).map((it, i) => (
        <a key={i} href={it.url || undefined} target="_blank" rel="noreferrer"
          title={`${it.headline}${it.summary ? ` — ${it.summary}` : ""}${it.source ? ` (${it.source})` : ""}`}
          style={{ display: "flex", gap: 5, marginTop: 3, textDecoration: "none", alignItems: "baseline" }}>
          {/* sentiment · date · summary · jurisdiction */}
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: tone[it.sentiment] || SOFT, flexShrink: 0 }}>
            {mark[it.sentiment] || "▬"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8.5, color: FAINT, flexShrink: 0 }}>
            {it.date ? new Date(it.date + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
          </span>
          <span style={{ fontSize: 10.5, color: INK, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {it.short || it.headline}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: 0.5, marginLeft: "auto", flexShrink: 0,
            color: SOFT, border: `1px solid ${LINE}`, borderRadius: 3, padding: "0 3px",
          }}>
            {it.scope || "—"}
          </span>
        </a>
      ))}
      {items.length === 0 && (
        <div style={{
          fontSize: 10, color: FAINT, marginTop: 3,
          // centre the message in a fixed-height rail box rather than leaving it
          // stranded under the title with dead space below
          ...(compact ? { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" } : {}),
        }}>
          {failed ? "Feed unavailable." : news ? "No matching news this scan." : "Loading…"}
        </div>
      )}
      {news && news.updatedAt && (
        <div style={{ fontFamily: MONO, fontSize: 8, color: FAINT, marginTop: 4 }}>
          scanned {fmtTime(news.updatedAt)}
        </div>
      )}
    </div>
  );
}

// ---------- due pipeline ----------
// horizontal stacked bar: outstanding tasks (everything not complete) by due horizon
// Buckets are calendar weeks, not rolling windows: "this week" runs out to the
// coming Sunday and "next week" is the Mon-Sun block after it, so a task keeps
// its bucket all week and then rolls over on Monday rather than drifting daily.
// Rebuilt per render because the boundary moves with the current weekday.
// Late in the month "next week" can already run past month end, which would leave
// "this month" describing days that are also next week's. Anchoring the month
// bucket to `> wk + 7` keeps the set disjoint and simply empties it in that case;
// "longer" opens at whichever of the two boundaries is further out so no day
// falls through the gap.
function dueSegments() {
  const wk = daysToWeekEnd();
  const me = daysToMonthEnd();
  const beyond = Math.max(wk + 7, me);
  return [
    { key: "today", label: "due today", color: "#C63D2F", test: (n) => n !== null && n <= 0 },
    { key: "week", label: "this week", color: "#D9822B", test: (n) => n !== null && n >= 1 && n <= wk },
    { key: "next", label: "next week", color: "#B58200", test: (n) => n !== null && n > wk && n <= wk + 7 },
    { key: "month", label: "this month", color: "#7A8B99", test: (n) => n !== null && n > wk + 7 && n <= me },
    { key: "later", label: "longer", color: "#64748B", test: (n) => n !== null && n > beyond },
    { key: "none", label: "no date", color: "#C7D0D9", test: (n) => n === null },
  ];
}

// Ingestion-age horizons — dueSegments() pointed backwards. `age` is whole days
// since the task landed (0 = today, 1 = yesterday), and the same Mon-Sun week and
// calendar-month boundaries apply, so "this week" reaches back to the Monday just
// gone rather than a rolling 7 days. Listed oldest-first to match the ascending
// rank sort, so reading the list top to bottom stays monotonic.
// `newestFirst` flips the group order to match LIFO, so reading the list top to
// bottom stays monotonic under either direction.
function ingestSegments(newestFirst) {
  const sinceMonday = 6 - daysToWeekEnd(); // Mon = 0 … Sun = 6
  const sinceMonthStart = new Date().getDate() - 1;
  const beyond = Math.max(sinceMonday, sinceMonthStart);
  const dated = [
    { key: "today", label: "ingested today", color: "#D9822B", test: (a) => a !== null && a <= 0 },
    { key: "week", label: "ingested this week", color: "#B58200", test: (a) => a !== null && a >= 1 && a <= sinceMonday },
    { key: "month", label: "ingested this month", color: "#7A8B99", test: (a) => a !== null && a > sinceMonday && a <= sinceMonthStart },
    { key: "earlier", label: "ingested earlier", color: "#64748B", test: (a) => a !== null && a > beyond },
  ];
  return [
    ...(newestFirst ? dated : [...dated].reverse()),
    { key: "none", label: "no ingest date", color: "#C7D0D9", test: (a) => a === null },
  ];
}
// Whole days since a task was ingested. Uses createdAt, not rank: rank is the
// sort key that manual reordering deliberately scrambles, createdAt is the real
// arrival time.
const ageOf = (t) => {
  const n = daysUntil((t.createdAt || "").slice(0, 10));
  return n === null ? null : -n;
};
// Priority layers, most urgent first — matches the primary key of the priority sort.
const PRI_ORDER = ["high", "medium", "low"];

function DueBar({ tasks }) {
  const eff = (t) => (t.reassignedTo ? t.followUpDate : t.deadline);
  const outstanding = tasks.filter((t) => t.status !== "done");
  const counts = dueSegments().map((s) => ({ ...s, n: outstanding.filter((t) => s.test(daysUntil(eff(t)))).length }));
  const total = outstanding.length;
  const shown = counts.filter((c) => c.n > 0);
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: FAINT }}>
          DUE PIPELINE · {total} OUTSTANDING
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {shown.map((c) => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: SOFT }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: "inline-block" }} />
              {c.n} {c.label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginTop: 6, background: BG }}>
        {total > 0 &&
          shown.map((c, i) => (
            <div key={c.key} title={`${c.n} ${c.label}`}
              style={{ width: `${(c.n / total) * 100}%`, background: c.color, marginRight: i < shown.length - 1 ? 2 : 0 }} />
          ))}
      </div>
    </div>
  );
}

// ---------- component ----------
export default function CommandCenter() {
  const [tasks, setTasks] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [sortBy, setSortBy] = useState("priority"); // priority | project | deadline | fifo | lifo
  const [fStatus, setFStatus] = useState("open"); // open | delegated | done | all
  const [fProject, setFProject] = useState("all");
  const [fAssigned, setFAssigned] = useState("all");

  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [syncProgress, setSyncProgress] = useState(null); // {phase, totalEmails, processed, created, skipped}
  const [syncActivity, setSyncActivity] = useState(null); // {tools, tool, text, at} — live from Claude's stream
  const [syncPct, setSyncPct] = useState(0); // animated bar width
  const [syncElapsed, setSyncElapsed] = useState(0);
  const [findingPath, setFindingPath] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  const [showAdd, setShowAdd] = useState(false);
  const blankDraft = {
    title: "", project: "", priority: "high", deadline: new Date().toISOString().slice(0, 10), deadlineType: "explicit",
    assignedBy: "Myself", addressedTo: "You", askType: "internal", needsCall: false,
    emailBlurb: "", link: "", bucket: null,
  };
  const [customProj, setCustomProj] = useState(false);
  const [bucketMenu, setBucketMenu] = useState(null); // {id, x, y} — right-click recategorize
  const [draft, setDraft] = useState(blankDraft);
  const saveTimer = useRef(null);
  const skipNextSave = useRef(false);

  // undo stack — snapshots of {tasks, lastSync} taken before each dashboard edit
  const history = useRef([]);
  const prevSnap = useRef(null);
  const isUndoing = useRef(false);
  const [undoCount, setUndoCount] = useState(0);

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
    if (skipNextSave.current) {
      // loads (initial, refresh, post-sync) are not edits: reset the baseline, don't save
      skipNextSave.current = false;
      prevSnap.current = { tasks, lastSync };
      return;
    }
    if (isUndoing.current) {
      isUndoing.current = false; // undo itself shouldn't land back on the stack
      prevSnap.current = { tasks, lastSync };
    } else if (prevSnap.current) {
      history.current.push(prevSnap.current);
      if (history.current.length > 25) history.current.shift();
      setUndoCount(history.current.length);
      prevSnap.current = { tasks, lastSync };
    } else {
      prevSnap.current = { tasks, lastSync };
    }
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

  // Kick off /command-center-sync headlessly via the dev server, poll until done,
  // then reload the task file.
  async function runSync() {
    setSyncing(true); setError(""); setSyncNote("");
    const before = tasks.length;
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      if (!r.ok && r.status !== 409) throw new Error(`API ${r.status}`);
      for (;;) {
        await new Promise((s) => setTimeout(s, 900));
        const st = await (await fetch("/api/sync")).json();
        if (st.progress) setSyncProgress(st.progress);
        if (st.activity) setSyncActivity(st.activity);
        if (!st.running) {
          if (st.exitCode !== 0) throw new Error(`Claude sync exited ${st.exitCode} — ${st.tail ? st.tail.slice(-180) : "no output (is the claude CLI on PATH?)"}`);
          break;
        }
      }
      await loadFromFile();
      setSyncNote("Inbox sync complete — dials and list updated.");
    } catch (e) {
      setError(`Sync failed: ${e.message}`);
      try { await loadFromFile(); } catch (_) { /* keep the original error */ }
    } finally { setSyncing(false); setSyncProgress(null); setSyncActivity(null); }
  }

  // Latest poll results, read by the animation loop without restarting it.
  const progressRef = useRef(null);
  const activityRef = useRef(null);
  useEffect(() => { progressRef.current = syncProgress; }, [syncProgress]);
  useEffect(() => { activityRef.current = syncActivity; }, [syncActivity]);

  // Animate the bar: ease toward a real target, and keep creeping while Claude
  // works between updates so it never looks frozen. Depends ONLY on `syncing`,
  // or the interval (and the elapsed clock) would reset on every poll.
  useEffect(() => {
    if (!syncing) { setSyncPct(0); setSyncElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => {
      setSyncElapsed(Math.round((Date.now() - started) / 1000));
      setSyncPct((p) => {
        const pr = progressRef.current;
        const em = pr && pr.totalEmails ? (pr.processed / pr.totalEmails) * 100 : 0;
        // tool-count fallback: asymptotic, so more work = more bar without ever finishing early
        const tools = (activityRef.current && activityRef.current.tools) || 0;
        const byTools = (1 - Math.exp(-tools / 14)) * 80;
        const target = Math.max(em, byTools, 3);
        if (p < target) return Math.min(target, p + Math.max(0.5, (target - p) * 0.2));
        return Math.min(p + 0.12, 96); // idle creep, capped short of 100
      });
    }, 250);
    return () => clearInterval(id);
  }, [syncing]);

  async function findPath() {
    setFindingPath(true); setError("");
    try {
      const r = await fetch("/api/find-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, project: draft.project, blurb: draft.emailBlurb, bucket: bucketFor(draft.project).key }),
      });
      const d = await r.json();
      if (d.path) setDraft((p) => ({ ...p, link: d.path }));
      else setError(`Egnyte lookup: ${d.error || "no path found"}`);
    } catch (e) {
      setError(`Egnyte lookup failed: ${e.message}`);
    } finally { setFindingPath(false); }
  }

  const projects = [...new Set(tasks.map((t) => t.project))].sort();
  const assigners = [...new Set(tasks.map((t) => t.assignedBy).filter(Boolean))].sort();

  // ---------- mutations ----------
  const update = (id, patch) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));
  const toggleExpand = (id) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function undo() {
    const snap = history.current.pop();
    if (!snap) return;
    setUndoCount(history.current.length);
    isUndoing.current = true;
    setTasks(snap.tasks);
    setLastSync(snap.lastSync);
  }

  // +1d/+3d stack: each click pushes the current draft deadline further out
  function bumpDeadline(n) {
    setDraft((p) => {
      const base = p.deadline ? new Date(p.deadline + "T12:00:00") : new Date();
      base.setDate(base.getDate() + n);
      return { ...p, deadline: base.toISOString().slice(0, 10) };
    });
  }

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
    setCustomProj(false);
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
  // set a due date n days from today (used by the +1/+3/+7 buttons on dateless tasks)
  function setDueIn(t, n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const key = t.reassignedTo ? "followUpDate" : "deadline";
    const patch = { [key]: d.toISOString().slice(0, 10) };
    if (key === "deadline") patch.deadlineType = "explicit";
    update(t.id, patch);
  }

  // shift the task's effective date (follow-up if delegated, else deadline) by n days
  function snooze(t, n = 1) {
    const key = t.reassignedTo ? "followUpDate" : "deadline";
    const cur = t[key];
    const base = cur ? new Date(cur + "T12:00:00") : new Date();
    base.setDate(base.getDate() + n);
    update(t.id, { [key]: base.toISOString().slice(0, 10) });
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
    if (fProject !== "all" && t.project !== fProject) return false;
    if (fAssigned !== "all" && t.assignedBy !== fAssigned) return false;
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
    // portco buckets in fixed order, subprojects clustered alphabetically within their bucket
    project: (a, b) => bucketRank(a) - bucketRank(b) || a.project.localeCompare(b.project) || PRI[a.priority] - PRI[b.priority],
    fifo: (a, b) => a.rank - b.rank, // oldest ingested first
    lifo: (a, b) => b.rank - a.rank, // newest ingested first
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

  // Every sort lays its list out under headers. Each definition carries its own
  // colour, and `visible` is already sorted, so filtering per group keeps each
  // group internally ordered by that sort's key. Group order always follows the
  // sort direction so reading top to bottom stays monotonic.
  let groupDefs;
  if (sortBy === "project") {
    // dial bucket (portcos first); subprojects stay clustered inside each bucket
    // because `visible` is already bucket->project sorted, and each card's
    // bottom-right chip names its specific subproject (e.g. "IMO / Sea Lion")
    groupDefs = BUCKET_ORDER.map((k) => ({
      name: k,
      color: (bucketByKey(k) || {}).color || SOFT,
      match: (t) => bucketFor(t.project, t.bucket).key === k,
    }));
  } else if (sortBy === "deadline") {
    // same horizons as the due pipeline bar, in the same order — the list reads
    // as the bar expanded
    groupDefs = dueSegments().map((s) => ({
      name: s.label,
      color: s.color,
      match: (t) => s.test(daysUntil(effDate(t))),
    }));
  } else if (sortBy === "priority") {
    groupDefs = PRI_ORDER.map((p) => ({
      name: `${p} priority`,
      color: PRI_COLOR[p],
      match: (t) => t.priority === p,
    }));
  } else {
    groupDefs = ingestSegments(sortBy === "lifo").map((s) => ({
      name: s.label,
      color: s.color,
      match: (t) => s.test(ageOf(t)),
    }));
  }
  const groups = groupDefs
    .map((g) => ({ name: g.name, color: g.color, items: visible.filter(g.match) }))
    .filter((g) => g.items.length > 0);

  // Hand-reordering only makes sense in the ingestion orders. LIFO renders rank
  // descending, so the arrows must push the opposite way to still read as up/down.
  const reorderable = REORDERABLE.includes(sortBy);
  const moveDir = sortBy === "lifo" ? -1 : 1;

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

      {/* ---- right-click: change a task's dial category ---- */}
      {bucketMenu && (() => {
        const t = tasks.find((x) => x.id === bucketMenu.id);
        if (!t) return null;
        const cur = bucketFor(t.project, t.bucket);
        const pick = (key) => { update(t.id, { bucket: key }); setBucketMenu(null); };
        return (
          <div onClick={() => setBucketMenu(null)} onContextMenu={(e) => { e.preventDefault(); setBucketMenu(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 60 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: Math.min(bucketMenu.y, window.innerHeight - 300),
                left: Math.min(bucketMenu.x, window.innerWidth - 210),
                background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: 5, minWidth: 190,
                boxShadow: "0 8px 24px rgba(22,32,43,0.22)",
              }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: FAINT, padding: "3px 6px 5px" }}>
                CATEGORY · {t.project.toUpperCase()}
              </div>
              {BUCKET_ORDER.map((k) => {
                const b = bucketByKey(k);
                const active = cur.key === k;
                return (
                  <button key={k} onClick={() => pick(k)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left",
                      background: active ? BG : "none", border: "none", borderRadius: 4, cursor: "pointer",
                      padding: "5px 6px", fontSize: 12, fontFamily: SANS, color: INK, fontWeight: active ? 700 : 400,
                    }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: b.color, display: "inline-block", flexShrink: 0 }} />
                    {k}{active ? " ✓" : ""}
                  </button>
                );
              })}
              <button onClick={() => { update(t.id, { bucket: null }); setBucketMenu(null); }}
                style={{
                  display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
                  borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 6, paddingLeft: 6, paddingBottom: 3,
                  cursor: "pointer", fontSize: 11, fontFamily: SANS, color: SOFT,
                }}>
                ↺ Auto-detect from project name
              </button>
            </div>
          </div>
        );
      })()}

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

      {/* widened from 920 so the IMO row (clock + two weather cards + news) fits
          on one line instead of wrapping and making that row taller than its peers */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>

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
                  last inbox sync: {fmtTime(lastSync)} · ↻ Refresh runs <b>/command-center-sync</b> via Claude Code
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* speed dials — clocks, weather and news now ride in the portco rail */}
        <DialRow tasks={tasks} nonce={lastSync} />

        {/* due pipeline */}
        <DueBar tasks={tasks} />

        {/* action bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center", marginTop: 10 }}>
          <button style={{ ...btn(true), opacity: syncing ? 0.85 : 1 }} onClick={runSync} disabled={syncing}>
            {syncing ? (<><Spinner /> Syncing inbox via Claude…</>) : "↻ Refresh (sync inbox)"}
          </button>
          <button style={btn(false)} onClick={() => setShowAdd(!showAdd)}>+ Task</button>
          <button style={{ ...btn(false), opacity: undoCount === 0 ? 0.45 : 1, cursor: undoCount === 0 ? "default" : "pointer" }}
            onClick={undo} disabled={undoCount === 0}
            title={undoCount === 0 ? "Nothing to undo" : `Reverse the most recent change (${undoCount} step${undoCount > 1 ? "s" : ""} available)`}>
            ↶ Undo
          </button>
          <button style={btn(false)} onClick={openExport} title="Export / restore a backup of your list">⇄ Backup</button>
        </div>

        {/* live sync progress — fed by data/sync-progress.json, written by the skill as it triages */}
        {syncing && (
          <div style={{ background: "#EDF2F7", border: `1px solid ${LINE}`, borderRadius: 4, padding: "10px 14px", marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontSize: 11, fontFamily: MONO, color: SOFT, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: INK }}>
                {(syncActivity && syncActivity.tool) ||
                  (syncProgress && syncProgress.phase === "searching" && "Searching the inbox") ||
                  "Starting Claude & connecting to Outlook"}
                <span style={{ animation: "pccPulse 1.2s ease-in-out infinite" }}>…</span>
              </span>
              <span>
                {syncProgress && syncProgress.totalEmails
                  ? `email ${syncProgress.processed}/${syncProgress.totalEmails} · `
                  : ""}
                {syncActivity && syncActivity.tools ? `${syncActivity.tools} steps · ` : ""}
                {Math.floor(syncElapsed / 60)}m{String(syncElapsed % 60).padStart(2, "0")}s
              </span>
            </div>
            <div style={{ height: 8, background: "#DCE3EA", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                borderRadius: 4,
                transition: "width 0.3s linear",
                background: INK,
                width: `${Math.max(syncPct, 3)}%`,
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 10.5, color: SOFT, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {(syncActivity && syncActivity.text) || "Claude is reading your mailbox and triaging what needs your action."}
              </span>
              {syncProgress && (syncProgress.created || syncProgress.skipped) ? (
                <span style={{ fontFamily: MONO, fontSize: 10, color: SOFT, whiteSpace: "nowrap" }}>
                  {syncProgress.created} kept · {syncProgress.skipped} skipped
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* notices */}
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

        {/* add form — full detail parity with synced tasks */}
        {showAdd && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: 16, marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <input placeholder="Task title *" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ ...sel, padding: 8, gridColumn: "1 / -1" }} />
              <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
                <select
                  value={customProj ? "__new__" : draft.project}
                  onChange={(e) => {
                    if (e.target.value === "__new__") { setCustomProj(true); setDraft({ ...draft, project: "" }); }
                    else { setCustomProj(false); setDraft({ ...draft, project: e.target.value }); }
                  }}
                  style={{ ...sel, padding: 8, flex: 1, minWidth: 0 }}>
                  <option value="">— Deal / project —</option>
                  {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="__new__">+ New project…</option>
                </select>
                {customProj && (
                  <input autoFocus placeholder="New project name" value={draft.project}
                    onChange={(e) => setDraft({ ...draft, project: e.target.value })}
                    style={{ ...sel, padding: 8, flex: 1, minWidth: 0 }} />
                )}
              </div>
              {/* dial category — defaults to auto-detect from the project name */}
              <select value={draft.bucket || ""} onChange={(e) => setDraft({ ...draft, bucket: e.target.value || null })}
                title="Which speed dial this task counts toward"
                style={{ ...sel, padding: 8, borderColor: bucketFor(draft.project, draft.bucket).color, fontWeight: 600 }}>
                <option value="">Category: auto ({bucketFor(draft.project, draft.bucket).key})</option>
                {BUCKET_ORDER.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <input placeholder="Assigned by (who's asking)" value={draft.assignedBy} onChange={(e) => setDraft({ ...draft, assignedBy: e.target.value })} style={{ ...sel, padding: 8 }} />
              <input placeholder="Addressed to (You / You + team)" value={draft.addressedTo} onChange={(e) => setDraft({ ...draft, addressedTo: e.target.value })} style={{ ...sel, padding: 8 }} />
              <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                style={{ ...sel, color: PRI_COLOR[draft.priority], fontWeight: 700, borderColor: PRI_COLOR[draft.priority] }}>
                <option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>
              </select>
              <select value={draft.askType} onChange={(e) => setDraft({ ...draft, askType: e.target.value })} style={sel}>
                <option value="internal">Internal ask</option><option value="external">External ask</option>
              </select>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", gridColumn: "span 2", minWidth: 0 }}>
                <input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} style={{ ...sel, flex: "1 1 120px", minWidth: 110 }} />
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: INK, minWidth: 30, textAlign: "center" }} title="Day of the week for the chosen date">
                  {weekdayOf(draft.deadline) || "—"}
                </span>
                <button type="button" style={{ ...sel, cursor: "pointer", fontWeight: 600 }} title="Push deadline out 1 day (stacks)" onClick={() => bumpDeadline(1)}>+1d</button>
                <button type="button" style={{ ...sel, cursor: "pointer", fontWeight: 600 }} title="Push deadline out 3 days (stacks)" onClick={() => bumpDeadline(3)}>+3d</button>
                <select value={draft.deadlineType} onChange={(e) => setDraft({ ...draft, deadlineType: e.target.value })} style={sel}>
                  <option value="explicit">Explicit</option><option value="implicit">Implicit</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: SOFT, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={draft.needsCall} onChange={(e) => setDraft({ ...draft, needsCall: e.target.checked })} />
                Needs a call first
              </label>
              <div style={{ display: "flex", gap: 6, gridColumn: "1 / -1", alignItems: "center" }}>
                <input placeholder="Link / file path (optional)" value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} style={{ ...sel, padding: 8, flex: 1, fontFamily: MONO, fontSize: 11 }} />
                <button type="button" style={{ ...btn(false), fontSize: 12, whiteSpace: "nowrap" }} onClick={findPath} disabled={findingPath}
                  title="Ask Claude to search Egnyte for the likeliest file path based on title, project, and details">
                  {findingPath ? (<><Spinner color={INK} /> Searching Egnyte…</>) : "🔎 Find in Egnyte"}
                </button>
              </div>
              <textarea placeholder="Details / blurb (optional)" value={draft.emailBlurb} onChange={(e) => setDraft({ ...draft, emailBlurb: e.target.value })} rows={2} style={{ ...sel, padding: 8, gridColumn: "1 / -1", fontFamily: SANS, resize: "vertical" }} />
            </div>
            <button style={{ ...btn(true), marginTop: 10 }} onClick={addManual}>Add task</button>
          </div>
        )}

        {/* filter bar: sort cycler · status cycler · project filter · assigned-by filter */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, margin: "18px 0 10px" }}>
          <button onClick={() => setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length])}
            title="Click to cycle sort: priority → project → deadline → FIFO (oldest ingested first) → LIFO (newest ingested first)"
            style={{ ...btn(false), padding: "5px 12px", fontSize: 12 }}>
            ⇅ Sort: <b>{SORT_LABEL[sortBy]}</b>
          </button>
          <button onClick={() => setFStatus(STATUS_CYCLE[(STATUS_CYCLE.indexOf(fStatus) + 1) % STATUS_CYCLE.length])}
            title="Click to cycle view: On Alex/Open → Delegated → Completed → All"
            style={{ ...btn(false), padding: "5px 12px", fontSize: 12, background: INK, color: "#fff", border: `1px solid ${INK}` }}>
            {STATUS_LABEL[fStatus]}
          </button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <select value={fProject} onChange={(e) => setFProject(e.target.value)}
              style={{ ...sel, borderColor: fProject !== "all" ? INK : LINE, fontWeight: fProject !== "all" ? 600 : 400 }}
              title="Filter by deal/project">
              <option value="all">All deals/projects</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {fProject !== "all" && (
              <button onClick={() => setFProject("all")} title="Clear project filter"
                style={{ ...sel, cursor: "pointer", padding: "4px 7px", fontWeight: 700, color: "#8C3226" }}>
                ✕
              </button>
            )}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <select value={fAssigned} onChange={(e) => setFAssigned(e.target.value)}
              style={{ ...sel, borderColor: fAssigned !== "all" ? INK : LINE, fontWeight: fAssigned !== "all" ? 600 : 400 }}
              title="Filter by who assigned the task">
              <option value="all">Assigned by anyone</option>
              {assigners.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {fAssigned !== "all" && (
              <button onClick={() => setFAssigned("all")} title="Clear assigned-by filter"
                style={{ ...sel, cursor: "pointer", padding: "4px 7px", fontWeight: 700, color: "#8C3226" }}>
                ✕
              </button>
            )}
          </span>
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
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.5, color: SOFT, margin: "22px 0 8px", borderBottom: `1px solid ${LINE}`, paddingBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color || SOFT, display: "inline-block" }} />
                {g.name.toUpperCase()} <span style={{ color: FAINT }}>({g.items.length})</span>
              </div>
            )}
            {g.items.map((t) => {
              const isOpen = expanded.has(t.id);
              const done = t.status === "done";
              const railColor = done ? DONE_COLOR : t.reassignedTo ? DELEGATED : PRI_COLOR[t.priority];
              const bucket = bucketFor(t.project, t.bucket);
              const dChip = t.reassignedTo
                ? chipFor(t.followUpDate, "FOLLOW UP")
                : chipFor(t.deadline, "DUE");
              return (
                <div key={t.id} style={{
                  background: t.reassignedTo && !done ? "#F7F7FC" : CARD,
                  border: `1px solid ${t.reassignedTo && !done ? "#D5D6EC" : LINE}`,
                  borderLeft: `6px solid ${railColor}`,
                  borderRight: `6px solid ${bucket.color}`,
                  borderRadius: 6, marginBottom: 8, opacity: done ? 0.55 : 1,
                }}>
                  {/* ---- overview row ---- */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px" }}>
                    <button onClick={() => update(t.id, { status: STATUS_NEXT[t.status] })}
                      onContextMenu={(e) => { e.preventDefault(); if (t.status !== "todo") update(t.id, { status: "todo" }); }}
                      title={t.status === "todo" ? "Click: start (in progress)" : t.status === "progress" ? "Click: complete · Right-click: back to to-do" : "Click or right-click: reopen"}
                      style={{
                        width: 22, height: 22, borderRadius: "50%", marginTop: 2, flexShrink: 0, cursor: "pointer",
                        border: `2px solid ${done ? DONE_COLOR : t.status === "progress" ? PROGRESS_COLOR : FAINT}`,
                        background: done ? DONE_COLOR : t.status === "progress" ? `linear-gradient(90deg,${PROGRESS_COLOR} 50%,transparent 50%)` : "transparent",
                        color: "#fff", fontSize: 13, lineHeight: "18px", padding: 0,
                      }}>
                      {done ? "✓" : ""}
                    </button>

                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: 10, rowGap: 5, alignItems: "start" }} onClick={() => toggleExpand(t.id)}>
                      {/* top left: title */}
                      <div style={{ fontSize: 15, fontWeight: 600, textDecoration: done ? "line-through" : "none", minWidth: 0 }}>
                        {t.title}
                      </div>
                      {/* top right: labels */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                        <span style={tag(t.askType === "external" ? "#7A4A1F" : SOFT, false)}>
                          {t.askType === "external" ? "EXT" : "INT"}
                        </span>
                        {t.needsCall && !done && <span style={tag("#1F5E7A", false)}>📞 CALL FIRST</span>}
                        {t.reassignedTo && !done && <span style={tag(DELEGATED, true)}>WITH {t.reassignedTo.toUpperCase()}</span>}
                        {t.status === "progress" && !done && (
                          <span style={{ fontFamily: MONO, fontSize: 10, color: PROGRESS_COLOR, fontWeight: 700 }}>IN PROGRESS</span>
                        )}
                      </div>
                      {/* bottom left: from -> to, due date + snooze */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                        {t.assignedBy && (
                          <span style={{ fontSize: 11, color: SOFT }}>
                            <b>{t.assignedBy}</b> → {t.addressedTo || "You"}
                          </span>
                        )}
                        {dChip && (
                          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: dChip.color, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {dChip.text}
                            {!done && (
                              <>
                                <button title="Snooze: push the date out one day"
                                  onClick={(e) => { e.stopPropagation(); snooze(t, 1); }}
                                  style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 3, cursor: "pointer", fontSize: 9, lineHeight: 1.4, padding: "0 4px", color: SOFT }}>
                                  💤+1d
                                </button>
                                <button title="Unsnooze: pull the date in one day"
                                  onClick={(e) => { e.stopPropagation(); snooze(t, -1); }}
                                  style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 3, cursor: "pointer", fontSize: 9, lineHeight: 1.4, padding: "0 4px", color: SOFT }}>
                                  ⏰-1d
                                </button>
                              </>
                            )}
                          </span>
                        )}
                        {!dChip && !done && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: MONO, fontSize: 9, color: FAINT }}>
                            DUE:
                            {[1, 3, 7].map((n) => (
                              <button key={n} title={`Set due date ${n} day${n > 1 ? "s" : ""} from today`}
                                onClick={(e) => { e.stopPropagation(); setDueIn(t, n); }}
                                style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 3, cursor: "pointer", fontSize: 9, lineHeight: 1.4, padding: "0 4px", color: SOFT }}>
                                +{n}d
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                      {/* bottom right: project category (right-click to recategorize) */}
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <span
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setBucketMenu({ id: t.id, x: e.clientX, y: e.clientY }); }}
                          title={`${bucket.key}${t.bucket ? " (set manually)" : " (auto from project name)"} — right-click to change category`}
                          style={{ fontFamily: MONO, fontSize: 10, color: SOFT, background: BG, border: `1px solid ${bucket.color}`, borderRadius: 3, padding: "1px 6px", display: "inline-flex", alignItems: "center", gap: 5, cursor: "context-menu" }}>
                          <span style={{ width: 7, height: 7, borderRadius: 2, background: bucket.color, display: "inline-block" }} />
                          {t.project}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                      {reorderable && (
                        <>
                          <button style={{ ...sel, cursor: "pointer" }} onClick={() => move(t.id, -moveDir)} title="Move up">↑</button>
                          <button style={{ ...sel, cursor: "pointer" }} onClick={() => move(t.id, moveDir)} title="Move down">↓</button>
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
          Inbox sync + per-task research run in Claude Code (/command-center-sync, /command-center-research) · circle: click advances, right-click resets to to-do · purple = delegated, tracked by follow-up date · saved to data/tasks.json, history in git.
        </div>
      </div>
    </div>
  );
}
