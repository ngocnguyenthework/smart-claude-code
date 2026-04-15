'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONTEXTS_ROOT = path.join(REPO_ROOT, 'contexts');
const CONTEXT_NAMES = ['common', 'backend', 'devops', 'frontend'];

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

test('backend context ships NestJS + FastAPI rules and reviewers', () => {
  const backend = path.join(CONTEXTS_ROOT, 'backend');
  assert.ok(fs.existsSync(path.join(backend, 'rules', 'nestjs')));
  assert.ok(fs.existsSync(path.join(backend, 'rules', 'fastapi')));
  assert.ok(fs.existsSync(path.join(backend, 'agents', 'nestjs-reviewer.md')));
  assert.ok(fs.existsSync(path.join(backend, 'agents', 'fastapi-reviewer.md')));
});

test('frontend context ships React/Next rules and reviewer', () => {
  const frontend = path.join(CONTEXTS_ROOT, 'frontend');
  assert.ok(fs.existsSync(path.join(frontend, 'rules', 'frontend')));
  assert.ok(fs.existsSync(path.join(frontend, 'agents', 'frontend-reviewer.md')));
  assert.ok(fs.existsSync(path.join(frontend, 'agents', 'e2e-runner.md')));
});
