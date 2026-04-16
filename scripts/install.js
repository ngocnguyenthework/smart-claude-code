#!/usr/bin/env node
/**
 * smart-claude install script.
 *
 * Copies a context-specific bundle (common + <context>) from this repo into
 * a target project's .claude/ directory. Everything (agents, commands, rules,
 * skills, contexts, settings.json, hook scripts) lands under .claude/. The
 * merged MCP server config is written to <root>/.mcp.json so Claude Code
 * picks it up at project scope (https://code.claude.com/docs/en/mcp#project-scope).
 *
 * Usage:
 *   node scripts/install.js --context <name>[,<name>...] [flags]
 *
 * Contexts:
 *   common     — baseline (always included): session memory, safety hooks,
 *                generalist agents, planner/reviewer commands
 *   fastapi    — FastAPI + PostgreSQL
 *   nestjs     — NestJS + PostgreSQL
 *   devops     — Terraform + Terragrunt + K8s + ArgoCD + Helm + Kustomize + AWS
 *   frontend   — React + Next.js + Tailwind + shadcn/ui + E2E
 *   all        — every context
 *
 * Flags:
 *   --context <names>   Required. Comma-separated contexts (common is always
 *                       added). Examples: "frontend", "nestjs,devops", "all"
 *   --dir <path>        Optional. Target project root. Default: current directory.
 *   --target <harness>  Optional. claude (default) | cursor | codex.
 *   --dry-run           Print planned file operations without copying.
 *   --force             Overwrite existing files.
 *   --skip-scripts      Don't copy .claude/scripts/hooks/ and .claude/scripts/lib/.
 *   --help              Show this help.
 *
 * Examples:
 *   # In your frontend repo:
 *   cd my-next-app
 *   /path/to/smart-claude/install.sh --context frontend
 *
 *   # Full-stack monorepo needing NestJS + frontend:
 *   /path/to/smart-claude/install.sh --context nestjs,frontend
 *
 *   # DevOps repo only:
 *   /path/to/smart-claude/install.sh --context devops
 *
 *   # Install into a specific location:
 *   /path/to/smart-claude/install.sh --context fastapi --dir ~/code/api
 *
 *   # Preview without writing:
 *   /path/to/smart-claude/install.sh --context all --dry-run
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONTEXTS_ROOT = path.join(REPO_ROOT, 'contexts');
const VALID_CONTEXTS = ['common', 'fastapi', 'nestjs', 'devops', 'frontend'];

function parseArgs(argv) {
  const args = {
    contexts: null,
    dir: process.cwd(),
    target: 'claude',
    dryRun: false,
    force: false,
    skipScripts: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--context':
      case '-c':
        args.contexts = argv[++i];
        break;
      case '--dir':
      case '-d':
        args.dir = path.resolve(argv[++i]);
        break;
      case '--target':
      case '-t':
        args.target = argv[++i];
        break;
      case '--dry-run':
      case '-n':
        args.dryRun = true;
        break;
      case '--force':
      case '-f':
        args.force = true;
        break;
      case '--skip-scripts':
        args.skipScripts = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        console.error(`[install] Unknown argument: ${arg}`);
        process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  const help = fs.readFileSync(__filename, 'utf8')
    .split('\n')
    .filter(l => l.startsWith(' *') || l.startsWith('/**') || l.startsWith(' */'))
    .map(l => l.replace(/^ \*\/?\s?/, '').replace(/^\/\*\*\s?/, ''))
    .join('\n')
    .trim();
  process.stdout.write(help + '\n');
}

function resolveContexts(rawContexts) {
  if (!rawContexts) return null;
  const requested = rawContexts.split(',').map(s => s.trim()).filter(Boolean);
  if (requested.includes('all')) return [...VALID_CONTEXTS];
  const invalid = requested.filter(c => !VALID_CONTEXTS.includes(c));
  if (invalid.length > 0) {
    console.error(`[install] Unknown context(s): ${invalid.join(', ')}`);
    console.error(`[install] Valid: ${VALID_CONTEXTS.join(', ')}, all`);
    process.exit(2);
  }
  const unique = new Set(['common', ...requested]);
  return VALID_CONTEXTS.filter(c => unique.has(c));
}

