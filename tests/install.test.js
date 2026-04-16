'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const INSTALL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'install.js');

function runInstall(args) {
  return spawnSync(process.execPath, [INSTALL_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sc-install-'));
}

test('--help exits 0 and prints usage', () => {
  const result = runInstall(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /smart-claude install script/);
  assert.match(result.stdout, /--context/);
});

test('no args prints help and exits non-zero', () => {
  const result = runInstall([]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /--context/);
});

test('--context frontend --dry-run plans without writing', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'frontend', '--dir', tmpDir, '--dry-run']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /Contexts:\s+common \+ frontend/);
    assert.match(result.stdout, /would-copy/);
    assert.equal(fs.readdirSync(tmpDir).length, 0, 'dry-run must not write files');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context nestjs copies agents and writes merged settings', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'nestjs', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const claudeDir = path.join(tmpDir, '.claude');
    assert.ok(fs.existsSync(path.join(claudeDir, 'settings.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.mcp.json')), 'MCP config lands at project root (.mcp.json)');
    assert.ok(!fs.existsSync(path.join(claudeDir, 'mcp-servers.json')), 'legacy mcp-servers.json must not be written');
    assert.ok(fs.existsSync(path.join(claudeDir, 'agents', 'planner.md')), 'common agent should land');
    assert.ok(
      fs.existsSync(path.join(claudeDir, 'agents', 'nestjs-reviewer.md')),
      'nestjs agent should land',
    );
    assert.ok(
      !fs.existsSync(path.join(claudeDir, 'agents', 'fastapi-reviewer.md')),
      'fastapi agents should NOT land when installing nestjs only',
    );
    assert.ok(
      !fs.existsSync(path.join(claudeDir, 'agents', 'terraform-reviewer.md')),
      'devops agents should NOT land when installing nestjs',
    );
    assert.ok(fs.existsSync(path.join(claudeDir, 'scripts', 'hooks', 'run-with-flags.js')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'scripts')), 'scripts must nest under .claude/, not project root');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context fastapi copies FastAPI agent but not NestJS agent', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'fastapi', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const agents = path.join(tmpDir, '.claude', 'agents');
    assert.ok(fs.existsSync(path.join(agents, 'fastapi-reviewer.md')));
    assert.ok(fs.existsSync(path.join(agents, 'database-reviewer.md')), 'shared DB reviewer duplicated into fastapi');
    assert.ok(!fs.existsSync(path.join(agents, 'nestjs-reviewer.md')), 'nestjs agent must not land in fastapi-only install');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context fastapi,nestjs dedupes shared files without --force collisions', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'fastapi,nestjs', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const agents = path.join(tmpDir, '.claude', 'agents');
    assert.ok(fs.existsSync(path.join(agents, 'fastapi-reviewer.md')));
    assert.ok(fs.existsSync(path.join(agents, 'nestjs-reviewer.md')));
    assert.ok(fs.existsSync(path.join(agents, 'database-reviewer.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context all installs every context', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'all', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const agents = path.join(tmpDir, '.claude', 'agents');
    assert.ok(fs.existsSync(path.join(agents, 'nestjs-reviewer.md')));
    assert.ok(fs.existsSync(path.join(agents, 'fastapi-reviewer.md')));
    assert.ok(fs.existsSync(path.join(agents, 'terraform-reviewer.md')));
    assert.ok(fs.existsSync(path.join(agents, 'frontend-reviewer.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('unknown context exits with error', () => {
  const result = runInstall(['--context', 'does-not-exist', '--dry-run']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown context/);
});

test('cursor target flattens rules to rules/<stack>-<name>.mdc', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall([
      '--context',
      'devops',
      '--target',
      'cursor',
      '--dir',
      tmpDir,
      '--dry-run',
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /rules\/terraform-patterns\.mdc/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('codex target routes rules/agents into references/', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall([
      '--context',
      'nestjs',
      '--target',
      'codex',
      '--dir',
      tmpDir,
      '--dry-run',
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /references\/agents\/nestjs-reviewer\.md/);
    assert.match(result.stdout, /references\/rules\/nestjs/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--skip-scripts suppresses scripts/hooks copy', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'common', '--dir', tmpDir, '--skip-scripts']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'scripts')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'scripts')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('existing files are skipped unless --force is set', () => {
  const tmpDir = mkTmp();
  try {
    // First install seeds the directory.
    runInstall(['--context', 'common', '--dir', tmpDir]);
    // Corrupt one file — install without --force must NOT overwrite.
    const victim = path.join(tmpDir, '.claude', 'settings.json');
    fs.writeFileSync(victim, '// sentinel marker');
    const secondRun = runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(secondRun.status, 0);
    assert.equal(fs.readFileSync(victim, 'utf8'), '// sentinel marker');
    // With --force the sentinel gets replaced.
    runInstall(['--context', 'common', '--dir', tmpDir, '--force']);
    assert.notEqual(fs.readFileSync(victim, 'utf8'), '// sentinel marker');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context common copies common-README.md and INTERNALS.md to .claude/docs/', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const docsDir = path.join(tmpDir, '.claude', 'docs');
    assert.ok(fs.existsSync(path.join(docsDir, 'common-README.md')), 'common README must land in docs/');
    assert.ok(fs.existsSync(path.join(docsDir, 'INTERNALS.md')), 'INTERNALS.md must land in docs/');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context fastapi,devops copies per-context READMEs', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'fastapi,devops', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const docsDir = path.join(tmpDir, '.claude', 'docs');
    assert.ok(fs.existsSync(path.join(docsDir, 'common-README.md')));
    assert.ok(fs.existsSync(path.join(docsDir, 'fastapi-README.md')));
    assert.ok(fs.existsSync(path.join(docsDir, 'devops-README.md')));
    assert.ok(fs.existsSync(path.join(docsDir, 'INTERNALS.md')));
    assert.ok(!fs.existsSync(path.join(docsDir, 'nestjs-README.md')), 'uninstalled context README must not land');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--dry-run lists docs in the plan output without writing them', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'nestjs', '--dir', tmpDir, '--dry-run']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /\[docs\].+nestjs-README\.md/);
    assert.match(result.stdout, /\[docs\].+INTERNALS\.md/);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'docs')), 'dry-run must not create docs/');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--target cursor does not create .cursor/docs/', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'frontend', '--target', 'cursor', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.cursor', 'docs')), 'cursor target must not carry docs');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--force overwrites an existing INTERNALS.md', () => {
  const tmpDir = mkTmp();
  try {
    runInstall(['--context', 'common', '--dir', tmpDir]);
    const victim = path.join(tmpDir, '.claude', 'docs', 'INTERNALS.md');
    fs.writeFileSync(victim, '# sentinel');
    runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(fs.readFileSync(victim, 'utf8'), '# sentinel', 'no --force should skip');
    runInstall(['--context', 'common', '--dir', tmpDir, '--force']);
    assert.notEqual(fs.readFileSync(victim, 'utf8'), '# sentinel', '--force must overwrite');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
