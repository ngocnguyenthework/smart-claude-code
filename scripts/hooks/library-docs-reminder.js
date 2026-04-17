#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: Library Docs Reminder
 *
 * When the user's prompt mentions packages, libraries, frameworks, SDKs, or
 * system-design work that touches third-party support, inject a reminder to
 * pull up-to-date docs via context7 or exa MCP BEFORE writing code. Avoids
 * stale-knowledge / hallucinated-API failure modes.
 *
 * Trigger: keyword regex on the submitted prompt text.
 * Effect:  emits JSON with hookSpecificOutput.additionalContext (silent inject).
 * Exit:    always 0 (advisory, never blocks).
 */

'use strict';

const TRIGGERS = [
  /\b(librar(?:y|ies)|packages?|dependenc(?:y|ies)|modules?)\b/i,
  /\b(sdk|framework|plugin|middleware)\b/i,
  /\b(install|import|require|upgrade|migrate|integrate)\b/i,
  /\b(npm|pnpm|yarn|bun|pip|poetry|uv|pipx|cargo|gem|bundler|go\s+get|maven|gradle|composer|brew)\b/i,
  /\b(api|client)\s+(library|wrapper|sdk)\b/i,
  /\b(system\s+design|architect(?:ure)?\s+(?:for|with|using))\b/i,
  /\busing\s+[a-z][\w.-]+\s+(?:to|for|with|in)\b/i,
];

const REMINDER = [
  'LIBRARY/PACKAGE CONTEXT DETECTED IN PROMPT.',
  '',
  'Before writing code OR recommending a library/version:',
  '  1. For version numbers, release dates, download counts, or CVE claims: fetch LIVE from the package registry. Training data is STALE for these fields.',
  '     - Python: `curl -s https://pypi.org/pypi/<pkg>/json | jq \'{version: .info.version, released: .urls[0].upload_time}\'`',
  '     - Node:   `npm view <pkg> version time.modified dist-tags`   (or `bun pm view <pkg>`)',
  '     - Rust:   `cargo search <pkg> --limit 1`                      (then `cargo info <pkg>`)',
  '     - Go:     `go list -m -versions <module>`',
  '     - Ruby:   `gem info -r <pkg>`',
  '     - Brew:   `brew info <formula>`',
  '     Fallback: exa MCP web search against the official registry URL.',
  '  2. For API shape / usage: resolve via `mcp__context7__resolve-library-id` then `mcp__context7__query-docs`.',
  '  3. Quote the API shape AND cite the registry-fetched version BEFORE writing the call site. Do not rely on training-cutoff memory for library facts.',
  '  4. If a registry lookup fails or is skipped, say so explicitly ("version not verified") rather than inventing a number.',
  '',
  'Skip this only if the work is purely stdlib or first-party code with zero external surface.',
].join('\n');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c.substring(0, 1024 * 1024 - raw.length); });
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const prompt = input?.prompt || '';

    if (!prompt) {
      process.exit(0);
    }

    const hit = TRIGGERS.some(re => re.test(prompt));
    if (!hit) {
      process.exit(0);
    }

    const out = {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: REMINDER,
      },
    };
    process.stdout.write(JSON.stringify(out));
  } catch (err) {
    process.stderr.write('[LibraryDocsReminder] Error: ' + err.message + '\n');
  }
  process.exit(0);
});
