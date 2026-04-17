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

test('--context fastapi copies only Python hook scripts, not JS/TS ones', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'fastapi', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const hooks = path.join(tmpDir, '.claude', 'scripts', 'hooks');
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-format-python.js')), 'Python formatter hook must land');
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-typecheck-python.js')), 'Python typecheck hook must land');
    assert.ok(!fs.existsSync(path.join(hooks, 'post-edit-format.js')), 'JS/TS formatter hook must NOT land in fastapi-only install');
    assert.ok(!fs.existsSync(path.join(hooks, 'post-edit-typecheck.js')), 'JS/TS typecheck hook must NOT land in fastapi-only install');
    assert.ok(fs.existsSync(path.join(hooks, 'session-start.js')), 'common hook must always land');
    const lib = path.join(tmpDir, '.claude', 'scripts', 'lib');
    assert.ok(fs.existsSync(path.join(lib, 'resolve-formatter.js')), 'lib/* always copied');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context frontend copies only JS/TS hook scripts, not Python ones', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'frontend', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const hooks = path.join(tmpDir, '.claude', 'scripts', 'hooks');
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-format.js')), 'JS/TS formatter hook must land');
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-typecheck.js')), 'JS/TS typecheck hook must land');
    assert.ok(!fs.existsSync(path.join(hooks, 'post-edit-format-python.js')), 'Python formatter hook must NOT land in frontend-only install');
    assert.ok(!fs.existsSync(path.join(hooks, 'post-edit-typecheck-python.js')), 'Python typecheck hook must NOT land in frontend-only install');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--context fastapi,nestjs copies both language-specific hook sets', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'fastapi,nestjs', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const hooks = path.join(tmpDir, '.claude', 'scripts', 'hooks');
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-format.js')));
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-format-python.js')));
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-typecheck.js')));
    assert.ok(fs.existsSync(path.join(hooks, 'post-edit-typecheck-python.js')));
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

test('--context common copies common-README.md, INTERNALS.md, and PLAN-WORKFLOW.md to .claude/docs/', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const docsDir = path.join(tmpDir, '.claude', 'docs');
    assert.ok(fs.existsSync(path.join(docsDir, 'common-README.md')), 'common README must land in docs/');
    assert.ok(fs.existsSync(path.join(docsDir, 'INTERNALS.md')), 'INTERNALS.md must land in docs/');
    assert.ok(fs.existsSync(path.join(docsDir, 'PLAN-WORKFLOW.md')), 'PLAN-WORKFLOW.md must land in docs/');
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

test('install creates .gitignore with session-data entry when missing', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const gitignorePath = path.join(tmpDir, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must be created');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.match(content, /\.claude\/\.storage\/session-data\//);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('install appends to an existing .gitignore without clobbering', () => {
  const tmpDir = mkTmp();
  try {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules/\n*.log\n');
    const result = runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.match(content, /^node_modules\//m, 'pre-existing entry must be preserved');
    assert.match(content, /^\*\.log$/m, 'pre-existing entry must be preserved');
    assert.match(content, /\.claude\/\.storage\/session-data\//, 'new entry must be appended');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('install is idempotent for .gitignore on repeat runs', () => {
  const tmpDir = mkTmp();
  try {
    runInstall(['--context', 'common', '--dir', tmpDir]);
    const gitignorePath = path.join(tmpDir, '.gitignore');
    const first = fs.readFileSync(gitignorePath, 'utf8');
    runInstall(['--context', 'common', '--dir', tmpDir, '--force']);
    const second = fs.readFileSync(gitignorePath, 'utf8');
    assert.equal(first, second, 'second install must not duplicate the entry');
    const matches = second.match(/\.claude\/\.storage\/session-data\//g) || [];
    assert.equal(matches.length, 1, 'entry must appear exactly once');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('install skips .gitignore write when a covering pattern already exists', () => {
  const tmpDir = mkTmp();
  try {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, '.claude/**\n');
    const result = runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.equal(content, '.claude/**\n', 'existing covering pattern means no changes');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--dry-run does not create or modify .gitignore', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'common', '--dir', tmpDir, '--dry-run']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.gitignore')), 'dry-run must not write .gitignore');
    assert.match(result.stdout, /\[gitignore\].+\.claude\/\.storage\/session-data/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--target cursor does not create a .gitignore', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'frontend', '--target', 'cursor', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.gitignore')), 'cursor target must not touch .gitignore');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('merged settings.json carries env and permissions from common', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'common', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    );
    assert.equal(settings.env.CLAUDE_CODE_EFFORT_LEVEL, 'max');
    assert.equal(settings.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING, '1');
    assert.equal(settings.env.CLAUDE_CODE_DISABLE_1M_CONTEXT, '1');
    assert.equal(settings.permissions.defaultMode, 'plan');
    assert.ok(Array.isArray(settings.permissions.deny));
    assert.ok(settings.permissions.deny.includes('Bash(git push*)'));
    assert.ok(settings.permissions.deny.includes('Read(.env*)'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('merged settings.json preserves env and permissions across multi-context install', () => {
  const tmpDir = mkTmp();
  try {
    const result = runInstall(['--context', 'fastapi,devops', '--dir', tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    );
    assert.equal(settings.env.CLAUDE_CODE_EFFORT_LEVEL, 'max');
    assert.equal(settings.permissions.defaultMode, 'plan');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
