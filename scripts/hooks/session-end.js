#!/usr/bin/env node
/**
 * Stop Hook (Session End) - Persist session summary for cross-session continuity
 *
 * Reads transcript_path from stdin JSON. Extracts user messages, tools used,
 * and files modified. Creates/updates ~/.claude/session-data/YYYY-MM-DD-<shortid>-session.tmp
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'session-data');
const SUMMARY_START = '<!-- ECC:SUMMARY:START -->';
const SUMMARY_END = '<!-- ECC:SUMMARY:END -->';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(msg) {
  process.stderr.write(msg + '\n');
}

function getDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getTimeString() {
  return new Date().toLocaleTimeString();
}

function getShortId() {
  // Use session env var if available, else random
  const sessionId = process.env.CLAUDE_SESSION_ID || '';
  return sessionId.slice(0, 8) || Math.random().toString(36).slice(2, 10);
}

function getProjectName() {
  try {
    const pkg = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkg)) {
      const data = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      return data.name || path.basename(process.cwd());
    }
  } catch {}
  return path.basename(process.cwd());
}

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString().trim();
  } catch {
    return 'unknown';
  }
}

function extractSummary(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return null;

  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const userMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // User messages
      if (entry.type === 'user' || entry.role === 'user' || entry.message?.role === 'user') {
        const raw = entry.message?.content ?? entry.content;
        const text = typeof raw === 'string'
          ? raw
          : Array.isArray(raw) ? raw.map(c => c?.text || '').join(' ') : '';
        const cleaned = text.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (cleaned) userMessages.push(cleaned.slice(0, 200));
      }

      // Tools from assistant message content blocks
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            if (block.name) toolsUsed.add(block.name);
            const fp = block.input?.file_path || '';
            if (fp && (block.name === 'Edit' || block.name === 'Write')) {
              filesModified.add(fp);
            }
          }
        }
      }
    } catch {}
  }

  if (userMessages.length === 0) return null;
  return {
    userMessages: userMessages.slice(-10),
    toolsUsed: [...toolsUsed].slice(0, 20),
    filesModified: [...filesModified].slice(0, 30),
    totalMessages: userMessages.length
  };
}

function buildSummaryBlock(summary) {
  let s = '## Session Summary\n\n### Tasks\n';
  for (const msg of summary.userMessages) {
    s += `- ${msg.replace(/\n/g, ' ').replace(/`/g, '\\`')}\n`;
  }
  if (summary.filesModified.length > 0) {
    s += '\n### Files Modified\n';
    for (const f of summary.filesModified) s += `- ${f}\n`;
  }
  if (summary.toolsUsed.length > 0) {
    s += `\n### Tools Used\n${summary.toolsUsed.join(', ')}\n`;
  }
  s += `\n### Stats\n- Total user messages: ${summary.totalMessages}\n`;
  return `${SUMMARY_START}\n${s.trim()}\n${SUMMARY_END}`;
}

function buildHeader(today, timeStr, project, branch) {
  return [
    `# Session: ${today}`,
    `**Date:** ${today}`,
    `**Started:** ${timeStr}`,
    `**Last Updated:** ${timeStr}`,
    `**Project:** ${project}`,
    `**Branch:** ${branch}`,
    `**Worktree:** ${process.cwd()}`,
    ''
  ].join('\n');
}

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { stdinData += c.substring(0, 1024 * 1024 - stdinData.length); });
process.stdin.on('end', () => {
  main().catch(err => {
    process.stderr.write('[SessionEnd] Error: ' + err.message + '\n');
    process.exit(0);
  });
});

async function main() {
  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinData);
    transcriptPath = input.transcript_path;
  } catch {
    transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  }

  ensureDir(SESSIONS_DIR);

  const today = getDateString();
  const timeStr = getTimeString();
  const shortId = getShortId();
  const sessionFile = path.join(SESSIONS_DIR, `${today}-${shortId}-session.tmp`);
  const project = getProjectName();
  const branch = getBranch();

  const summary = transcriptPath ? extractSummary(transcriptPath) : null;

  if (fs.existsSync(sessionFile)) {
    let content = fs.readFileSync(sessionFile, 'utf8');
    // Update Last Updated line
    content = content.replace(/\*\*Last Updated:\*\* .+/, `**Last Updated:** ${timeStr}`);
    // Update summary block
    if (summary) {
      const block = buildSummaryBlock(summary);
      if (content.includes(SUMMARY_START)) {
        content = content.replace(
          new RegExp(`${SUMMARY_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${SUMMARY_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          block
        );
      } else {
        content += '\n\n' + block;
      }
    }
    fs.writeFileSync(sessionFile, content);
    log(`[SessionEnd] Updated: ${sessionFile}`);
  } else {
    const summarySection = summary
      ? `${buildSummaryBlock(summary)}\n\n### Notes for Next Session\n-\n\n### Context to Load\n\`\`\`\n[relevant files]\n\`\`\``
      : `## Current State\n\n[Session context goes here]\n\n### Completed\n- [ ]\n\n### In Progress\n- [ ]\n\n### Notes for Next Session\n-`;

    const content = `${buildHeader(today, timeStr, project, branch)}\n---\n${summarySection}\n`;
    fs.writeFileSync(sessionFile, content);
    log(`[SessionEnd] Created: ${sessionFile}`);
  }

  process.exit(0);
}
