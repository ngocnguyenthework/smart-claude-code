#!/usr/bin/env node
/**
 * PreToolUse Hook: Install Guard (Bash)
 *
 * Detects package / dependency install commands and reminds to run the
 * dependency-approval workflow BEFORE executing. Warns (exit 0) rather than
 * blocks (exit 2) because users may have legitimate lockfile refreshes or
 * approved bumps — but the nudge surfaces every time so silent installs
 * become impossible.
 *
 * Triggers on:
 *   - npm / pnpm / yarn / bun  add|install (with a package name)
 *   - pip / poetry / uv / pipx / conda  install / add (with a package name)
 *   - go get | go install <pkg>
 *   - cargo add | cargo install <pkg>
 *   - gem install | bundle add <pkg>
 *   - brew install | apt install | apk add <pkg>
 *   - helm repo add | helm install <chart>
 *
 * Suppressed (no nudge) for:
 *   - Lockfile-only refreshes: `npm install` / `npm ci` / `poetry lock`
 *     (no package name argument)
 *   - `npm test` / `npm run <script>` etc.
 *
 * Exit codes: 0 = allow (always; this hook only warns)
 */

'use strict';

// Matchers return true when the command is a package-install with a named
// package (i.e. worth nudging). Lockfile-refreshes / script runs return false.
const MATCHERS = [
  {
    name: 'npm/pnpm/yarn/bun',
    re: /\b(?:npm|pnpm|yarn|bun)\s+(?:i|add|install)\s+(?!--?\s*$)(?!-D\s*$)(?!-g\s*$)[^\s-][^\s]*/,
    skip: /\b(?:npm|pnpm|yarn|bun)\s+(?:ci|install|i)\s*(?:--[\w-]+)*\s*$/,
  },
  {
    name: 'pip/poetry/uv/pipx/conda',
    re: /\b(?:pip|pip3|poetry|uv|pipx|conda)\s+(?:install|add)\s+(?!-r\s)(?!--?\s*$)[^\s-][^\s]*/,
    skip: /\bpoetry\s+lock\b|\buv\s+lock\b/,
  },
  {
    name: 'go get/install',
    re: /\bgo\s+(?:get|install)\s+[^\s-][^\s]*/,
  },
  {
    name: 'cargo add/install',
    re: /\bcargo\s+(?:add|install)\s+[^\s-][^\s]*/,
  },
  {
    name: 'gem/bundle',
    re: /\b(?:gem\s+install|bundle\s+add)\s+[^\s-][^\s]*/,
  },
  {
    name: 'system pkg (brew/apt/apk)',
    re: /\b(?:brew|apt(?:-get)?|apk)\s+(?:install|add)\s+[^\s-][^\s]*/,
  },
  {
    name: 'helm',
    re: /\bhelm\s+(?:repo\s+add|install)\s+[^\s]+/,
  },
];

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c.substring(0, 1024 * 1024 - raw.length); });
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const command = input?.tool_input?.command || '';

    if (!command) {
      process.stdout.write(raw);
      process.exit(0);
    }

    for (const m of MATCHERS) {
      if (m.skip && m.skip.test(command)) continue;
      if (m.re.test(command)) {
        process.stderr.write(
          `\n[InstallGuard] Detected ${m.name} install: ${command.slice(0, 120)}\n` +
          `[InstallGuard] Did you run the dependency-approval workflow?\n` +
          `[InstallGuard]   1. Stdlib / existing-dep check\n` +
          `[InstallGuard]   2. Compare 2-3 alternatives (size, maint, CVEs, license)\n` +
          `[InstallGuard]   3. AskUserQuestion gate with the comparison\n` +
          `[InstallGuard]   4. Pin exact version on approval\n` +
          `[InstallGuard] See rules/common/dependency-approval.md and skills/dependency-selection/.\n` +
          `[InstallGuard] (This is a warning, not a block — proceed only if the user has approved.)\n\n`
        );
        break;
      }
    }
  } catch (err) {
    process.stderr.write('[InstallGuard] Error: ' + err.message + '\n');
  }

  process.stdout.write(raw);
  process.exit(0);
});
