// Puts the dashboard on Alex's phone (TODO CC-6).
//
//   npm run remote       — Cloudflare quick tunnel: works anywhere, on any network
//   npm run remote:lan   — plain LAN address: phone must be on the same wifi
//
// Both start the same dev server the desk already runs, with PCC_REMOTE set so
// vite.config.js puts a token gate in front of it, then print a magic link and a
// QR code to scan. Compute stays on this laptop, so the Refresh and Research
// buttons keep working — which is the whole reason for the tunnel rather than
// hosting the UI somewhere (CC-6 option B). The laptop has to be awake.
//
// Ctrl-C stops the tunnel and the dev server together.

import fs from "fs";
import os from "os";
import net from "net";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import qrcode from "qrcode-terminal";

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKEN_FILE = path.join(here, "data", ".remote-token");
const PORT = Number(process.env.PORT || 5173);
const LAN = process.argv.includes("--lan");

const C = { dim: "\x1b[2m", bold: "\x1b[1m", cyan: "\x1b[36m", red: "\x1b[31m", off: "\x1b[0m" };
const say = (s = "") => console.log(s);

// ---------- the shared secret ----------
// One long-lived token in data/.remote-token (gitignored). Delete the file to
// revoke every phone at once; the next run mints a new one.
function ensureToken() {
  try {
    const existing = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    if (existing.length >= 20) return existing;
  } catch (e) {}
  const token = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(TOKEN_FILE, token + "\n", { mode: 0o600 });
  say(`${C.dim}minted a new access key -> data/.remote-token${C.off}`);
  return token;
}

// ---------- cloudflared ----------
// Portable exe under ~/Tools, same pattern as the portable Node install — this
// machine has no admin rights, so nothing here may need an installer.
const CF_DIR = path.join(os.homedir(), "Tools", "cloudflared");
const CF_BIN = path.join(CF_DIR, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const CF_ASSET = {
  "win32-x64": "cloudflared-windows-amd64.exe",
  "win32-ia32": "cloudflared-windows-386.exe",
  "linux-x64": "cloudflared-linux-amd64",
  "linux-arm64": "cloudflared-linux-arm64",
};

async function ensureCloudflared() {
  if (fs.existsSync(CF_BIN)) return CF_BIN;
  const asset = CF_ASSET[`${process.platform}-${process.arch}`];
  if (!asset) {
    fail(`No portable cloudflared build for ${process.platform}/${process.arch}.`,
      "Install it by hand and put it on PATH, or use `npm run remote:lan` on the same wifi.");
  }
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  say(`${C.dim}downloading cloudflared -> ${CF_BIN}${C.off}`);
  fs.mkdirSync(CF_DIR, { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`Couldn't download cloudflared (HTTP ${res.status}).`, `Tried: ${url}`);
  const tmp = `${CF_BIN}.part`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, CF_BIN);
  return CF_BIN;
}

// ---------- the dev server ----------
function startVite(mode) {
  const bin = path.join(here, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(bin)) fail("Vite isn't installed.", "Run `npm install` first.");
  const child = spawn(process.execPath, [bin, "--port", String(PORT), "--strictPort"], {
    cwd: here,
    stdio: "inherit",
    env: { ...process.env, PCC_REMOTE: mode },
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      say(`${C.red}the dev server exited (${code})${C.off}`);
      shutdown(code);
    }
  });
  return child;
}

function waitForPort(port, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect({ host: "127.0.0.1", port });
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error(`nothing listening on ${port}`));
        else setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

// ---------- the tunnel ----------
// A quick tunnel needs no Cloudflare account, but its hostname is random and
// changes every run — hence the QR code rather than a bookmark (CC-34).
function startTunnel(bin) {
  const child = spawn(bin, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], {
    cwd: here,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    let noise = "";
    const scan = (chunk) => {
      const text = String(chunk);
      noise += text;
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m && !settled) { settled = true; resolve({ child, url: m[0] }); }
    };
    child.stdout.on("data", scan);
    child.stderr.on("data", scan); // cloudflared logs the URL to stderr
    child.on("exit", (code) => {
      if (!settled) { settled = true; reject(new Error(`cloudflared exited ${code}\n${noise.slice(-600)}`)); }
      else { say(`${C.red}the tunnel closed (${code}) — Ctrl-C and start again${C.off}`); }
    });
    setTimeout(() => {
      if (!settled) { settled = true; reject(new Error(`cloudflared never printed a URL\n${noise.slice(-600)}`)); }
    }, 45000);
  });
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return null;
}

// ---------- run ----------
const children = [];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill(); } catch (e) {} }
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => { say(); say(`${C.dim}stopping the tunnel and the dev server…${C.off}`); shutdown(0); });
process.on("SIGTERM", () => shutdown(0));

function fail(msg, hint) {
  say(`${C.red}${msg}${C.off}`);
  if (hint) say(`${C.dim}${hint}${C.off}`);
  shutdown(1);
  throw new Error(msg);
}

function banner(link, where) {
  const rule = "─".repeat(58);
  say();
  say(rule);
  say(`  ${C.bold}Command Center is reachable ${where}${C.off}`);
  say();
  say(`  ${C.cyan}${link}${C.off}`);
  say();
  say(`  ${C.dim}Scan this on the phone — the key is in the link, and the first${C.off}`);
  say(`  ${C.dim}load swaps it for a cookie that lasts 30 days.${C.off}`);
  say(rule);
  qrcode.generate(link, { small: true });
  say(`${C.dim}Keep this window open and the laptop awake. Ctrl-C stops both.${C.off}`);
  say(`${C.dim}Revoke every phone: delete data/.remote-token and restart.${C.off}`);
  say();
}

const token = ensureToken();
children.push(startVite(LAN ? "lan" : "tunnel"));
try {
  await waitForPort(PORT);
} catch (e) {
  fail(`The dev server never came up on port ${PORT}.`, String(e.message));
}

if (LAN) {
  const ip = lanAddress();
  if (!ip) fail("No LAN address found on this machine.", "Use `npm run remote` (tunnel) instead.");
  banner(`http://${ip}:${PORT}/?k=${token}`, "on this wifi");
} else {
  const bin = await ensureCloudflared();
  let tunnel;
  try {
    tunnel = await startTunnel(bin);
  } catch (e) {
    fail("Couldn't open the Cloudflare tunnel.", String(e.message));
  }
  children.push(tunnel.child);
  banner(`${tunnel.url}/?k=${token}`, "from anywhere");
}
