// agent-skill-forx — human-like browser behaviour.
// The whole point of this module: remove the two loudest automation tells,
// instant text insertion and instantaneous clicking with no lead-up. Nothing
// here is X-specific; it is generic mouse/keyboard humanisation.
//
// Every delay is randomised. Timing profiles are configurable so a caller can
// move between "cautious" (default) and "brisk" without editing code.
import { randomInt } from 'node:crypto';

// crypto random, not Math.random: the schedule should not be reproducible.
function rand(a, b) { return (randomInt(0, 2 ** 32) / 2 ** 32) * (b - a) + a; }
function randInt(a, b) { return randomInt(a, b + 1); }
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export const DEFAULTS = {
  charDelayMin: 30,
  charDelayMax: 100,
  cjkMultiplier: 1.3,
  pauseMin: 2000,
  pauseMax: 5000,
  warmupScrollsMin: 3,
  warmupScrollsMax: 5,
  scrollStepMin: 200,
  scrollStepMax: 900,
  moveStepsMin: 8,
  moveStepsMax: 20,
  jitterPx: 3,
};

export function pickTimingProfile(cfg = {}) {
  return { ...DEFAULTS, ...(cfg.humanize || {}), ...(cfg || {}) };
}

// Per-character typing with randomised delay. CJK gets a little more dwell
// time, which also reads as more human than a uniform rate. A rare longer
// pause mid-sentence mimics thinking.
export async function typeHuman(page, locator, text, opts = {}) {
  const p = pickTimingProfile(opts.cfg || {});
  const min = opts.charDelayMin ?? p.charDelayMin;
  const max = opts.charDelayMax ?? p.charDelayMax;
  await locator.click({ timeout: opts.clickTimeout ?? 10000 });
  await sleep(rand(120, 400));
  const started = Date.now();
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    const isCJK = ch.codePointAt(0) >= 0x1100;
    let d = rand(min, max);
    if (isCJK) d *= p.cjkMultiplier;
    if (rand(0, 1) < 0.06) d += rand(300, 1200);
    await sleep(d);
  }
  return Date.now() - started;
}

export async function thinkPause(_page, opts = {}) {
  const p = pickTimingProfile(opts.cfg || {});
  const ms = opts.ms ?? rand(p.pauseMin, p.pauseMax);
  await sleep(ms);
  return ms;
}

export async function scrollWarmup(page, opts = {}) {
  const p = pickTimingProfile(opts.cfg || {});
  const rolls = opts.rolls ?? randInt(p.warmupScrollsMin, p.warmupScrollsMax);
  for (let i = 0; i < rolls; i++) {
    const dy = rand(p.scrollStepMin, p.scrollStepMax) * (rand(0, 1) < 0.25 ? -1 : 1);
    await page.mouse.wheel(0, dy).catch(() => {});
    await sleep(rand(150, 600));
  }
  return rolls;
}

// Move the pointer along a smoothstep-eased path instead of teleporting.
export async function moveHuman(page, point, opts = {}) {
  const p = pickTimingProfile(opts.cfg || {});
  const steps = opts.steps ?? randInt(p.moveStepsMin, p.moveStepsMax);
  const from = opts.from || await page.evaluate(() => ({ x: globalThis.__forxX ?? 0, y: globalThis.__forxY ?? 0 })).catch(() => ({ x: 0, y: 0 }));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    const x = from.x + (point.x - from.x) * ease + rand(-p.jitterPx, p.jitterPx);
    const y = from.y + (point.y - from.y) * ease + rand(-p.jitterPx, p.jitterPx);
    await page.mouse.move(x, y).catch(() => {});
    await sleep(rand(8, 35));
  }
  await page.evaluate((q) => { globalThis.__forxX = q.x; globalThis.__forxY = q.y; }, point).catch(() => {});
}

export async function clickHuman(page, locator, opts = {}) {
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await moveHuman(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, opts);
    await sleep(rand(80, 260));
  }
  await locator.click({ timeout: opts.clickTimeout ?? 10000 });
}

export { rand, randInt };