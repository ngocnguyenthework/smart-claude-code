#!/usr/bin/env node
/**
 * Cost Tracker Hook (Stop - async)
 *
 * Reads token usage from stdin JSON and appends a JSONL row to
 * ~/.claude/metrics/costs.jsonl with estimated cost.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const METRICS_DIR = path.join(os.homedir(), '.claude', 'metrics');

// Approximate per-1M-token rates (conservative defaults)
const RATES = {
  haiku:  { in: 0.8,  out: 4.0  },
  sonnet: { in: 3.0,  out: 15.0 },
  opus:   { in: 15.0, out: 75.0 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const m = String(model || '').toLowerCase();
  let rates = RATES.sonnet;
  if (m.includes('haiku')) rates = RATES.haiku;
  if (m.includes('opus'))  rates = RATES.opus;
  const cost = (inputTokens / 1_000_000) * rates.in + (outputTokens / 1_000_000) * rates.out;
  return Math.round(cost * 1e6) / 1e6;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c.substring(0, 1024 * 1024 - raw.length); });
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const usage = input.usage || input.token_usage || {};
    const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0) || 0;
    const outputTokens = Number(usage.output_tokens || usage.completion_tokens || 0) || 0;
    const model = String(input.model || process.env.CLAUDE_MODEL || 'unknown');
    const sessionId = String(process.env.CLAUDE_SESSION_ID || 'default');

    if (!fs.existsSync(METRICS_DIR)) {
      fs.mkdirSync(METRICS_DIR, { recursive: true });
    }

    const row = {
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimateCost(model, inputTokens, outputTokens),
    };

    fs.appendFileSync(path.join(METRICS_DIR, 'costs.jsonl'), JSON.stringify(row) + '\n');
  } catch {
    // Non-blocking — never fail
  }

  // Pass stdin through unchanged
  process.stdout.write(raw);
});
