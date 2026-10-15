// Copy the user's real browser profile into an isolated working copy so forx
// can drive its OWN browser window without disturbing the daily one.
// MUST run while the browser is fully closed.
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { findBrowserPath, profileSource } from '../src/browser.mjs';

const outDir = resolve(process.argv[2] || 'profile');
const profileName = process.argv[3] || 'Default';

const found = findBrowserPath(process.env.FORX_BROWSER || 'auto');
if (!found) { console.error('No Edge/Chrome found. Install one, or pass FORX_BROWSER=edge|chrome.'); process.exit(1); }
const { root, profile } = profileSource(found.browser, profileName);
if (!existsSync(profile)) { console.error(`Profile not found: ${profile}`); process.exit(1); }

const dst = join(outDir, profileName);
if (existsSync(dst)) { console.error(`Destination exists: ${dst}\nDelete it first, or choose another profile name.`); process.exit(1); }

console.log(`Copying ${profile}\n     -> ${dst}`);
await mkdir(outDir, { recursive: true });
await cp(profile, dst, { recursive: true, force: false });
const localState = join(root, 'Local State');
if (existsSync(localState)) {
  await cp(localState, join(outDir, 'Local State'));
  console.log('Copied Local State (needed to unlock cookies).');
}
console.log(`\nDone. forx will now use ${dst} as its isolated profile.`);
console.log('Reminder: the browser must be CLOSED while copying.');