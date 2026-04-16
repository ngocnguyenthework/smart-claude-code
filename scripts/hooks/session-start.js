#!/usr/bin/env node
/**
 * SessionStart Hook - Load previous context on new session
 *
 * Runs when a new Claude session starts. Finds the most recent *-session.tmp
 * file in <project>/.claude/.storage/session-data/ and injects its content as additionalContext.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STORAGE_DIR = path.join(PROJECT_DIR, '.claude', '.storage');
const SESSIONS_DIR = path.join(STORAGE_DIR, 'session-data');
const LEARNED_DIR = path.join(STORAGE_DIR, 'skills', 'learned');
const MCP_FILE = path.join(PROJECT_DIR, '.mcp.json');
const MAX_AGE_DAYS = 7;
const MAX_MCP_SERVERS = 10;

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

function countMcpServers() {
  if (!fs.existsSync(MCP_FILE)) return { count: 0, names: [] };
  try {
    const data = JSON.parse(fs.readFileSync(MCP_FILE, 'utf8'));
    const names = Object.keys(data.mcpServers || {});
    return { count: names.length, names };
  } catch {
    return { count: 0, names: [] };
  }
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

  // Warn when too many MCP servers are configured
  const { count, names } = countMcpServers();
  if (count > MAX_MCP_SERVERS) {
    additionalContextParts.push(
      `MCP server count warning: ${count} servers configured (recommended max: ${MAX_MCP_SERVERS}). `
      + `Active: ${names.join(', ')}. `
      + `Tell the user about this warning and suggest removing unused servers to reduce startup latency and context window consumption.`
    );
  }

  const payload = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: additionalContextParts.join('\n\n'),
    },
  });

  process.stdout.write(payload);
}

main().catch(err => {
  process.stderr.write('[SessionStart] Error: ' + err.message + '\n');
  process.exit(0); // Never block on error
});
