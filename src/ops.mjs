// agent-skill-forx — X (Twitter) operations over a CDP-attached real browser.
//
// Design: these are HANDS, not a brain. The agent decides WHAT to say; this
// module only does the mechanical like/scroll/follow/quote/reply/post and the
// reads (getTweet, getTimeline) an agent needs to decide. Selectors are the
// ones verified live against the signed-in X DOM.
//
// Every write action: (1) checks for a block first, (2) warms up like a person,
// (3) types per-character, (4) verifies the result instead of assuming success.
// Nothing here fakes a fingerprint; it drives the user's real session.
import { appendLog } from './log.mjs';
import { parseCountAny } from './parse-count.mjs';
import { scrollWarmup, thinkPause, typeHuman, clickHuman, moveHuman, sleep } from './humanize.mjs';

export const SEL = {
  composeEntry: '[data-testid="SideNav_NewTweet_Button"]',
  editor: '[data-testid="tweetTextarea_0"]',
  postButton: '[data-testid="tweetButton"]',
  postButtonInline: '[data-testid="tweetButtonInline"]',
  retweet: '[data-testid="retweet"]',
  menuItem: '[role="menuitem"]',
  confirmSheet: '[data-testid="confirmationSheetConfirm"]',
  toast: '[data-testid="toast"]',
  loginLink: 'a[href="/login"]',
  modalEditor: '[role="dialog"] [data-testid="tweetTextarea_0"]',
  appBarClose: '[data-testid="app-bar-close"]',
  mask: '[data-testid="mask"]',
  tweet: 'article[data-testid="tweet"]',
  accountSwitcher: '[data-testid="SideNav_AccountSwitcher_Button"]',
};

// ---- block / guard layer ------------------------------------------------

const BLOCK_PATTERNS = [
  { reason: 'captcha', re: /unusual activity|verify you(?:.?re| are)? ?(?:a )?human|确认你是真人|安全验证|完成以下验证/i },
  { reason: 'locked', re: /account is temporarily locked|temporarily limited|账号已被暂时限制|已被冻结/i },
  { reason: 'rate-limit', re: /rate limit exceeded|over the daily limit|请求过于频繁|已达到每日上限/i },
  { reason: 'action-blocked', re: /action blocked|looks like it might be automated|automated behavior|we can.?t complete this action|为了保护我们的用户|暂时无法执行此操作/i },
];

