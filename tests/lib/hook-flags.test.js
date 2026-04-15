'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const hookFlagsPath = require.resolve('../../scripts/lib/hook-flags.js');

function freshRequire() {
  delete require.cache[hookFlagsPath];
  return require(hookFlagsPath);
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const value = overrides[key];
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn(freshRequire());
  } finally {
    for (const [key, prev] of Object.entries(saved)) {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }
}

test('default profile is "standard"', () => {
  withEnv({ SC_HOOK_PROFILE: null }, mod => {
    assert.equal(mod.getHookProfile(), 'standard');
  });
});

test('invalid profile falls back to standard', () => {
  withEnv({ SC_HOOK_PROFILE: 'wobbly' }, mod => {
    assert.equal(mod.getHookProfile(), 'standard');
  });
});

test('SC_DISABLED_HOOKS disables the listed hook id', () => {
  withEnv({ SC_DISABLED_HOOKS: 'commit-quality,cost-tracker' }, mod => {
    assert.equal(mod.isHookEnabled('commit-quality'), false);
    assert.equal(mod.isHookEnabled('Commit-Quality'), false);
    assert.equal(mod.isHookEnabled('session-start'), true);
  });
});

test('minimal profile excludes hooks scoped to standard/strict', () => {
  withEnv({ SC_HOOK_PROFILE: 'minimal' }, mod => {
    assert.equal(mod.isHookEnabled('cost-tracker', { profiles: ['standard', 'strict'] }), false);
  });
});

test('strict profile includes hooks scoped to strict', () => {
  withEnv({ SC_HOOK_PROFILE: 'strict' }, mod => {
    assert.equal(mod.isHookEnabled('tough-guard', { profiles: 'strict' }), true);
  });
});

test('empty SC_DISABLED_HOOKS is a no-op', () => {
  withEnv({ SC_DISABLED_HOOKS: '' }, mod => {
    assert.equal(mod.getDisabledHookIds().size, 0);
  });
});
