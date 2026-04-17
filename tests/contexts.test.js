'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONTEXTS_ROOT = path.join(REPO_ROOT, 'contexts');
const CONTEXT_NAMES = ['common', 'fastapi', 'nestjs', 'devops', 'frontend'];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('every context directory exists with expected subdirs', () => {
  for (const ctx of CONTEXT_NAMES) {
    const dir = path.join(CONTEXTS_ROOT, ctx);
    assert.ok(fs.existsSync(dir), `contexts/${ctx} should exist`);
    for (const sub of ['agents', 'commands', 'rules', 'skills', 'contexts']) {
      assert.ok(
        fs.existsSync(path.join(dir, sub)),
        `contexts/${ctx}/${sub} should exist`,
      );
    }
  }
});

test('every context has a valid settings.json', () => {
  for (const ctx of CONTEXT_NAMES) {
    const file = path.join(CONTEXTS_ROOT, ctx, 'settings.json');
    assert.ok(fs.existsSync(file), `contexts/${ctx}/settings.json missing`);
    const parsed = loadJson(file);
    assert.equal(typeof parsed, 'object');
    assert.ok(parsed.hooks, `contexts/${ctx}/settings.json needs hooks key`);
  }
});

test('every context has a valid mcp-servers.json', () => {
  for (const ctx of CONTEXT_NAMES) {
    const file = path.join(CONTEXTS_ROOT, ctx, 'mcp-servers.json');
    assert.ok(fs.existsSync(file), `contexts/${ctx}/mcp-servers.json missing`);
    const parsed = loadJson(file);
    assert.ok(parsed.mcpServers, `contexts/${ctx}/mcp-servers.json needs mcpServers key`);
    assert.equal(typeof parsed.mcpServers, 'object');
  }
});

test('common context ships baseline generalist agents', () => {
  const agentsDir = path.join(CONTEXTS_ROOT, 'common', 'agents');
  const expected = ['architect.md', 'planner.md', 'code-reviewer.md', 'refactor-cleaner.md'];
  for (const name of expected) {
    assert.ok(
      fs.existsSync(path.join(agentsDir, name)),
      `contexts/common/agents/${name} missing`,
    );
  }
});

test('common context ships plan-workflow + utility commands', () => {
  const commandsDir = path.join(CONTEXTS_ROOT, 'common', 'commands');
  const expected = [
    'plan.md',
    'plans.md',
    'plan-discuss.md',
    'plan-run.md',
    'do.md',
    'explain.md',
    'grill.md',
  ];
  for (const name of expected) {
    assert.ok(
      fs.existsSync(path.join(commandsDir, name)),
      `contexts/common/commands/${name} missing`,
    );
  }
});

test('devops context ships GitOps/IaC stack coverage', () => {
  const rulesDir = path.join(CONTEXTS_ROOT, 'devops', 'rules');
  const expected = ['argocd', 'terragrunt', 'helm', 'kustomize', 'terraform', 'kubernetes', 'aws'];
  for (const stack of expected) {
    assert.ok(
      fs.existsSync(path.join(rulesDir, stack)),
      `contexts/devops/rules/${stack} missing`,
    );
  }
  const agentsDir = path.join(CONTEXTS_ROOT, 'devops', 'agents');
  const expectedAgents = [
    'argocd-reviewer.md',
    'terragrunt-reviewer.md',
    'helm-reviewer.md',
    'kustomize-reviewer.md',
  ];
  for (const a of expectedAgents) {
    assert.ok(fs.existsSync(path.join(agentsDir, a)), `contexts/devops/agents/${a} missing`);
  }
});

test('fastapi context ships FastAPI rules, reviewer, and shared DB tooling', () => {
  const fastapi = path.join(CONTEXTS_ROOT, 'fastapi');
  assert.ok(fs.existsSync(path.join(fastapi, 'rules', 'fastapi')));
  assert.ok(fs.existsSync(path.join(fastapi, 'agents', 'fastapi-reviewer.md')));
  assert.ok(fs.existsSync(path.join(fastapi, 'agents', 'database-reviewer.md')));
  assert.ok(fs.existsSync(path.join(fastapi, 'commands', 'fastapi-scaffold.md')));
  assert.ok(fs.existsSync(path.join(fastapi, 'commands', 'db-migrate.md')));
  assert.ok(!fs.existsSync(path.join(fastapi, 'agents', 'nestjs-reviewer.md')));
  assert.ok(!fs.existsSync(path.join(fastapi, 'rules', 'nestjs')));
});

test('nestjs context ships NestJS rules, reviewer, and shared DB tooling', () => {
  const nestjs = path.join(CONTEXTS_ROOT, 'nestjs');
  assert.ok(fs.existsSync(path.join(nestjs, 'rules', 'nestjs')));
  assert.ok(fs.existsSync(path.join(nestjs, 'agents', 'nestjs-reviewer.md')));
  assert.ok(fs.existsSync(path.join(nestjs, 'agents', 'database-reviewer.md')));
  assert.ok(fs.existsSync(path.join(nestjs, 'commands', 'nestjs-scaffold.md')));
  assert.ok(fs.existsSync(path.join(nestjs, 'commands', 'db-migrate.md')));
  assert.ok(!fs.existsSync(path.join(nestjs, 'agents', 'fastapi-reviewer.md')));
  assert.ok(!fs.existsSync(path.join(nestjs, 'rules', 'fastapi')));
});

test('frontend context ships React/Next rules and reviewer', () => {
  const frontend = path.join(CONTEXTS_ROOT, 'frontend');
  assert.ok(fs.existsSync(path.join(frontend, 'rules', 'frontend')));
  assert.ok(fs.existsSync(path.join(frontend, 'agents', 'frontend-reviewer.md')));
  assert.ok(fs.existsSync(path.join(frontend, 'agents', 'e2e-runner.md')));
});