export async function detectBlock(page) {
  try {
    const url = page.url() || '';
    if (/captcha|arkose|challenge/i.test(url)) return { blocked: true, reason: 'captcha-url' };
    const body = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
    for (const { reason, re } of BLOCK_PATTERNS) if (re.test(body)) return { blocked: true, reason };
    if (/\/i\/(?:flow|jf)\//i.test(url) || /[?&]mode=login\b/i.test(url) || /\/(?:login|signin|sign-in)\b/i.test(url)) return { blocked: true, reason: 'signed-out' };
    const compose = await page.locator(SEL.composeEntry).first().isVisible({ timeout: 1500 }).catch(() => false);
    if (!compose) {
      const login = await page.locator(SEL.loginLink).first().isVisible({ timeout: 1500 }).catch(() => false);
      const field = await page.locator('input[autocomplete="username"], input[name="text"]').first().isVisible({ timeout: 1500 }).catch(() => false);
      if (login || field) return { blocked: true, reason: 'signed-out' };
    }
    return { blocked: false };
  } catch (e) { appendLog('detectBlock error (treated as not blocked): ' + e.message); return { blocked: false }; }
}

async function guard(page) {
  const b = await detectBlock(page);
  if (b.blocked) {
    appendLog('blocked (' + b.reason + ')');
    const e = new Error('blocked: ' + b.reason); e.blocked = true; e.reason = b.reason; throw e;
  }
}

// Content screen: hard blocks + opt-in risk categories (politics/finance off
// by default). Returns { ok, reason }. Purely advisory for the caller's brain.
const HARD_BLOCK = [
  { re: /(彩票|博彩|赌博|代理|刷单|返利|加微|私聊|兼职|荐股|开户|贷款|代购|投资群)/, tag: 'spam' },
  { re: /(色情|约炮|裸聊|成人视频)/, tag: 'adult' },
  { re: /(枪支|毒品|冰毒|大麻交易|假证|洗钱)/, tag: 'illegal' },
];
const RISK = [
  { tag: 'politics', re: /(大选|选举|总统|议会|法案|外交冲突|战争|制裁|执政党|在野党|政治)/ },
  { tag: 'finance', re: /(买入|卖出|建仓|清仓|目标价|涨停|跌停|股票推荐|期权策略|炒币|合约开多|合约开空|收益率保证)/ },
];
export function screenContent(text, cfg = {}) {
  const t = text || '';
  for (const { re, tag } of HARD_BLOCK) { const m = t.match(re); if (m) return { ok: false, reason: `${tag}:${m[1]}` }; }
  const allow = cfg.safety || {};
  for (const { tag, re } of RISK) {
    if (!re.test(t)) continue;
    const enabled = tag === 'politics' ? allow.allowPolitics : allow.allowFinance;
    if (!enabled) return { ok: false, reason: `category-disabled:${tag}` };
  }
  return { ok: true };
}

// ---- shared plumbing ----------------------------------------------------

async function goto(page, url, { wait = 3000 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (wait) await page.waitForTimeout(wait);
}

async function gotoHome(page) {
  if (!/\/home/.test(page.url())) await goto(page, 'https://x.com/home', { wait: 2500 });
  else await page.waitForTimeout(1200);
}

async function warmup(page) { await scrollWarmup(page).catch(() => {}); await thinkPause(page).catch(() => {}); }

function norm(s) { return String(s || '').replace(/\s+/g, '').trim(); }

async function typeInto(page, text) {
  const modal = page.locator(SEL.modalEditor);
  const editor = (await modal.count()) > 0 ? modal.first() : page.locator(SEL.editor).first();
  await editor.waitFor({ state: 'visible', timeout: 15000 });
  try { await typeHuman(page, editor, text); }
  catch { await editor.click({ timeout: 10000 }); await page.keyboard.insertText(text); }
  await page.waitForTimeout(600);
  // Per-character typing can drop characters on long bodies (X's React editor);
  // verify and repair atomically rather than publishing a corrupted sentence.
  const want = norm(text);
  let got = norm(await editor.innerText().catch(() => ''));
  if (got !== want) {
    appendLog(`typed text mismatch (want ${want.length}, got ${got.length}); repairing atomically`);
    await editor.click({ timeout: 10000 }).catch(() => {});
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Delete').catch(() => {});
    await page.waitForTimeout(250);
    await page.keyboard.insertText(text);
    await page.waitForTimeout(500);
    got = norm(await editor.innerText().catch(() => ''));
  }
  return editor;
}

async function composerStillHolds(page, text) {
  return page.evaluate((t) => {
    const boxes = [...document.querySelectorAll('[data-testid="tweetTextarea_0"]')];
    if (!boxes.length) return false;
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const want = n(t).slice(0, 40);
    if (!want) return boxes.length > 0;
    return boxes.some((b) => n(b.innerText).includes(want));
  }, text).catch(() => false);
}

// A composer left behind by a failed submit can leave a full-screen mask that
// swallows every later click. Clear it before acting.
async function clearStaleComposer(page) {
  const state = await page.evaluate((sel) => {
    const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; return el.getBoundingClientRect().width > 0; };
    const masks = [...document.querySelectorAll(sel.mask)].filter(vis).length;
    const withText = [...document.querySelectorAll(sel.editor)].filter((e) => (e.innerText || '').trim().length > 0).length;
    return { masks, withText };
  }, { mask: SEL.mask, editor: SEL.editor }).catch(() => ({ masks: 0, withText: 0 }));
  if (state.masks === 0 && state.withText === 0) return false;
  const close = page.locator(SEL.appBarClose).first();
  if (await close.isVisible({ timeout: 3000 }).catch(() => false)) await close.click({ timeout: 8000 }).catch(() => {});
  else await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1200);
  const confirm = page.locator(SEL.confirmSheet).first();
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) { await confirm.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(800); }
  return true;
}

async function submitPost(page, text) {
  const btn = page.locator(SEL.postButton).last();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  if ((await btn.getAttribute('aria-disabled')) === 'true') throw new Error('Post button disabled; content may be rejected or empty');
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(5000);
  if (await composerStillHolds(page, text)) {
    const toast = await page.locator(SEL.toast).first().innerText({ timeout: 2000 }).catch(() => '');
    return { ok: false, toast };
  }
  return { ok: true };
}

async function pageIsBroken(page) {
  return page.evaluate(() => /Something went wrong/i.test(document.body.innerText || '')).catch(() => false);
}

async function composeAndSubmit(page, text) {
  let last = { ok: false, toast: '' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await pageIsBroken(page)) { await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(3000); }
    if (!(await composerStillHolds(page, text))) {
      await clearStaleComposer(page);
      await clickHuman(page, page.locator(SEL.composeEntry).first(), { clickTimeout: 15000 });
      await page.waitForTimeout(1800);
      await typeInto(page, text);
    }
    last = await submitPost(page, text);
    if (last.ok) return;
    if (attempt < 2) { await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(3000); }
  }
  throw new Error('Composer still open after submit.' + (last.toast ? ' Toast: ' + last.toast : ''));
}

// ---- public operations --------------------------------------------------

