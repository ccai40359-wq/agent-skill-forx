---
name: agent-skill-forx
description: Drive a real X (Twitter) session, already signed in on the user's own browser, the way a human would — like, scroll, follow, quote, reply, and post — while the agent supplies the judgement, what to say, and when to act. Use when you need to operate X directly (verify the signed-in account, read a timeline or a single tweet, engage with posts, or publish) through a logged-in Chromium/Edge over CDP, with human-like timing and block-guards, never through an API token or a fake fingerprint.
---

# agent-skill-forx

Human-like X (Twitter) operations for AI agents: like, scroll, follow, quote,
reply, post — driven through the user's OWN logged-in browser via CDP. The
agent supplies judgement and copy; this skill supplies the hands.

## When to use

- You are asked to act on X as the signed-in user would: read a tweet, scan the
  home timeline, like, follow, quote, reply, or post.
- The user has a browser already signed in to x.com and wants their own session
  driven (never a headless fingerprint, never an API key).

## When NOT to use

- The user is NOT signed in, or expects sign-in handling — this skill only
  drives an existing session; it never logs in.
- You need bulk/high-volume actions, scheduling, or automation beyond ONE
  manual action at a time. This tool is deliberately manual and singular.
- The copy itself is sensitive: the skill never decides what to say.
- You cannot reach the user's browser (no CDP endpoint, no copied profile) —
  resolve that first.

## Prerequisites

- A browser (Edge or Chrome) already signed in to x.com.
- Node.js >= 20 (see `engines` in `package.json`).
- Dependencies installed: `npm i`.

## CLI surface

Every command below exists verbatim in `src/cli.mjs` (the `case` dispatch at
`src/cli.mjs:63-70`, usage text at `src/cli.mjs:87-100`). Example:

```text
forx verify
forx timeline --rounds 3 --like-min 50
forx like   https://x.com/user/status/1234567890
forx follow @somehandle
forx quote  https://x.com/user/status/1234567890 "my comment"
forx reply  https://x.com/user/status/1234567890 "my reply"
forx post   "Hello world"
forx read   https://x.com/user/status/1234567890
```

Flags (known flags set at `src/cli.mjs:24`): `--mode attach|launch|auto`,
`--port <port>`, `--profile <dir>`, `--browser auto|edge|chrome`, `--exe
<path>`, `--rounds <n>`, `--like-min <n>`, `--dry-run`, `--help`.

- `verify` — confirm which account the session is signed in as.
- `timeline` — scroll the home timeline like a person; `--rounds` controls how
  many scroll batches, `--like-min` likes posts that clear the like threshold.
- `like`, `follow`, `quote`, `reply`, `post` — one action, once.
- `post`, `quote`, `reply` accept `--dry-run`: fill the composer, prove it is
  ready, then discard the draft without publishing (`src/ops.mjs:219-229`,
  `src/ops.mjs:298-303`, `src/ops.mjs:325-331`).
- `read` — fetch a tweet's author, text, metrics; read-only.

Exit codes: `0` success, `1` failure, `2` blocked (guard hit) — set at
`src/cli.mjs:75-77`.

## MCP surface

Run with `npm run mcp` (`mcp/server.mjs`), stdio transport. Requires
`npm i @modelcontextprotocol/sdk` (declared in `optionalDependencies`).
Tools (registered at `mcp/server.mjs:38-65`):

| tool              | params                    | action                             |
|-------------------|---------------------------|------------------------------------|
| `x_verify`        | —                         | which account is signed in         |
| `x_scroll_timeline` | `rounds?` (1-20), `likeMinLikes?` (>=0) | human-like scroll, optional likes |
| `x_like`          | `tweetUrl`                | like one tweet                     |
| `x_follow`        | `handle`                  | follow by @handle or profile URL   |
| `x_quote`         | `tweetUrl`, `comment`     | quote a tweet                      |
| `x_reply`         | `tweetUrl`, `text`        | reply to a tweet                   |
| `x_post`          | `text`                    | publish an original post           |
| `x_read_tweet`    | `tweetUrl`                | read a tweet, read-only            |

## Configuration

Resolution order (first wins): CLI flags > env vars (`FORX_*`) >
`./forx.config.json` (`src/config.mjs:7-27`).

| key           | CLI flag      | env var         | file key      | default            |
|---------------|---------------|-----------------|---------------|--------------------|
| mode          | `--mode`      | `FORX_MODE`     | `mode`        | `auto`             |
| port          | `--port`      | `FORX_PORT`     | `port`        | `9222`             |
| browser exe   | `--exe`       | `FORX_EXE`      | `exe`         | auto-detected      |
| browser kind  | `--browser`   | `FORX_BROWSER`  | `browser`     | `auto`             |
| profile dir   | `--profile`   | `FORX_PROFILE`  | `profileDir`  | `./profile`        |

`attach` requires a live CDP endpoint on `port`; `launch` starts an ISOLATED
copy of the user's profile (copy it first with `scripts/copy-profile.mjs`);
`auto` attaches if CDP is up, otherwise launches (`src/browser.mjs:166-192`).

## Safety model

- Every write action first runs a block-guard (`detectBlock`,
  `src/ops.mjs:41-55`): captcha, locked account, rate limit, action-blocked,
  signed-out → the action refuses (`guard`, `src/ops.mjs:58-61`).
- Content screen (`screenContent`, `src/ops.mjs:77-90`): hard blocks for
  spam/adult/illegal copy; politics and finance are OFF by default and must be
  explicitly enabled (`safety.allowPolitics`, `safety.allowFinance`).
- One tool/command = one human-scale action. No scheduling, no quotas, no
  auto-DM, no reply-scripts.
- The "credential" is the user's own signed-in session; it never leaves the
  machine. Nothing is stored or logged except optional `FORX_LOG` output.
- The browser is never closed when merely attached; only a browser this tool
  launched is closed (`src/cli.mjs:81`, `src/browser.mjs:153`).

## Copy this to get started

```bash
npm i
node scripts/copy-profile.mjs            # browser must be CLOSED first
forx verify --mode launch --profile profile
forx read https://x.com/user/status/1234567890
```