const SKIP_FILES = new Set(['.gitkeep', '.DS_Store']);

function walkDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_FILES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function mergeHooks(baseHooks, addHooks) {
  const merged = { ...baseHooks };
  for (const event of Object.keys(addHooks || {})) {
    const existing = merged[event] || [];
    const seen = new Set(existing.map(e => JSON.stringify(e)));
    const additions = [];
    for (const entry of addHooks[event] || []) {
      const key = JSON.stringify(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      additions.push(entry);
    }
    merged[event] = [...existing, ...additions];
  }
  return merged;
}

function mergeSettings(contexts) {
  let hooks = {};
  for (const ctx of contexts) {
    const file = path.join(CONTEXTS_ROOT, ctx, 'settings.json');
    const content = loadJson(file);
    if (content && content.hooks) hooks = mergeHooks(hooks, content.hooks);
  }
  return {
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    description: `smart-claude merged settings (contexts: ${contexts.join(', ')})`,
    hooks,
  };
}

function mergeMcpServers(contexts) {
  const merged = { mcpServers: {} };
  for (const ctx of contexts) {
    const file = path.join(CONTEXTS_ROOT, ctx, 'mcp-servers.json');
    const content = loadJson(file);
    if (content && content.mcpServers) Object.assign(merged.mcpServers, content.mcpServers);
  }
  merged._contexts = contexts;
  return merged;
}

function copyFile(src, dst, { dryRun, force }) {
  if (dryRun) return 'would-copy';
  if (fs.existsSync(dst) && !force) return 'skipped-exists';
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return 'copied';
}

function writeJson(dst, obj, { dryRun, force }) {
  if (dryRun) return 'would-write';
  if (fs.existsSync(dst) && !force) return 'skipped-exists';
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(obj, null, 2) + '\n');
  return 'written';
}

function cursorRelPath(kind, relFromKind) {
  if (kind !== 'rules') return null;
  const parts = relFromKind.split(path.sep);
  const filename = parts.pop();
  if (filename.toLowerCase() === 'readme.md') return null;
  const base = filename.endsWith('.md') ? filename.slice(0, -3) : filename;
  const prefix = parts.join('-');
  return prefix
    ? path.posix.join('rules', `${prefix}-${base}.mdc`)
    : path.posix.join('rules', `${base}.mdc`);
}

function codexRelPath(kind, relFromKind) {
  if (['rules', 'agents', 'contexts'].includes(kind)) {
    return path.posix.join('references', kind, relFromKind);
  }
  return null;
}

function remapForTarget(kind, relFromKind, target) {
  if (target === 'cursor') return cursorRelPath(kind, relFromKind);
  if (target === 'codex') return codexRelPath(kind, relFromKind);
  return path.posix.join(kind, relFromKind);
}

function dirStem(target) {
  if (target === 'cursor') return '.cursor';
  if (target === 'codex') return '.codex';
  return '.claude';
}

function planCopies(contexts, target) {
  const KINDS = ['agents', 'commands', 'rules', 'skills', 'contexts'];
  const copies = [];
  for (const ctx of contexts) {
    for (const kind of KINDS) {
      const srcDir = path.join(CONTEXTS_ROOT, ctx, kind);
      if (!fs.existsSync(srcDir)) continue;
      for (const abs of walkDir(srcDir)) {
        const relFromKind = path.relative(srcDir, abs);
        const mapped = remapForTarget(kind, relFromKind, target);
        if (mapped === null) continue;
        copies.push({ ctx, kind, src: abs, relTarget: mapped });
      }
    }
  }
  return copies;
}

function planScripts() {
  const scripts = [];
  for (const sub of ['hooks', 'lib']) {
    const srcDir = path.join(REPO_ROOT, 'scripts', sub);
    for (const abs of walkDir(srcDir)) {
      const rel = path.relative(REPO_ROOT, abs);
      scripts.push({ src: abs, relTarget: rel });
    }
  }
  return scripts;
}

