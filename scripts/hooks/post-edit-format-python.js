#!/usr/bin/env node
/**
 * PostToolUse Hook: Auto-format Python files after edits.
 *
 * Runs ruff format + ruff check --fix on the edited .py file. Resolves
 * the ruff binary in priority order: project .venv → uv run → poetry run
 * → system ruff. No-op silently if none are available.
 *
 * Project root = nearest directory above the file that contains one of
 * pyproject.toml / setup.py / setup.cfg / .ruff.toml / ruff.toml.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';

const ROOT_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg', '.ruff.toml', 'ruff.toml'];

function findProjectRoot(startDir) {
  let dir = startDir;
  const root = path.parse(dir).root;
  let depth = 0;
  while (dir !== root && depth < 20) {
    for (const marker of ROOT_MARKERS) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    dir = path.dirname(dir);
    depth++;
  }
  return startDir;
}

function resolveRuff(projectRoot) {
  const venvBin = path.join(projectRoot, '.venv', IS_WIN ? 'Scripts' : 'bin', `ruff${EXE}`);
  if (fs.existsSync(venvBin)) return { bin: venvBin, prefix: [] };

  if (fs.existsSync(path.join(projectRoot, 'uv.lock'))) {
    return { bin: `uv${EXE}`, prefix: ['run', 'ruff'] };
  }
  if (fs.existsSync(path.join(projectRoot, 'poetry.lock'))) {
    return { bin: `poetry${EXE}`, prefix: ['run', 'ruff'] };
  }
  return { bin: `ruff${EXE}`, prefix: [] };
}

function runRuff(bin, args, cwd) {
  execFileSync(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
}

function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePath = input.tool_input?.file_path;
    if (!filePath || !/\.py$/.test(filePath)) return rawInput;

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return rawInput;

    const projectRoot = findProjectRoot(path.dirname(resolved));
    const { bin, prefix } = resolveRuff(projectRoot);

    try { runRuff(bin, [...prefix, 'format', resolved], projectRoot); } catch {}
    try { runRuff(bin, [...prefix, 'check', '--fix', resolved], projectRoot); } catch {}
  } catch {
    // Invalid input or missing tool — pass through silently
  }
  return rawInput;
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      data += chunk.substring(0, MAX_STDIN - data.length);
    }
  });
  process.stdin.on('end', () => {
    data = run(data);
    process.stdout.write(data);
    process.exit(0);
  });
}

module.exports = { run };
