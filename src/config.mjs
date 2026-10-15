// agent-skill-forx — session configuration.
//
// Resolution order (first wins): CLI flags > env vars > ./forx.config.json.
// Nothing here stores a password or an API key; the "credential" is the user's
// own browser session, which never leaves their machine.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = 'forx.config.json';

export function loadConfig(cli = {}) {
  let file = {};
  try { if (existsSync(resolve(FILE))) file = JSON.parse(readFileSync(resolve(FILE), 'utf8')); } catch {}
  const env = {
    port: process.env.FORX_PORT ? Number(process.env.FORX_PORT) : undefined,
    mode: process.env.FORX_MODE,
    exe: process.env.FORX_EXE,
    profileDir: process.env.FORX_PROFILE,
    browser: process.env.FORX_BROWSER,
  };
  const pick = (k) => cli[k] ?? env[k] ?? file[k];
  const session = {
    mode: pick('mode') || 'auto',          // attach | launch | auto
    port: Number(pick('port') || 9222),
    exe: pick('exe') || undefined,          // explicit browser binary
    browser: pick('browser') || 'auto',     // auto | edge | chrome
    profileDir: pick('profileDir') || resolve('profile'),
  };
  return { session, humanize: file.humanize || {}, safety: file.safety || {} };
}