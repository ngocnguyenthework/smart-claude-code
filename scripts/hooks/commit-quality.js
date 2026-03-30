#!/usr/bin/env node
/**
 * PreToolUse Hook: Commit Quality Gate (Bash)
 *
 * Runs before git commit commands. Checks staged files for:
 * - Hardcoded secrets (AWS keys, OpenAI keys, GitHub PATs) → blocks (exit 2)
 * - debugger statements → blocks (exit 2)
 * - console.log → warns (exit 0)
 * - Validates conventional commit message format → warns (exit 0)
 *
 * Exit codes: 0 = allow, 2 = block
 */

'use strict';

const { spawnSync } = require('child_process');

const SECRET_PATTERNS = [
  { re: /AKIA[A-Z0-9]{16}/,           name: 'AWS Access Key' },
  { re: /sk-[a-zA-Z0-9]{20,}/,        name: 'OpenAI API key' },
  { re: /ghp_[a-zA-Z0-9]{36}/,        name: 'GitHub PAT' },
  { re: /sk-ant-[a-zA-Z0-9\-]{20,}/,  name: 'Anthropic API key' },
];

const CONVENTIONAL_COMMIT = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:\s*.+/;
const CODE_EXTS = /\.(js|jsx|ts|tsx|py|go|rs)$/;

function getStagedFiles() {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
  if (r.status !== 0) return [];
  return r.stdout.trim().split('\n').filter(Boolean);
}

function getStagedContent(filePath) {
  const r = spawnSync('git', ['show', `:${filePath}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c.substring(0, 1024 * 1024 - raw.length); });
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const command = input.tool_input?.command || '';

    // Only run for git commit (not amend)
    if (!command.includes('git commit') || command.includes('--amend')) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const stagedFiles = getStagedFiles();
    if (stagedFiles.length === 0) {
      process.stdout.write(raw);
      process.exit(0);
    }

    process.stderr.write(`[CommitQuality] Checking ${stagedFiles.length} staged file(s)...\n`);

    let hasErrors = false;
    const warnings = [];

    // Scan staged file content
    for (const file of stagedFiles.filter(f => CODE_EXTS.test(f))) {
      const content = getStagedContent(file);
      if (!content) continue;
      const lines = content.split('\n');

      lines.forEach((line, i) => {
        const lineNum = i + 1;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#')) return;

        // Secrets → block
        for (const { re, name } of SECRET_PATTERNS) {
          if (re.test(line)) {
            process.stderr.write(`[CommitQuality] BLOCKED: ${name} in ${file}:${lineNum}\n`);
            hasErrors = true;
          }
        }

        // debugger → block
        if (/\bdebugger\b/.test(line)) {
          process.stderr.write(`[CommitQuality] BLOCKED: debugger statement in ${file}:${lineNum}\n`);
          hasErrors = true;
        }

        // console.log → warn
        if (line.includes('console.log')) {
          warnings.push(`console.log in ${file}:${lineNum}`);
        }
      });
    }

    // Validate commit message
    const msgMatch = command.match(/(?:-m|--message)[=\s]+["']([^"']+)["']/);
    if (msgMatch) {
      const msg = msgMatch[1];
      if (!CONVENTIONAL_COMMIT.test(msg)) {
        warnings.push(`Commit message not conventional: "${msg}"\n  Suggestion: feat|fix|docs|style|refactor|test|chore: description`);
      }
      if (msg.length > 72) {
        warnings.push(`Commit message too long (${msg.length} chars, max 72)`);
      }
    }

    // Output warnings
    for (const w of warnings) {
      process.stderr.write(`[CommitQuality] WARNING: ${w}\n`);
    }

    if (hasErrors) {
      process.stderr.write('[CommitQuality] Commit blocked. Fix issues above before committing.\n');
      process.stdout.write(raw);
      process.exit(2);
    }

    if (warnings.length > 0) {
      process.stderr.write('[CommitQuality] Warnings found. Commit allowed but consider fixing.\n');
    } else {
      process.stderr.write('[CommitQuality] All checks passed.\n');
    }

  } catch (err) {
    process.stderr.write('[CommitQuality] Error: ' + err.message + '\n');
  }

  process.stdout.write(raw);
  process.exit(0);
});
