// Guard tests: block detection + content screening, fully offline.
import { detectBlock, screenContent } from '../src/ops.mjs';

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, ok: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`); };

// --- detectBlock ---------------------------------------------------------
function mockPage({ url = 'https://x.com/home', body = '', compose = true, login = false, field = false }) {
  const mk = (v) => ({ first() { return this; }, isVisible: async () => v });
  return {
    url: () => url,
    locator: (sel) => {
      if (sel === 'body') return { innerText: async () => body };
      if (sel.includes('SideNav_NewTweet_Button')) return mk(compose);
      if (sel.includes('a[href="/login"]')) return mk(login);
      if (sel.includes('input')) return mk(field);
      return mk(false);
    },
  };
}

let r = await detectBlock(mockPage({}));
ok('clean home page is not blocked', r.blocked === false, JSON.stringify(r));
r = await detectBlock(mockPage({ url: 'https://x.com/i/flow/login' }));
ok('login route -> signed-out', r.blocked && r.reason === 'signed-out', JSON.stringify(r));
r = await detectBlock(mockPage({ url: 'https://x.com/i/jf/onboarding/web?mode=login' }));
ok('current onboarding login route -> signed-out', r.blocked && r.reason === 'signed-out', JSON.stringify(r));
r = await detectBlock(mockPage({ body: 'Verify you are a human' }));
ok('captcha text -> captcha', r.blocked && r.reason === 'captcha', JSON.stringify(r));
r = await detectBlock(mockPage({ body: 'Your account is temporarily locked' }));
ok('lock text -> locked', r.blocked && r.reason === 'locked', JSON.stringify(r));
r = await detectBlock(mockPage({ body: 'rate limit exceeded' }));
ok('rate text -> rate-limit', r.blocked && r.reason === 'rate-limit', JSON.stringify(r));
r = await detectBlock(mockPage({ body: 'This looks like it might be automated' }));
ok('action-blocked text -> action-blocked', r.blocked && r.reason === 'action-blocked', JSON.stringify(r));
r = await detectBlock(mockPage({ compose: false, login: true }));
ok('no compose + login affordance -> signed-out', r.blocked && r.reason === 'signed-out', JSON.stringify(r));
r = await detectBlock(mockPage({ compose: false, field: true }));
ok('no compose + login field -> signed-out', r.blocked && r.reason === 'signed-out', JSON.stringify(r));

// --- screenContent -------------------------------------------------------
ok('clean text passes', screenContent('今天读了篇不错的论文').ok === true);
ok('spam is hard-blocked', screenContent('加微信 兼职 刷单').ok === false, JSON.stringify(screenContent('加微信 兼职 刷单')));
ok('adult is hard-blocked', screenContent('裸聊 色情').ok === false);
ok('illegal is hard-blocked', screenContent('洗钱 假证').ok === false);
ok('politics blocked by default', screenContent('这次大选结果').reason === 'category-disabled:politics');
ok('finance blocked by default', screenContent('建议买入 目标价 20').reason === 'category-disabled:finance');
ok('politics passes when explicitly allowed', screenContent('这次大选结果', { safety: { allowPolitics: true } }).ok === true);
ok('finance passes when explicitly allowed', screenContent('建议买入 目标价 20', { safety: { allowFinance: true } }).ok === true);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;