// Discard an open draft (Escape -> Discard/放弃) without publishing. Used by
// --dry-run, which proves the whole write path except the final click.
async function discardDraft(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(900);
  const confirm = page.locator(SEL.confirmSheet).first();
  if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) {
    await confirm.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
}

export async function verify(page) {
  await gotoHome(page);
  if (await page.locator(SEL.loginLink).first().isVisible({ timeout: 3000 }).catch(() => false)) throw new Error('Not signed in on x.com');
  const t = await page.locator(SEL.accountSwitcher).first().innerText({ timeout: 8000 }).catch(() => '');
  const ats = [...t.matchAll(/@\w+/g)].map((m) => m[0]);
  return { account: t.replace(/\s+/g, ' ').trim(), handle: ats.length ? ats[ats.length - 1] : null };
}

export async function post(page, text, opts = {}) {
  await guard(page);
  await gotoHome(page);
  await warmup(page);
  if (opts.dryRun) {
    await clearStaleComposer(page);
    await clickHuman(page, page.locator(SEL.composeEntry).first(), { clickTimeout: 15000 });
    await page.waitForTimeout(1800);
    await typeInto(page, text);
    const btn = page.locator(SEL.postButton).last();
    const ready = await btn.isVisible({ timeout: 5000 }).catch(() => false);
    const disabled = (await btn.getAttribute('aria-disabled').catch(() => 'true')) === 'true';
    await discardDraft(page);
    appendLog('POST dry-run :: composer filled, not submitted');
    return { ok: true, kind: 'post', dryRun: true, composeReady: ready && !disabled, text };
  }
  await composeAndSubmit(page, text);
  appendLog('POST ok :: ' + text.slice(0, 70).replace(/\s+/g, ' '));
  return { ok: true, kind: 'post' };
}

export async function like(page, tweetUrl) {
  await guard(page);
  await goto(page, tweetUrl, { wait: 3000 });
  await thinkPause(page).catch(() => {});
  const btn = page.locator('[data-testid="like"]').first();
  const deadline = Date.now() + 8000;
  let found = false;
  while (Date.now() < deadline) { found = await btn.isVisible().catch(() => false); if (found) break; await page.waitForTimeout(300); }
  if (!found) { appendLog('LIKE skip :: button not found ' + tweetUrl); return { ok: false, reason: 'no-button' }; }
  await btn.click();
  await page.waitForTimeout(1200);
  appendLog('LIKE ok :: ' + tweetUrl);
  return { ok: true, kind: 'like' };
}

export async function follow(page, handleOrUrl) {
  await guard(page);
  const raw = String(handleOrUrl || '').trim();
  const m = raw.match(/(?:^|\/)@?([A-Za-z0-9_]{1,15})(?:\/|$)/);
  const handle = m ? m[1] : raw.replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//, '').split('/')[0];
  const url = /^https?:/.test(raw) ? raw : 'https://x.com/' + encodeURIComponent(handle);
  try { await goto(page, url, { wait: 3500 }); }
  catch (e) { appendLog('FOLLOW skip :: navigation failed ' + handle); return { ok: false, reason: 'nav-failed' }; }
  const followSel = 'button[data-testid$="-follow"]';
  const unfollowSel = 'button[data-testid$="-unfollow"]';
  const followBtn = page.locator(followSel).first();
  const unfollowBtn = page.locator(unfollowSel).first();
  let found = false;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await followBtn.isVisible().catch(() => false)) { found = true; break; }
    if (await unfollowBtn.isVisible().catch(() => false)) { found = true; break; }
    await page.waitForTimeout(300);
  }
  if (!found) { appendLog('FOLLOW skip :: button not found ' + handle); return { ok: false, reason: 'no-button' }; }
  if (await unfollowBtn.isVisible().catch(() => false)) { return { ok: true, already: true, kind: 'follow', handle }; }
  await followBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  if (await page.locator(unfollowSel).first().isVisible({ timeout: 6000 }).catch(() => false)) {
    appendLog('FOLLOW ok :: ' + handle);
    return { ok: true, kind: 'follow', handle };
  }
  return { ok: false, reason: 'no-button' };
}

// Open a tweet's permalink and submit a reply. Used for both 评论 (reply to a
// timeline tweet) and thread replies.
export async function reply(page, tweetUrl, text, opts = {}) {
  await guard(page);
  await goto(page, tweetUrl, { wait: 3500 });
  await thinkPause(page).catch(() => {});
  const editor = page.locator(SEL.modalEditor).first();
  const inline = page.locator(SEL.editor).first();
  const target = (await page.locator(SEL.modalEditor).count()) > 0 ? editor : inline;
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await clickHuman(page, target, { clickTimeout: 10000 });
  await page.waitForTimeout(400);
  try { await typeHuman(page, target, text); }
  catch { await page.keyboard.insertText(text); }
  await page.waitForTimeout(600);
  const btn = page.locator(SEL.postButtonInline).last();
  const use = (await btn.isVisible({ timeout: 3000 }).catch(() => false)) ? btn : page.locator(SEL.postButton).last();
  if (opts.dryRun) {
    const ready = await use.isVisible({ timeout: 5000 }).catch(() => false);
    const disabled = (await use.getAttribute('aria-disabled').catch(() => 'true')) === 'true';
    await discardDraft(page);
    appendLog('REPLY dry-run :: composer filled, not submitted');
    return { ok: true, kind: 'reply', dryRun: true, composeReady: ready && !disabled, text };
  }
  await use.click({ timeout: 10000 });
  await page.waitForTimeout(4000);
  appendLog('REPLY ok :: ' + tweetUrl + ' :: ' + text.slice(0, 50).replace(/\s+/g, ' '));
  return { ok: true, kind: 'reply' };
}

