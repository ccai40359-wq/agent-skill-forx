// Generate docs/assets/cover.png (1600x900) and docs/assets/social-preview.png
// (1280x640) for agent-skill-forx. Uses the LOCAL playwright chromium build
// (no download, no paid API, no new dependencies).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const outDir = fileURLToPath(new URL('../docs/assets/', import.meta.url));
await mkdir(outDir, { recursive: true });

function findChromium() {
  const cache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (!existsSync(cache)) return null;
  let dirs;
  try { dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)); } catch { return null; }
  dirs.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = join(cache, d, 'chrome-win64', 'chrome.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

function html(w, h, dark, subtle, accent) {
  const tagline = 'Human-like X (Twitter) operations for AI agents';
  const cjk = '像真人一样操作 X';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${w}px; height: ${h}px; overflow: hidden;
      background: ${dark}; color: #e7e9ee;
      font-family: 'Segoe UI', -apple-system, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      display: flex; align-items: center; justify-content: center; }
    .card { width: 86%; height: 78%; border-radius: 28px; padding: 5% 6%;
      background: linear-gradient(145deg, ${dark} 0%, ${subtle} 100%);
      border: 1px solid rgba(255,255,255,0.09);
      box-shadow: 0 30px 80px rgba(0,0,0,0.55);
      display: flex; flex-direction: column; }
    .top { display: flex; justify-content: space-between; align-items: center; }
    .badge { font-size: ${w >= 1500 ? 15 : 12}px; letter-spacing: 2.5px; color: #8b93a7; text-transform: uppercase; }
    .xmark { width: ${w >= 1500 ? 34 : 27}px; height: ${w >= 1500 ? 34 : 27}px; color: ${accent}; opacity: 0.92; }
    .name { font-size: ${w >= 1500 ? 64 : 50}px; font-weight: 700; letter-spacing: -1px; color: #fff; margin-top: 4%; }
    .tagline { font-size: ${w >= 1500 ? 27 : 21}px; font-weight: 400; color: #b8c0d0; margin-top: 2.4%; }
    .cjk { font-size: ${w >= 1500 ? 34 : 27}px; font-weight: 600; color: ${accent}; margin-top: 3.2%; }
    .meta { margin-top: auto; font-size: ${w >= 1500 ? 15 : 12}px; color: #6f7890; letter-spacing: 1.2px; }
  </style></head><body>
    <div class="card">
      <div class="top">
        <div class="badge">Agent Skill &bull; MCP &bull; CDP</div>
        <svg class="xmark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/></svg>
      </div>
      <div class="name">agent-skill-forx</div>
      <div class="tagline">${tagline}</div>
      <div class="cjk">${cjk}</div>
      <div class="meta">LIKE &middot; SCROLL &middot; FOLLOW &middot; QUOTE &middot; REPLY &middot; POST</div>
    </div>
  </body></html>`;
}

async function render(viewport, file, opts) {
  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  try {
    const page = await browser.newPage({ viewport });
    await page.setContent(html(viewport.width, viewport.height, opts.dark, opts.subtle, opts.accent), { waitUntil: 'networkidle' });
    await page.screenshot({ path: file, type: 'png' });
  } finally {
    await browser.close();
  }
}

await render(
  { width: 1600, height: 900 },
  join(outDir, 'cover.png'),
  { dark: '#0b0e14', subtle: '#111726', accent: '#1d9bf0' }
);
await render(
  { width: 1280, height: 640 },
  join(outDir, 'social-preview.png'),
  { dark: '#0a0d13', subtle: '#101623', accent: '#1d9bf0' }
);
console.log('generated', join(outDir, 'cover.png'), join(outDir, 'social-preview.png'));
