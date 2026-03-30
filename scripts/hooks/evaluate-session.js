#!/usr/bin/env node
/**
 * Evaluate Session Hook (Stop - async)
 *
 * Counts user messages in the transcript. If the session has ≥10 messages,
 * logs a signal to stderr prompting Claude to extract reusable patterns
 * to ~/.claude/skills/learned/ via the /learn command.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LEARNED_DIR = path.join(os.homedir(), '.claude', 'skills', 'learned');
const MIN_MESSAGES = 10;

function log(msg) {
  process.stderr.write(msg + '\n');
}

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { stdinData += c.substring(0, 1024 * 1024 - stdinData.length); });
process.stdin.on('end', () => {
  main().catch(err => {
    process.stderr.write('[EvaluateSession] Error: ' + err.message + '\n');
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

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  // Count user messages
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const matches = content.match(/"type"\s*:\s*"user"/g);
  const messageCount = matches ? matches.length : 0;

  if (messageCount < MIN_MESSAGES) {
    log(`[EvaluateSession] Session too short (${messageCount} messages), skipping pattern extraction`);
    process.exit(0);
  }

  // Ensure learned dir exists
  if (!fs.existsSync(LEARNED_DIR)) {
    fs.mkdirSync(LEARNED_DIR, { recursive: true });
  }

  log(`[EvaluateSession] Session has ${messageCount} messages — evaluate for extractable patterns`);
  log(`[EvaluateSession] Save learned skills to: ${LEARNED_DIR}`);
  log(`[EvaluateSession] Tip: Use /learn to extract patterns from this session`);

  process.exit(0);
}
