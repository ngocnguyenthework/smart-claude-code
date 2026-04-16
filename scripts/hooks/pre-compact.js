#!/usr/bin/env node
/**
 * PreCompact Hook - Save state marker before context compaction
 *
 * Runs before Claude compacts context. Appends a compaction marker to the
 * active session file so the session log records when summaries happened.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', '.storage', 'session-data');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function findLatestSession(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('-session.tmp'))
    .map(f => ({ path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

function log(msg) {
  process.stderr.write(msg + '\n');
}

async function main() {
  ensureDir(SESSIONS_DIR);

  const timestamp = new Date().toISOString();
  const compactionLog = path.join(SESSIONS_DIR, 'compaction-log.txt');
  fs.appendFileSync(compactionLog, `[${timestamp}] Context compaction triggered\n`);

  const activeSession = findLatestSession(SESSIONS_DIR);
  if (activeSession) {
    const timeStr = new Date().toLocaleTimeString();
    fs.appendFileSync(activeSession, `\n---\n**[Compaction at ${timeStr}]** - Context was summarized\n`);
    log(`[PreCompact] Marked compaction in ${activeSession}`);
  }

  log('[PreCompact] State saved before compaction');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write('[PreCompact] Error: ' + err.message + '\n');
  process.exit(0);
});
