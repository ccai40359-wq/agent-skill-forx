// Minimal logger. Writes to stdout and, when FORX_LOG is set, appends there.
import { appendFileSync } from 'node:fs';

export function nowLocal() {
  return new Date().toLocaleString('en-GB', { hour12: false, timeZone: process.env.FORX_TZ || 'Asia/Shanghai' });
}

export function appendLog(msg) {
  const line = `[${nowLocal()}] ${msg}`;
  console.log(line);
  if (process.env.FORX_LOG) { try { appendFileSync(process.env.FORX_LOG, line + '\n'); } catch {} }
}