function planDocs(contexts, target) {
  if (target === 'cursor') return [];
  const docs = [];
  for (const ctx of contexts) {
    const readmeSrc = path.join(CONTEXTS_ROOT, ctx, 'README.md');
    if (fs.existsSync(readmeSrc)) {
      docs.push({ src: readmeSrc, relTarget: path.posix.join('docs', `${ctx}-README.md`) });
    }
  }
  const internalsSrc = path.join(CONTEXTS_ROOT, 'common', 'INTERNALS.md');
  if (fs.existsSync(internalsSrc)) {
    docs.push({ src: internalsSrc, relTarget: path.posix.join('docs', 'INTERNALS.md') });
  }
  return docs;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.contexts) { printHelp(); process.exit(1); }

  const contexts = resolveContexts(args.contexts);
  const stem = dirStem(args.target);
  const claudeDir = path.join(args.dir, stem);

  const scriptsDst = path.join(claudeDir, 'scripts');
  const mcpDst = args.target === 'claude' ? path.join(args.dir, '.mcp.json') : null;

  console.log(`[install] Contexts:  ${contexts.join(' + ')}`);
  console.log(`[install] Target:    ${args.target} → ${args.dir}`);
  console.log(`[install] Config:    ${claudeDir}`);
  console.log(`[install] Scripts:   ${args.skipScripts ? 'skipped' : scriptsDst}`);
  if (mcpDst) console.log(`[install] MCP:       ${mcpDst}`);
  console.log(`[install] Mode:      ${args.dryRun ? 'dry-run' : 'apply'}`);
  console.log('');

  const counts = { copied: 0, 'would-copy': 0, 'would-write': 0, written: 0, 'skipped-exists': 0 };

  for (const item of planCopies(contexts, args.target)) {
    const dst = path.join(claudeDir, item.relTarget);
    const res = copyFile(item.src, dst, args);
    counts[res] = (counts[res] || 0) + 1;
    if (args.dryRun) console.log(`  [${item.ctx}/${item.kind}] → ${dst}`);
  }

  // Only write settings.json / .mcp.json for Claude target.
  if (args.target === 'claude') {
    const settings = mergeSettings(contexts);
    const settingsDst = path.join(claudeDir, 'settings.json');
    const sRes = writeJson(settingsDst, settings, args);
    counts[sRes] = (counts[sRes] || 0) + 1;
    if (args.dryRun) console.log(`  [merged] settings.json → ${settingsDst}`);

    const mcp = mergeMcpServers(contexts);
    const mRes = writeJson(mcpDst, mcp, args);
    counts[mRes] = (counts[mRes] || 0) + 1;
    if (args.dryRun) console.log(`  [merged] .mcp.json → ${mcpDst}`);
  }

  if (!args.skipScripts && args.target === 'claude') {
    for (const item of planScripts()) {
      const dst = path.join(claudeDir, item.relTarget);
      const res = copyFile(item.src, dst, args);
      counts[res] = (counts[res] || 0) + 1;
      if (args.dryRun) console.log(`  [scripts] → ${dst}`);
    }
  }

  for (const item of planDocs(contexts, args.target)) {
    const dst = path.join(claudeDir, item.relTarget);
    const res = copyFile(item.src, dst, args);
    counts[res] = (counts[res] || 0) + 1;
    if (args.dryRun) console.log(`  [docs] → ${dst}`);
  }

  console.log('');
  console.log(`[install] Done. ${JSON.stringify(counts)}`);
  if (counts['skipped-exists'] > 0) {
    console.log('[install] Some files were skipped because they already exist. Pass --force to overwrite.');
  }
  if (!args.dryRun && args.target === 'claude') {
    console.log('');
    console.log('[install] Next step:');
    console.log(`  cd ${args.dir}`);
    console.log('  claude');
    console.log('  # Claude Code auto-loads .claude/settings.json and .mcp.json at project root.');
    console.log('  # Hooks resolve via ${CLAUDE_PROJECT_DIR}/.claude/scripts/hooks/.');
  }
}

main();
