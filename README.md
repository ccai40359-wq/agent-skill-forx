# agent-skill-forx

> 让 agent 像真人一样操作你的 X：点赞、刷帖、互关、引用、评论。

Human-like X (Twitter) operations for AI agents — like, scroll, follow, quote,
reply, and post — driven through your own logged-in browser via CDP. The agent
supplies judgement and copy; this package supplies the hands. Ships as an
Agent Skill (`SKILL.md`) and an MCP server (`mcp/server.mjs`).

## What it is

- Drives the user's REAL signed-in X session (Edge/Chrome) over CDP: real
  binary, real TLS fingerprint, real cookies, the user's home IP. Nothing is
  faked or spoofed.
- Every action is MANUAL and singular: one command/tool = one human-scale
  action — like, scroll, follow, quote, reply, post.
- Human-like pacing: per-character typing with randomised delays, mouse paths,
  scroll warmup, thinking pauses (`src/humanize.mjs`).
- Block-guarded: every write checks for captcha / lock / rate-limit /
  action-blocked / signed-out before acting (`detectBlock`,
  `src/ops.mjs:41-55`).

## Why

让 agent 像真人一样操作你的 X：点赞，刷帖，互关，引用，评论。Automation that
"looks like a human" without a real session (fake fingerprints, API tokens,
headless browsers) is fragile and gets flagged. Driving your own logged-in
browser through CDP keeps the session, timing, and fingerprint real, and puts
the judgement — what to say, when to act, how much — in the agent and its
human operator, not in a script.

## Quick start

Prerequisites: Node.js >= 20, a browser (Edge or Chrome) already signed in to
x.com.

```bash
npm i
node scripts/copy-profile.mjs   # browser must be CLOSED first
forx verify --mode launch --profile profile
```

- `copy-profile.mjs` copies your real profile into an ISOLATED working copy so
  the tool never disturbs your daily browser (`scripts/copy-profile.mjs`).
- `verify` confirms which account the session is signed in as.

## CLI

```text
forx verify
forx timeline [--rounds 3] [--like-min 50]
forx like   <tweetUrl>
forx follow <@handle|profileUrl>
forx quote  <tweetUrl> "<comment>"
forx reply  <tweetUrl> "<text>"
forx post   "<text>" [--dry-run]
forx read   <tweetUrl>
```

Flags: `--mode attach|launch|auto`, `--port <port>`, `--profile <dir>`,
`--browser auto|edge|chrome`, `--exe <path>`, `--rounds <n>`,
`--like-min <n>`, `--dry-run`, `--help`. (Command surface:
`src/cli.mjs:63-70`; flags set: `src/cli.mjs:24`.)

- `verify` — which account is signed in
- `timeline` — human-like scroll of the home timeline; `--rounds N` scroll
  batches, `--like-min N` likes posts above the threshold
- `like` / `follow` / `quote` / `reply` / `post` — one action, once
- `read` — tweet author + text + metrics; read-only
- `post` / `quote` / `reply` support `--dry-run`: fill the composer, verify it
  is ready, discard the draft without publishing
  (`src/ops.mjs:215-234`, `src/ops.mjs:283-309`, `src/ops.mjs:311-336`)

Exit codes: `0` success, `1` failure, `2` blocked (`src/cli.mjs:75-77`).

## MCP

```bash
npm i @modelcontextprotocol/sdk   # optional dependency
npm run mcp                        # stdio transport
```

Tools (`mcp/server.mjs:38-65`):

| tool | params | action |
|------|--------|--------|
| `x_verify` | — | which account is signed in |
| `x_scroll_timeline` | `rounds?` (1-20), `likeMinLikes?` (>=0) | scroll like a person |
| `x_like` | `tweetUrl` | like one tweet |
| `x_follow` | `handle` | follow by @handle or profile URL |
| `x_quote` | `tweetUrl`, `comment` | quote a tweet |
| `x_reply` | `tweetUrl`, `text` | reply to a tweet |
| `x_post` | `text` | publish an original post |
| `x_read_tweet` | `tweetUrl` | read a tweet (read-only) |

