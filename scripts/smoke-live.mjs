// agent-skill-forx — live smoke check (READ-ONLY by construction).
//
//   node scripts/smoke-live.mjs [tweetUrl]
//
// Connects to the user's live browser using the SAME config resolution as the
// CLI (CLI flags > env FORX_* > forx.config.json), verifies the signed-in
// account, then runs exactly ONE read-only action:
//   - `getTweet` on process.argv[2] when a URL is given, otherwise
//   - `scroll` with rounds=1 (reads the timeline, performs no writes),
// prints a compact JSON result, exits 0 on success, 1 on failure.
//
// NEVER performs a write action: no like, follow, quote, reply, or post, even
// when `scroll` is used (likeMinLikes stays 0 and the UI likes nothing).
//
// If the browser / CDP endpoint is unavailable (fresh clone, browser closed,
// no profile yet), it prints a clear skip message and exits 0 so the smoke
// check never fails a fresh checkout.
import { loadConfig } from '../src/config.mjs';
import { connect, closeBrowser, findBrowserPath } from '../src/browser.mjs';
import * as X from '../src/ops.mjs';

async function main() {
  const tweetUrl = process.argv[2] || null;

  let cfg;
  try { cfg = loadConfig(); }
  catch (e) { console.log(JSON.stringify({ ok: false, skipped: true, step: 'config', reason: e.message })); return 0; }

  if (!cfg.session.exe && cfg.session.mode !== 'attach') {
    const found = findBrowserPath(cfg.session.browser);
    if (found) cfg.session.exe = found.path;
  }

  let conn;
  try {
    conn = await connect(cfg.session);
  } catch (e) {
    // No CDP endpoint / no browser binary / no profile copy: a fresh clone
    // cannot satisfy a live smoke check, so skip cleanly instead of failing.
    console.log(JSON.stringify({ ok: false, skipped: true, step: 'connect', reason: e.message }));
    return 0;
  }

  try {
    const account = await X.verify(conn.page);
    let result;
    if (tweetUrl) {
      result = await X.getTweet(conn.page, tweetUrl);
    } else {
      // rounds=1, likeMinLikes=0: reads the timeline, likes nothing.
      result = await X.scroll(conn.page, { rounds: 1, likeMinLikes: 0 });
    }
    console.log(JSON.stringify({ ok: true, mode: conn.mode, account, action: tweetUrl ? 'getTweet' : 'scroll', result }));
    return 0;
  } catch (e) {
    console.log(JSON.stringify({ ok: false, mode: conn.mode, blocked: !!e.blocked, reason: e.reason || null, error: e.message }));
    return 1;
  } finally {
    // Never close a browser we merely attached to; only close one we launched.
    if (conn?.browser && conn.mode === 'launched') await closeBrowser(conn.browser);
  }
}

main().then((code) => process.exit(code));
