#!/usr/bin/env node
/**
 * PostToolUse Hook: Type-check Python files after edits.
 *
 * Auto-detects a configured type checker (mypy | pyright | ty) by
 * walking up from the edited file. Runs it on the single edited file
 * and surfaces only errors that mention that file.
 *
 * No-op if no checker config is found — safe to register for any
 * Python project whether or not the team uses a type checker.
 *
 * Detection order: mypy → pyright → ty.
 * Config markers:
 *   mypy     — mypy.ini, .mypy.ini, or [tool.mypy] in pyproject.toml
 *   pyright  — pyrightconfig.json or [tool.pyright] in pyproject.toml
 *   ty       — ty.toml or [tool.ty] in pyproject.toml
 *
 * Runner resolution: project .venv → uv run → poetry run → system bin.
 */

'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';

const PROJECT_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg'];

function walkUp(startDir, fn) {
  let dir = startDir;
  const root = path.parse(dir).root;
  let depth = 0;
  while (dir !== root && depth < 20) {
    const hit = fn(dir);
    if (hit) return { dir, hit };
    dir = path.dirname(dir);
    depth++;
  }
  return null;
}

function findProjectRoot(startDir) {
  const found = walkUp(startDir, dir => PROJECT_MARKERS.some(m => fs.existsSync(path.join(dir, m))));
  return found?.dir || startDir;
}

function pyprojectHasSection(projectRoot, section) {
  const p = path.join(projectRoot, 'pyproject.toml');
  if (!fs.existsSync(p)) return false;
  try {
    const content = fs.readFileSync(p, 'utf8');
    const re = new RegExp(`^\\s*\\[tool\\.${section}(\\..*)?\\]`, 'm');
    return re.test(content);
  } catch {
    return false;
  }
}

function detectChecker(projectRoot) {
  if (
    fs.existsSync(path.join(projectRoot, 'mypy.ini')) ||
    fs.existsSync(path.join(projectRoot, '.mypy.ini')) ||
    pyprojectHasSection(projectRoot, 'mypy')
  ) return 'mypy';

  if (
    fs.existsSync(path.join(projectRoot, 'pyrightconfig.json')) ||
    pyprojectHasSection(projectRoot, 'pyright')
  ) return 'pyright';

  if (
    fs.existsSync(path.join(projectRoot, 'ty.toml')) ||
    pyprojectHasSection(projectRoot, 'ty')
  ) return 'ty';

  return null;
}

function resolveRunner(projectRoot, tool) {
  const venvBin = path.join(projectRoot, '.venv', IS_WIN ? 'Scripts' : 'bin', `${tool}${EXE}`);
  if (fs.existsSync(venvBin)) return { bin: venvBin, prefix: [] };
  if (fs.existsSync(path.join(projectRoot, 'uv.lock'))) return { bin: `uv${EXE}`, prefix: ['run', tool] };
  if (fs.existsSync(path.join(projectRoot, 'poetry.lock'))) return { bin: `poetry${EXE}`, prefix: ['run', tool] };
  return { bin: `${tool}${EXE}`, prefix: [] };
}

function runCheck(bin, args, cwd) {
  try {
    execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
    return '';
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
}

function filterRelevant(output, targetPath, projectRoot) {
  const rel = path.relative(projectRoot, targetPath);
  const candidates = new Set([targetPath, rel]);
  return output
    .split('\n')
    .filter(line => {
      for (const c of candidates) {
        if (c && line.includes(c)) return true;
      }
      return false;
    })
    .slice(0, 10);
}

function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePath = input.tool_input?.file_path;
    if (!filePath || !/\.py$/.test(filePath)) return rawInput;

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return rawInput;

    const projectRoot = findProjectRoot(path.dirname(resolved));
    const checker = detectChecker(projectRoot);
    if (!checker) return rawInput;

    const { bin, prefix } = resolveRunner(projectRoot, checker);
    const args = checker === 'pyright'
      ? [...prefix, '--outputjson', resolved]
      : [...prefix, resolved];

    const output = runCheck(bin, args, projectRoot);
    if (!output) return rawInput;

    const lines = filterRelevant(output, resolved, projectRoot);
    if (lines.length > 0) {
      console.error(`[Hook] ${checker} errors in ${path.basename(filePath)}:`);
      lines.forEach(l => console.error(l));
    }
  } catch {
    // Invalid input, missing tool, or unreadable file — pass through silently
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