## Config

Resolution order (first wins): CLI flags > env vars (`FORX_*`) >
`./forx.config.json` (`src/config.mjs:15-27`).

| key | CLI flag | env var | file key | default |
|-----|----------|---------|----------|---------|
| mode | `--mode` | `FORX_MODE` | `mode` | `auto` |
| port | `--port` | `FORX_PORT` | `port` | `9222` |
| browser exe | `--exe` | `FORX_EXE` | `exe` | auto-detected |
| browser kind | `--browser` | `FORX_BROWSER` | `browser` | `auto` |
| profile dir | `--profile` | `FORX_PROFILE` | `profileDir` | `./profile` |

Modes: `attach` connects to a running CDP endpoint; `launch` starts an isolated
copy of your profile; `auto` attaches if CDP is up, otherwise launches
(`src/browser.mjs:166-192`). Copy the profile first:

```bash
node scripts/copy-profile.mjs [outDir] [profileName]
```

Extra env: `FORX_LOG=<path>` appends a log file (`src/log.mjs:11`);
`FORX_TZ=<zone>` sets the log timezone, default `Asia/Shanghai`
(`src/log.mjs:5`); `FORX_BROWSER` is honoured by `copy-profile.mjs`
(`scripts/copy-profile.mjs:12`).

See `forx.config.example.json` for a full commented example (JSON has no
comments, so read the notes in this section and in `README.md`).

## Safety

- Every write is preceded by a block-guard (`detectBlock`,
  `src/ops.mjs:41-55`): captcha, locked account, rate limit, action-blocked,
  signed-out.
- Content screen (`screenContent`, `src/ops.mjs:77-90`): hard blocks for
  spam/adult/illegal copy; politics and finance are disabled by default and
  must be explicitly enabled (`safety.allowPolitics` / `safety.allowFinance`).
- Manual by construction: one action at a time, no scheduling, no quotas, no
  auto-DM, no reply scripts.
- The credential is the user's own browser session; nothing is stored or sent
  anywhere. Logs are per-action and (optionally) to a local file path you set.
- A browser that was merely attached is never closed (`src/cli.mjs:81`,
  `src/browser.mjs:153`).
- Use responsibly: respect X's rules, your account's trust, and your local
  laws. This tool drives a real account and real actions.

## Architecture

| layer | files | role |
|-------|-------|------|
| ops | `src/ops.mjs` | one action per function, verified against the live X DOM; read-only `getTweet`/`scroll`, writes like/reply/quote/post/follow |
| humanize | `src/humanize.mjs` | generic mouse/keyboard humanisation; randomised timing, timing profiles |
| browser | `src/browser.mjs` | attach / launch / auto modes, CDP connect, browser discovery, isolated profile launch |
| config | `src/config.mjs` | resolution order CLI > env > file |
| cli | `src/cli.mjs` | the `forx` command |
| mcp | `mcp/server.mjs` | MCP stdio server exposing the same operations |
| utils | `src/log.mjs`, `src/parse-count.mjs` | logging, locale-tolerant count parsing |

## Limitations

- Requires an existing signed-in browser session; it never logs in for you.
- Manual and singular by design — no scheduling, batching, or quotas.
- Selectors target the live signed-in X DOM; X layout changes can break them.
- Politics/finance content is off by default until explicitly enabled.
- No fake fingerprints — that is the point; it cannot work without a real
  session.

## License

MIT. See `LICENSE`.

---

## 中文

# agent-skill-forx

> 让 agent 像真人一样操作你的 X：点赞、刷帖、互关、引用、评论。

