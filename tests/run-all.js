#!/usr/bin/env node
/**
 * Test runner — discovers and runs every *.test.js file under tests/
 * using Node's built-in `node:test` harness (no external deps).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TESTS_DIR = __dirname;

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) results.push(full);
  }
  return results;
}

function main() {
  const files = walk(TESTS_DIR).sort();
  if (files.length === 0) {
    console.log('[tests] No *.test.js files found.');
    return;
  }

  console.log(`[tests] Running ${files.length} test file(s)...\n`);
  const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    cwd: path.resolve(TESTS_DIR, '..'),
  });

  process.exit(result.status ?? 1);
}

main();
