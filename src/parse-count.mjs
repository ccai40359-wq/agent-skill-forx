// Extract engagement counts from X's aria-label (locale-tolerant).
// Examples: "123 Likes. Like", "1.2K Likes. Like", "0 个喜欢", "3.4万"
export function parseCountAny(text) {
  if (!text) return 0;
  const m = String(text).trim().match(/([\d.,]+)\s*([KMB万千]?)/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return 0;
  const u = (m[2] || '').toUpperCase();
  if (u === 'K') return Math.round(n * 1e3);
  if (u === 'M') return Math.round(n * 1e6);
  if (u === 'B') return Math.round(n * 1e9);
  if (u === '万') return Math.round(n * 1e4);
  if (u === '千') return Math.round(n * 1e3);
  return Math.round(n);
}
export const parseLikeCount = parseCountAny;