// Humanisation tests: fully offline, mocked page. No browser, no network.
import { typeHuman, thinkPause, scrollWarmup, moveHuman, pickTimingProfile, DEFAULTS } from '../src/humanize.mjs';

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, ok: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`); };

function mockPage() {
  const typed = [];
  const wheels = [];
  const moves = [];
  return {
    typed, wheels, moves,
    keyboard: { type: async (ch, opts) => { typed.push({ ch, delay: opts?.delay }); } },
    mouse: { wheel: async (x, y) => { wheels.push(y); }, move: async (x, y) => { moves.push([x, y]); } },
    waitForTimeout: async () => {},
    evaluate: async () => ({ x: 0, y: 0 }),
    _loc: null,
  };
}

const text = 'Hello 中文 123';
let page = mockPage();
let clicks = 0;
const locator = { click: async () => { clicks++; } };
const t0 = Date.now();
await typeHuman(page, locator, text, { cfg: { humanize: { charDelayMin: 1, charDelayMax: 2 } } });
const chars = page.typed.map((t) => t.ch).join('');
ok('every character is typed, in order', chars === text, `got="${chars}"`);
ok('typing is not instantaneous', Date.now() - t0 > 5, `${Date.now() - t0}ms`);
ok('each keystroke uses delay:0 (we control the pace)', page.typed.every((t) => t.delay === 0));
ok('the field is clicked first', clicks === 1, `clicks=${clicks}`);

// thinkPause honours an explicit window
const t1 = Date.now();
const w = await thinkPause(mockPage(), { ms: 120 });
ok('thinkPause waits the requested time', w === 120 && Date.now() - t1 >= 115, `waited ${Date.now() - t1}ms`);

// warmup scrolls a bounded number of times, in both directions eventually possible
page = mockPage();
const rolls = await scrollWarmup(page, { rolls: 4 });
ok('warmup performs the requested number of scrolls', rolls === 4 && page.wheels.length === 4, `rolls=${rolls}`);

// pointer moves along a path, not a teleport
page = mockPage();
await moveHuman(page, { x: 100, y: 50 }, { cfg: { humanize: { moveStepsMin: 10, moveStepsMax: 10 } } });
ok('pointer follows a multi-step path (not a teleport)', page.moves.length === 10, `moves=${page.moves.length}`);
ok('path ends near the target', Math.abs(page.moves.at(-1)[0] - 100) < 5 && Math.abs(page.moves.at(-1)[1] - 50) < 5, JSON.stringify(page.moves.at(-1)));

// profile merge
const prof = pickTimingProfile({ humanize: { charDelayMin: 5 } });
ok('timing profile merges over defaults', prof.charDelayMin === 5 && prof.charDelayMax === DEFAULTS.charDelayMax);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;