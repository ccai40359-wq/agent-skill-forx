#!/usr/bin/env node
// agent-skill-forx — CLI.
//
//   forx verify
//   forx timeline [--rounds 3] [--like-min 50]
//   forx like   <tweetUrl>
//   forx follow <@handle|profileUrl>
//   forx quote  <tweetUrl> "<comment>"
//   forx reply  <tweetUrl> "<text>"
//   forx post   "<text>" [--dry-run]
//   forx read   <tweetUrl>
//
// Flags: --dry-run (fill the composer but do not publish)
//        --mode attach|launch|auto  --port 9222  --profile <dir>  --browser auto|edge|chrome
// This tool is MANUAL by construction: it performs exactly the action you name,
// once. Scheduling, quotas, review and "don't sound like a bot" copy are the
// job of whatever agent drives it.
import { loadConfig } from './config.mjs';
import { connect, closeBrowser, findBrowserPath } from './browser.mjs';
import * as X from './ops.mjs';

// Only recognise KNOWN flags, so user text that happens to start with "--"
// (e.g. forx post "-- not a flag --") is still treated as content, not a flag.
const KNOWN_FLAGS = new Set(['mode', 'port', 'profile', 'browser', 'exe', 'rounds', 'like-min', 'help', 'dry-run']);
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.startsWith('--') ? a.slice(2).split('=') : null;
    if (eq && KNOWN_FLAGS.has(eq[0])) {
      const k = eq[0];
      if (eq[1] !== undefined) flags[k] = eq[1];
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];
  const a = positional.slice(1);
  if (flags.help) { printUsage(); return 0; }
  if (!cmd) { printUsage(); return 1; }

  const cfg = loadConfig({
    mode: flags.mode, port: flags.port, profileDir: flags.profile, browser: flags.browser, exe: flags.exe,
  });
  const session = cfg.session;
  if (!session.exe && session.mode !== 'attach') {
    const found = findBrowserPath(session.browser);
    if (found) session.exe = found.path;
  }

  let conn;
  try {
    conn = await connect(session);
    const { page } = conn;
    let result;
    switch (cmd) {
      case 'verify':   result = await X.verify(page); break;
      case 'timeline': result = await X.scroll(page, { rounds: Number(flags.rounds || 3), likeMinLikes: Number(flags['like-min'] || 0) }); break;
      case 'like':     result = await X.like(page, requireArg(a[0], 'tweetUrl')); break;
      case 'follow':   result = await X.follow(page, requireArg(a[0], '@handle or profileUrl')); break;
      case 'quote':    result = await X.quote(page, requireArg(a[0], 'tweetUrl'), requireArg(a.slice(1).join(' '), 'comment'), { dryRun: !!flags['dry-run'] }); break;
      case 'reply':    result = await X.reply(page, requireArg(a[0], 'tweetUrl'), requireArg(a.slice(1).join(' '), 'text'), { dryRun: !!flags['dry-run'] }); break;
      case 'post':     result = await X.post(page, requireArg(a.join(' '), 'text'), { dryRun: !!flags['dry-run'] }); break;
      case 'read':     result = await X.getTweet(page, requireArg(a[0], 'tweetUrl')); break;
      default: printUsage(); return 1;
    }
    console.log(JSON.stringify({ ok: true, mode: conn.mode, result }, null, 2));
    return 0;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, blocked: !!e.blocked, reason: e.reason || null, error: e.message }, null, 2));
    return e.blocked ? 2 : 1;
  } finally {
    // NEVER close a browser we merely attached to: browser.close() over CDP
    // would shut the user's own window. Only close one we launched.
    if (conn?.browser && conn.mode === 'launched') await closeBrowser(conn.browser);
  }
}

function requireArg(v, name) { if (!v) throw new Error(`missing argument: ${name}`); return v; }

function printUsage() {
  console.log(`agent-skill-forx — human-like X operations for AI agents

  forx verify
  forx timeline [--rounds 3] [--like-min 50]
  forx like   <tweetUrl>
  forx follow <@handle|profileUrl>
  forx quote  <tweetUrl> "<comment>"
  forx reply  <tweetUrl> "<text>"
  forx post   "<text>"
  forx read   <tweetUrl>

Flags: --mode attach|launch|auto  --port 9222  --profile <dir>  --browser auto|edge|chrome
         --exe <path>  --rounds <n>  --like-min <n>  --dry-run  --help`);
}

main().then((c) => { process.exit(c); });