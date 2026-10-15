// agent-skill-forx — browser layer.
//
// Two ways to reach a signed-in X session, both driven by the user's OWN
// browser profile (never a headless fingerprint, never a stored password):
//
//   1) attach  — connect to an already-running browser that exposes a CDP
//                endpoint (Edge/Chrome started with --remote-debugging-port).
//   2) launch  — start an ISOLATED copy of the user's browser profile with its
//                own debug port, so the daily browser is never disturbed.
//
// Real binary + real TLS fingerprint + real cookies + the user's home IP is
// exactly what makes this look like a person, so we deliberately do NOTHING
// to fake or override the fingerprint.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { resolve, join } from 'node:path';
import http from 'node:http';

const DEFAULT_PORT = 9222;

// Well-known install locations per platform. First existing wins.
export function findBrowserPath(kind = 'auto') {
  const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = {
    edge: [
      join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
    ],
    chrome: [
      join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ],
  };
  const order = kind === 'auto' ? ['edge', 'chrome'] : [kind];
  for (const k of order) {
    for (const p of candidates[k] || []) if (existsSync(p)) return { path: p, browser: k };
  }
  return null;
}

// Where the user's real profile lives (used only as the COPY source).
export function profileSource(browser, profileName = 'Default') {
  if (platform() === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    const root = browser === 'chrome'
      ? join(local, 'Google', 'Chrome', 'User Data')
      : join(local, 'Microsoft', 'Edge', 'User Data');
    return { root, profile: join(root, profileName) };
  }
  if (platform() === 'darwin') {
    const base = join(homedir(), 'Library', 'Application Support');
    const root = browser === 'chrome' ? join(base, 'Google', 'Chrome') : join(base, 'Microsoft Edge');
    return { root, profile: join(root, profileName) };
  }
  const base = join(homedir(), '.config');
  const root = browser === 'chrome' ? join(base, 'google-chrome') : join(base, 'microsoft-edge');
  return { root, profile: join(root, profileName) };
}

function cdpGet(port, path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 3000 }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(d));
    });
    req.on('error', rej);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

export async function isCdpUp(port = DEFAULT_PORT) {
  try { const t = await cdpGet(port, '/json/version'); return /webSocketDebuggerUrl/.test(t); }
  catch { return false; }
}

export async function waitForCdp(port = DEFAULT_PORT, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpUp(port)) return true;
    await sleep(1000);
  }
  return false;
}

// Start an isolated browser (its own --user-data-dir under the caller's data
// root). Never touches the user's daily window.
export function launchIsolated({ exe, profileDir, port = DEFAULT_PORT }) {
  const dir = resolve(profileDir);
  if (!existsSync(dir)) throw new Error(`Profile copy missing: ${dir} (run copy-profile first)`);
  const args = [
    `--user-data-dir=${dir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-restore-last-session',
    '--disable-session-crashed-bubble',
    '--window-position=0,0',
    '--window-size=1280,900',
  ];
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return child;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Resolve a live browser + page. `session` describes how to get there:
//   { mode: 'attach', port }                      -> require an existing CDP
//   { mode: 'launch', exe, profileDir, port }     -> start isolated then attach
//   { mode: 'auto', exe, profileDir, port }       -> attach if up, else launch
// Returns { browser, ctx, page, mode }.
export async function connect(session = {}) {
  const port = session.port || DEFAULT_PORT;
  const mode = session.mode || 'auto';
  const { chromium } = await import('playwright');

  let up = await isCdpUp(port);
  let launched = false;
  if (!up && mode !== 'attach') {
    const exe = session.exe || findBrowserPath(session.browser || 'auto')?.path;
    if (!exe) throw new Error('No browser binary found; pass session.exe or install Edge/Chrome');
    if (!session.profileDir) throw new Error('launch mode needs a profileDir (a copied profile)');
    launchIsolated({ exe, profileDir: session.profileDir, port });
    launched = true;
    up = await waitForCdp(port, 40000);
    if (!up) throw new Error(`Browser did not expose CDP on port ${port}`);
  }
  if (!up) throw new Error(`No CDP endpoint on port ${port}; start the browser with --remote-debugging-port or set mode:'launch'`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = ctx.pages().find((p) => /x\.com|twitter\.com/.test(p.url())) || ctx.pages()[0] || await ctx.newPage();
  return { browser, ctx, page, mode: launched ? 'launched' : 'attached' };
}

export async function workPage(ctx) {
  const pages = ctx.pages();
  return pages.find((p) => /x\.com|twitter\.com/.test(p.url())) || pages[0] || await ctx.newPage();
}

export async function closeBrowser(browser) { try { await browser.close(); } catch {} }

export { DEFAULT_PORT };