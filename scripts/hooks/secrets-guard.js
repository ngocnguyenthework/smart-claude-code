#!/usr/bin/env node
/**
 * PreToolUse Hook: Secrets Guard
 *
 * Defense-in-depth for secret files. Complements permissions.deny globs
 * (which only match CWD-relative paths) by blocking:
 *   - Read/Edit/Write/Glob/Grep against absolute paths pointing to secrets
 *   - Bash commands that read/exfiltrate secrets via any shell trick
 *     (cat, source, <, awk, sed, python -c, node -e, xxd, base64, scp, curl -T, tar, ...)
 *
 * Exit: 0 allow, 2 block.
 */

'use strict';

const path = require('path');

// Secret file patterns (regex, matched against basename AND full path).
const SECRET_PATTERNS = [
  /(^|\/)\.env($|\.)/i,                    // .env, .env.local, .env.prod, ...
  /(^|\/)\.envrc$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.ppk$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /\.kdbx$/i,
  /\.gpg$/i,
  /\.asc$/i,
  /(^|\/)id_rsa(\.|$)/i,
  /(^|\/)id_dsa(\.|$)/i,
  /(^|\/)id_ecdsa(\.|$)/i,
  /(^|\/)id_ed25519(\.|$)/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.gcp(\/|$)/i,
  /(^|\/)\.azure(\/|$)/i,
  /(^|\/)\.kube(\/|$)/i,
  /(^|\/)kubeconfig($|\.)/i,
  /(^|\/)credentials($|\.)/i,
  /(^|\/)secrets?($|\.|\/)/i,
  /service[-_]?account.*\.json$/i,
  /gcloud.*\.json$/i,
  /\.netrc$/i,
  /\.pgpass$/i,
  /\.my\.cnf$/i,
  /(^|\/)htpasswd$/i,
  /\.htpasswd$/i,
  /token[s]?\.(json|yaml|yml|txt)$/i,
  /master[-_]?key/i,
];

function matchesSecret(p) {
  if (!p) return false;
  const s = String(p);
  return SECRET_PATTERNS.some(rx => rx.test(s));
}

// Quick heuristic for Bash: scan each whitespace-split token against secret patterns.
// Catches: cat /path/.env ; source .env ; python -c "open('.env')" ; < .env ; tar czf x .aws ; etc.
function bashTouchesSecret(cmd) {
  if (!cmd) return null;
  // Tokenize loosely: split on shell separators and quotes.
  const tokens = cmd
    .replace(/["']/g, ' ')
    .split(/[\s;&|<>(){}`$=,]+/)
    .filter(Boolean);
  for (const tok of tokens) {
    // Strip leading flags/redirect artifacts.
    const clean = tok.replace(/^[-+]+/, '');
    if (matchesSecret(clean)) return clean;
  }
  // Also regex-scan the whole command for embedded patterns inside quoted strings.
  for (const rx of SECRET_PATTERNS) {
    const m = cmd.match(rx);
    if (m) return m[0];
  }
  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c.substring(0, 1024 * 1024 - raw.length); });
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const tool = input?.tool_name || '';
    const ti = input?.tool_input || {};

    let blocked = null;

    if (tool === 'Bash') {
      const hit = bashTouchesSecret(ti.command || '');
      if (hit) blocked = `Bash command touches secret file: ${hit}`;
    } else if (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
      const fp = ti.file_path || ti.file || ti.notebook_path || '';
      if (matchesSecret(fp)) blocked = `${tool} target is a secret file: ${fp}`;
    } else if (tool === 'Glob' || tool === 'Grep') {
      const pat = ti.pattern || '';
      const pth = ti.path || '';
      if (matchesSecret(pat) || matchesSecret(pth)) {
        blocked = `${tool} pattern/path targets secrets: ${pat || pth}`;
      }
    }

    if (blocked) {
      process.stderr.write(
        `[SecretsGuard] BLOCKED: ${blocked}\n` +
        `[SecretsGuard] Secrets must not be read by the agent. Use env vars injected by the OS, a secret manager, or ask the user to paste only the needed value.\n`
      );
      process.stdout.write(raw);
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write('[SecretsGuard] Error: ' + err.message + '\n');
  }
  process.stdout.write(raw);
  process.exit(0);
});
