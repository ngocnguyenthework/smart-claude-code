#!/usr/bin/env node
/**
 * PreToolUse Hook: Config Protection (Write/Edit/MultiEdit)
 *
 * Blocks modifications to linter/formatter config files. Agents frequently
 * modify these to make checks pass instead of fixing the actual code.
 *
 * Exit codes: 0 = allow, 2 = block
 */

'use strict';

const path = require('path');

const PROTECTED = new Set([
  // ESLint
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  // Prettier
  '.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
  // Biome
  'biome.json', 'biome.jsonc',
  // Ruff (Python)
  '.ruff.toml', 'ruff.toml',
  // Style / Markdown / Shell
  '.shellcheckrc',
  '.stylelintrc', '.stylelintrc.json', '.stylelintrc.yml',
  '.markdownlint.json', '.markdownlint.yaml', '.markdownlintrc',
  // TypeScript / Build (protecting these prevents agents from weakening type checks)
  'tsconfig.json', 'tsconfig.base.json', 'tsconfig.build.json',
]);

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c.substring(0, 1024 * 1024 - raw.length); });
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const filePath = input?.tool_input?.file_path || input?.tool_input?.file || '';

    if (filePath) {
      const basename = path.basename(filePath);
      if (PROTECTED.has(basename)) {
        process.stderr.write(
          `[ConfigProtection] BLOCKED: Modifying ${basename} is not allowed.\n` +
          `[ConfigProtection] Fix the source code to satisfy linter/formatter rules instead of weakening the config.\n`
        );
        process.stdout.write(raw);
        process.exit(2);
      }
    }
  } catch (err) {
    process.stderr.write('[ConfigProtection] Error: ' + err.message + '\n');
  }

  process.stdout.write(raw);
  process.exit(0);
});
