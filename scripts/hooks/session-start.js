#!/usr/bin/env node
/**
 * SessionStart Hook - Load previous context on new session
 *
 * Runs when a new Claude session starts. Finds the most recent *-session.tmp
 * file in ~/.claude/session-data/ and injects its content as additionalContext.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'session-data');
const LEARNED_DIR = path.join(CLAUDE_DIR, 'skills', 'learned');
const MAX_AGE_DAYS = 7;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function findRecentSessions(dir, maxAgeDays) {
  if (!fs.existsSync(dir)) return [];
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('-session.tmp'))
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { path: full, mtime: stat.mtimeMs };
    })
    .filter(f => f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);
}

function log(msg) {
  process.stderr.write(msg + '\n');
}

async function main() {
  ensureDir(SESSIONS_DIR);
  ensureDir(LEARNED_DIR);

  const additionalContextParts = [];

  // Load most recent session
  const sessions = findRecentSessions(SESSIONS_DIR, MAX_AGE_DAYS);
  if (sessions.length > 0) {
    const latest = sessions[0];
    log(`[SessionStart] Found ${sessions.length} recent session(s). Latest: ${latest.path}`);
    const content = fs.readFileSync(latest.path, 'utf8').trim();
    if (content && !content.includes('[Session context goes here]')) {
      additionalContextParts.push(`Previous session summary:\n${content}`);
    }
  } else {
    log('[SessionStart] No recent sessions found.');
  }

  // Report learned skills
  if (fs.existsSync(LEARNED_DIR)) {
    const learned = fs.readdirSync(LEARNED_DIR).filter(f => f.endsWith('.md'));
    if (learned.length > 0) {
      log(`[SessionStart] ${learned.length} learned skill(s) in ${LEARNED_DIR}`);
    }
  }

  const payload = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: additionalContextParts.join('\n\n')
    }
  });

  process.stdout.write(payload);
}

main().catch(err => {
  process.stderr.write('[SessionStart] Error: ' + err.message + '\n');
  process.exit(0); // Never block on error
});
