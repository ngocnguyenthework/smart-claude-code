#!/usr/bin/env node
/**
 * PreToolUse Hook: Doc File Warning (Write)
 *
 * Warns when creating known ad-hoc documentation filenames (NOTES, TODO,
 * SCRATCH, etc.) outside structured directories. Never blocks (exit 0 always).
 */

'use strict';

const path = require('path');

// Known ad-hoc filenames — uppercase only to avoid false positives
const ADHOC = /^(NOTES|TODO|SCRATCH|TEMP|DRAFT|BRAINSTORM|SPIKE|DEBUG|WIP)\.(md|txt)$/;

// Structured dirs where even ad-hoc names are intentional
const STRUCTURED = /(^|\/)(docs|\.claude|\.github|commands|skills|benchmarks|templates|memory|\.history)\//;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c.substring(0, 1024 * 1024 - raw.length); });
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const filePath = String(input?.tool_input?.file_path || '');

    if (filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      const basename = path.basename(normalized);
      if (ADHOC.test(basename) && !STRUCTURED.test(normalized)) {
        process.stderr.write(
          `[DocFileWarning] WARNING: Ad-hoc documentation filename detected\n` +
          `[DocFileWarning] File: ${filePath}\n` +
          `[DocFileWarning] Consider using a structured path: docs/, .claude/, skills/, commands/, templates/\n`
        );
      }
    }
  } catch (err) {
    process.stderr.write('[DocFileWarning] Error: ' + err.message + '\n');
  }

  // Always pass through (warnings only)
  process.stdout.write(raw);
  process.exit(0);
});