面向 AI agent 的「像真人一样」X（Twitter）操作：点赞、刷帖、互关、引用、
评论、发帖——通过 CDP 驱动你自己已登录的浏览器完成。判断和文案由 agent
负责，本包只提供「手」。同时提供 Agent Skill（`SKILL.md`）和 MCP 服务
（`mcp/server.mjs`）两种使用方式。

## 是什么

- 驱动用户自己真实已登录的 X 会话（Edge/Chrome，CDP 连接）：真实浏览器、
  真实 TLS 指纹、真实 cookie、用户家庭 IP。不做任何伪装或伪造。
- 每个动作都是 MANUAL、单一的：一条命令 / 一个工具 = 一次人类尺度的操作
  ——点赞、刷帖、互关、引用、评论、发帖。
- 人类化节奏：逐字输入带随机延迟、鼠标移动路径、滚动热身、思考停顿
  （`src/humanize.mjs`）。
- 带护栏：每次写入前先检查验证码 / 锁定 / 限流 / 操作被拒 / 未登录
  （`detectBlock`，`src/ops.mjs:41-55`）。

## 为什么

让 agent 像真人一样操作你的 X：点赞，刷帖，互关，引用，评论。没有真实会话
的自动化（伪造指纹、API token、无头浏览器）既脆弱又容易被标记。通过 CDP
驱动你自己已登录的浏览器，让会话、节奏、指纹都保持真实；「说什么、何时动、
做多少」的判断交给 agent 和它的操作者，而不是脚本。

## 快速开始

前置：Node.js >= 20、已登录 x.com 的浏览器（Edge 或 Chrome）。

```bash
npm i
node scripts/copy-profile.mjs   # 复制前必须先完全关闭浏览器
forx verify --mode launch --profile profile
```

- `copy-profile.mjs` 把你的真实配置复制成 ISOLATED 工作副本，绝不打扰日常
  使用的浏览器（`scripts/copy-profile.mjs`）。
- `verify` 确认当前会话登录的是哪个账号。

## CLI

```text
forx verify
forx timeline [--rounds 3] [--like-min 50]
forx like   <tweetUrl>
forx follow <@handle|profileUrl>
forx quote  <tweetUrl> "<comment>"
forx reply  <tweetUrl> "<text>"
forx post   "<text>" [--dry-run]
forx read   <tweetUrl>
```

参数：`--mode attach|launch|auto`、`--port <port>`、`--profile <dir>`、
`--browser auto|edge|chrome`、`--exe <path>`、`--rounds <n>`、
`--like-min <n>`、`--dry-run`、`--help`。（命令面：`src/cli.mjs:63-70`；
已知参数集合：`src/cli.mjs:24`。）

- `verify` — 当前登录的账号
- `timeline` — 人类化滚动首页时间线；`--rounds N` 滚动批次数，`--like-min N`
  对超过阈值的帖子点赞
- `like` / `follow` / `quote` / `reply` / `post` — 单个动作，只执行一次
- `read` — 读取帖子作者 + 正文 + 数据；只读
- `post` / `quote` / `reply` 支持 `--dry-run`：填好输入框、验证可发、然后
  丢弃草稿不发布（`src/ops.mjs:215-234`、`src/ops.mjs:283-309`、
  `src/ops.mjs:311-336`）

退出码：`0` 成功，`1` 失败，`2` 被护栏拦截（`src/cli.mjs:75-77`）。

## MCP

```bash
npm i @modelcontextprotocol/sdk   # optional dependency
npm run mcp                        # stdio 传输
```

工具（`mcp/server.mjs:38-65`）：

| tool | 参数 | 动作 |
|------|------|------|
| `x_verify` | — | 当前登录账号 |
| `x_scroll_timeline` | `rounds?` (1-20)、`likeMinLikes?` (>=0) | 像人一样滚动 |
| `x_like` | `tweetUrl` | 点赞一条 |
| `x_follow` | `handle` | 按 @handle 或主页 URL 关注 |
| `x_quote` | `tweetUrl`、`comment` | 引用推文 |
| `x_reply` | `tweetUrl`、`text` | 回复推文 |
| `x_post` | `text` | 发布原创推文 |
| `x_read_tweet` | `tweetUrl` | 只读推文 |

