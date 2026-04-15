#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Runs on PreToolUse to suggest manual compaction at logical intervals.
 *
 * Why manual over auto-compact:
 * - Auto-compact happens at arbitrary points, often mid-task
 * - Strategic compacting preserves context through logical phases
 * - Compact after exploration, before execution
 * - Compact after completing a milestone, before starting next
 *
 * Threshold via COMPACT_THRESHOLD env var (default 50, max 10000).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function getTempDir() {
  return process.env.TMPDIR || process.env.TEMP || process.env.TMP || os.tmpdir() || '/tmp';
}

function main() {
  const sessionId = (process.env.CLAUDE_SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const counterFile = path.join(getTempDir(), `sc-tool-count-${sessionId}`);
  const rawThreshold = parseInt(process.env.COMPACT_THRESHOLD || '50', 10);
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 10000
    ? rawThreshold
    : 50;

  let count = 1;

  try {
    const fd = fs.openSync(counterFile, 'a+');
    try {
      const buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
      if (bytesRead > 0) {
        const parsed = parseInt(buf.toString('utf8', 0, bytesRead).trim(), 10);
        count = (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000000)
          ? parsed + 1
          : 1;
      }
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, String(count), 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    try { fs.writeFileSync(counterFile, String(count)); } catch { /* ignore */ }
  }

  if (count === threshold) {
    console.error(`[StrategicCompact] ${threshold} tool calls reached — consider /compact if transitioning phases`);
  } else if (count > threshold && (count - threshold) % 25 === 0) {
    console.error(`[StrategicCompact] ${count} tool calls — good checkpoint for /compact if context is stale`);
  }

  process.exit(0);
}

try { main(); } catch (err) {
  console.error('[StrategicCompact] Error:', err.message);
  process.exit(0);
}