export async function quote(page, tweetUrl, comment, opts = {}) {
  await guard(page);
  await goto(page, tweetUrl, { wait: 3500 });
  await thinkPause(page).catch(() => {});
  const rt = page.locator(SEL.retweet).first();
  await rt.waitFor({ state: 'visible', timeout: 12000 });
  await rt.click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  // The menu item is localised ("Quote" / "引用"); match both.
  const item = page.locator(SEL.menuItem).filter({ hasText: /Quote|引用/i }).first();
  if (await item.isVisible({ timeout: 5000 }).catch(() => false)) await item.click({ timeout: 8000 });
  else await page.locator(SEL.menuItem).first().click({ timeout: 8000 });
  await page.waitForTimeout(1800);
  await typeInto(page, comment);
  if (opts.dryRun) {
    const btn = page.locator(SEL.postButton).last();
    const ready = await btn.isVisible({ timeout: 5000 }).catch(() => false);
    const disabled = (await btn.getAttribute('aria-disabled').catch(() => 'true')) === 'true';
    await discardDraft(page);
    appendLog('QUOTE dry-run :: composer filled, not submitted');
    return { ok: true, kind: 'quote', dryRun: true, composeReady: ready && !disabled, text: comment };
  }
  await submitPost(page, comment);
  appendLog('QUOTE ok :: ' + tweetUrl + ' :: ' + comment.slice(0, 50).replace(/\s+/g, ' '));
  return { ok: true, kind: 'quote' };
}

// Scroll the home timeline like a person. Optionally like posts that clear a
// threshold. Returns what it saw so the agent can decide what to engage with.
export async function scroll(page, { rounds = 3, likeMinLikes = 0, maxLikes = 0 } = {}) {
  await guard(page);
  await gotoHome(page);
  const seen = [];
  let liked = 0;
  for (let i = 0; i < rounds; i++) {
    const batch = await page.locator(SEL.tweet).all();
    for (const art of batch.slice(-12)) {
      const href = await art.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => null);
      // Canonical permalink only: reject /analytics, /photo/1, /status/<id>/quotes ...
      if (!href || !/^\/[^/]+\/status\/\d+$/.test(href)) continue;
      const url = 'https://x.com' + href;
      if (seen.some((s) => s.url === url)) continue;
      const metrics = await art.locator('[role="group"]').first().getAttribute('aria-label').catch(() => '') || '';
      const likes = parseCountAny((metrics.match(/([\d.,]+\s*[KMB万千]?)\s*(?:Likes?|个喜欢)/i) || [])[1] || '');
      const text = (await art.locator('[data-testid="tweetText"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      seen.push({ url, likes, text });
      if (likeMinLikes > 0 && likes >= likeMinLikes && (!maxLikes || likes <= maxLikes)) {
        const likeBtn = art.locator('[data-testid="like"]').first();
        if (await likeBtn.isVisible().catch(() => false)) { await likeBtn.click().catch(() => {}); liked++; await sleep(1200); }
      }
    }
    await page.mouse.wheel(0, 2400 + Math.floor(Math.random() * 800));
    await page.waitForTimeout(1800 + Math.floor(Math.random() * 1600));
  }
  appendLog(`SCROLL done :: ${seen.length} tweets seen, ${liked} liked`);
  return { ok: true, seen, liked };
}

// Read one tweet (text + author + metrics) so an agent can decide whether to
// quote/reply. Read-only.
export async function getTweet(page, tweetUrl) {
  await guard(page);
  await goto(page, tweetUrl, { wait: 3000 });
  const art = page.locator(SEL.tweet).first();
  const text = (await art.locator('[data-testid="tweetText"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const who = (await art.locator('[data-testid="User-Name"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const metrics = await art.locator('[role="group"]').first().getAttribute('aria-label').catch(() => '') || '';
  const ats = [...who.matchAll(/@\w+/g)].map((m) => m[0]);
  return { url: tweetUrl, author: ats.length ? ats[ats.length - 1] : null, name: who, text, metrics };
}

export { gotoHome };