## 配置

解析顺序（先到先得）：CLI 参数 > 环境变量（`FORX_*`）> `./forx.config.json`
（`src/config.mjs:15-27`）。

| 键 | CLI 参数 | 环境变量 | 文件键 | 默认 |
|-----|----------|----------|--------|------|
| mode | `--mode` | `FORX_MODE` | `mode` | `auto` |
| port | `--port` | `FORX_PORT` | `port` | `9222` |
| browser exe | `--exe` | `FORX_EXE` | `exe` | 自动探测 |
| browser kind | `--browser` | `FORX_BROWSER` | `browser` | `auto` |
| profile dir | `--profile` | `FORX_PROFILE` | `profileDir` | `./profile` |

模式：`attach` 连接已运行中的 CDP 端口；`launch` 启动隔离的配置副本；
`auto` 端口有 CDP 就 attach，否则 launch（`src/browser.mjs:166-192`）。先
复制配置：

```bash
node scripts/copy-profile.mjs [outDir] [profileName]
```

其它环境变量：`FORX_LOG=<path>` 追加日志文件（`src/log.mjs:11`）；
`FORX_TZ=<zone>` 设置日志时区，默认 `Asia/Shanghai`（`src/log.mjs:5`）；
`FORX_BROWSER` 也被 `copy-profile.mjs` 使用（`scripts/copy-profile.mjs:12`）。

完整示例见 `forx.config.example.json`（JSON 不支持注释，请对照本节说明）。

## 安全

- 每次写入前都有护栏（`detectBlock`，`src/ops.mjs:41-55`）：验证码、账号
  锁定、限流、操作被拒、未登录。
- 内容筛查（`screenContent`，`src/ops.mjs:77-90`）：硬阻断垃圾 / 色情 /
  违法文案；政治与财经类默认关闭，需显式开启（`safety.allowPolitics` /
  `safety.allowFinance`）。
- 天生手动：一次一个动作，无排程、无限额、无自动私信、无自动回复脚本。
- 凭据就是用户自己的浏览器会话，任何密钥 / token / cookie 都不会被存储或
  外发。日志按动作记录，可选写到本地文件。
- 只 attach 的浏览器绝不会被关闭（`src/cli.mjs:81`、`src/browser.mjs:153`）。
- 请负责任地使用：遵守 X 的平台规则、维护账号信任、遵守当地法律。本工具
  驱动的是真实账号和真实动作。

## 架构

| 层 | 文件 | 职责 |
|----|------|------|
| ops | `src/ops.mjs` | 每个动作一个函数，按真实 X DOM 验证；只读 `getTweet`/`scroll`，写入 like/reply/quote/post/follow |
| humanize | `src/humanize.mjs` | 通用鼠标 / 键盘人类化；随机时序、时序档位 |
| browser | `src/browser.mjs` | attach / launch / auto 模式、CDP 连接、浏览器发现、隔离配置启动 |
| config | `src/config.mjs` | 解析顺序 CLI > 环境变量 > 文件 |
| cli | `src/cli.mjs` | `forx` 命令入口 |
| mcp | `mcp/server.mjs` | 暴露同样操作的 MCP stdio 服务 |
| utils | `src/log.mjs`、`src/parse-count.mjs` | 日志、多语言数字解析 |

## 局限

- 需要已登录的浏览器会话；不会替你登录。
- 设计上手动且单一——无排程、无批量、无限额。
- 选择器针对真实已登录 X DOM；X 改版可能失效。
- 政治 / 财经内容默认关闭，需显式开启。
- 不伪造指纹——这正是本工具的意义；没有真实会话就无法工作。

## License

MIT。见 `LICENSE`。
