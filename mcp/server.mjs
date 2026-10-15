#!/usr/bin/env node
// agent-skill-forx — MCP server.
//
// Exposes the same operations as the CLI over the Model Context Protocol, so
// any MCP-capable agent (Claude Code, Codex, Cursor, ...) can drive a real X
// session like a person. Tools are deliberately MANUAL and singular: one tool
// = one human-scale action. The agent supplies judgement and copy; this server
// supplies the hands and the block-guard.
//
// Transport: stdio. Requires: npm i @modelcontextprotocol/sdk
import { loadConfig } from '../src/config.mjs';
import { connect, closeBrowser, findBrowserPath } from '../src/browser.mjs';
import * as X from '../src/ops.mjs';

let server, sdk;
try {
  sdk = await import('@modelcontextprotocol/sdk/server/mcp.js');
  ({ McpServer: server } = sdk);
} catch (e) {
  console.error('Missing dependency: @modelcontextprotocol/sdk\n  npm install @modelcontextprotocol/sdk');
  process.exit(1);
}
const { z } = await import('zod');

let conn = null;
async function page() {
  if (conn) { try { return conn.page; } catch {} }
  const cfg = loadConfig();
  if (!cfg.session.exe) { const f = findBrowserPath(cfg.session.browser); if (f) cfg.session.exe = f.path; }
  conn = await connect(cfg.session);
  return conn.page;
}

const mcp = new server({ name: 'agent-skill-forx', version: '0.1.0' });
const ok = (r) => ({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] });
const err = (e) => ({ isError: true, content: [{ type: 'text', text: `error: ${e.message}${e.blocked ? ` (blocked: ${e.reason})` : ''}` }] });

mcp.tool('x_verify', 'Confirm which X account the live browser session is signed in as.', {}, async () => {
  try { return ok(await X.verify(await page())); } catch (e) { return err(e); }
});

mcp.tool('x_scroll_timeline', 'Scroll the home timeline like a person. Optionally like posts above a threshold. Returns the tweets seen so you can decide what to engage with.',
  { rounds: z.number().int().min(1).max(20).optional(), likeMinLikes: z.number().int().min(0).optional() },
  async ({ rounds = 3, likeMinLikes = 0 }) => { try { return ok(await X.scroll(await page(), { rounds, likeMinLikes })); } catch (e) { return err(e); } });

mcp.tool('x_like', 'Like a single tweet.', { tweetUrl: z.string() },
  async ({ tweetUrl }) => { try { return ok(await X.like(await page(), tweetUrl)); } catch (e) { return err(e); } });

mcp.tool('x_follow', 'Follow an account by @handle or profile URL.',
  { handle: z.string() },
  async ({ handle }) => { try { return ok(await X.follow(await page(), handle)); } catch (e) { return err(e); } });

mcp.tool('x_quote', 'Quote a tweet with your own comment. Set dryRun to prepare without publishing.',
  { tweetUrl: z.string(), comment: z.string(), dryRun: z.boolean().optional() },
  async ({ tweetUrl, comment, dryRun = false }) => { try { return ok(await X.quote(await page(), tweetUrl, comment, { dryRun })); } catch (e) { return err(e); } });

mcp.tool('x_reply', 'Reply to a tweet. Set dryRun to prepare without publishing.',
  { tweetUrl: z.string(), text: z.string(), dryRun: z.boolean().optional() },
  async ({ tweetUrl, text, dryRun = false }) => { try { return ok(await X.reply(await page(), tweetUrl, text, { dryRun })); } catch (e) { return err(e); } });

mcp.tool('x_post', 'Publish a new original post. Set dryRun to fill the composer and prove it is ready without publishing.', { text: z.string(), dryRun: z.boolean().optional() },
  async ({ text, dryRun = false }) => { try { return ok(await X.post(await page(), text, { dryRun })); } catch (e) { return err(e); } });

mcp.tool('x_read_tweet', 'Read a tweet (author, text, metrics) without changing anything.', { tweetUrl: z.string() },
  async ({ tweetUrl }) => { try { return ok(await X.getTweet(await page(), tweetUrl)); } catch (e) { return err(e); } });

process.on('SIGINT', async () => { try { if (conn?.browser && conn.mode === 'launched') await closeBrowser(conn.browser); } catch {} process.exit(0); });

const transport = new (await import('@modelcontextprotocol/sdk/server/stdio.js')).StdioServerTransport();
await mcp.connect(transport);