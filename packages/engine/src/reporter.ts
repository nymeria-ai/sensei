/**
 * Reporter — generate JSON and terminal-formatted reports from SuiteResult.
 */

import type { SuiteResult } from './types.js';
import { LAYER_WEIGHTS } from './types.js';

// ─── JSON Reporter ───────────────────────────────────────────────────

export function toJSON(result: SuiteResult): string {
  return JSON.stringify(result, null, 2);
}

// ─── Terminal Reporter ───────────────────────────────────────────────

const BADGE_COLORS: Record<string, string> = {
  gold: '\x1b[33m',    // yellow
  silver: '\x1b[37m',  // white
  bronze: '\x1b[38;5;208m', // orange
  none: '\x1b[90m',    // gray
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

function colorScore(score: number): string {
  if (score >= 90) return `${GREEN}${score.toFixed(1)}${RESET}`;
  if (score >= 60) return `\x1b[33m${score.toFixed(1)}${RESET}`;
  return `${RED}${score.toFixed(1)}${RESET}`;
}

function pad(str: string, len: number): string {
  // Strip ANSI for length calc
  const raw = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - raw.length));
}

export function toTerminal(result: SuiteResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${BOLD}${CYAN}  Sensei Evaluation Report${RESET}`);
  lines.push(`${DIM}  ${'─'.repeat(50)}${RESET}`);
  lines.push(`  Suite:   ${BOLD}${result.suite_id}${RESET} v${result.suite_version}`);
  lines.push(`  Agent:   ${result.agent_id}`);
  lines.push(`  Time:    ${result.timestamp}`);
  lines.push(`  Duration: ${(result.duration_ms / 1000).toFixed(1)}s`);
  if (result.judge_model) {
    lines.push(`  Judge:   ${result.judge_model}`);
  }
  lines.push('');

  // Scenario table
  lines.push(`  ${BOLD}${pad('Scenario', 35)} ${pad('Layer', 20)} Score${RESET}`);
  lines.push(`  ${DIM}${'─'.repeat(65)}${RESET}`);

  for (const s of result.scenarios) {
    const status = s.error ? `${RED}ERR${RESET}` : colorScore(s.score);
    lines.push(`  ${pad(s.scenario_name, 35)} ${pad(s.layer, 20)} ${status}`);
  }

  lines.push('');

  // Layer scores
  lines.push(`  ${BOLD}Layer Scores${RESET}`);
  lines.push(`  ${DIM}${'─'.repeat(40)}${RESET}`);
  const pctExec = Math.round(LAYER_WEIGHTS['execution'] * 100);
  const pctReason = Math.round(LAYER_WEIGHTS['reasoning'] * 100);
  const pctImprove = Math.round(LAYER_WEIGHTS['self-improvement'] * 100);
  lines.push(`  Execution (${pctExec}%):        ${colorScore(result.scores.execution)}`);
  lines.push(`  Reasoning (${pctReason}%):        ${colorScore(result.scores.reasoning)}`);
  lines.push(`  Self-Improvement (${pctImprove}%): ${colorScore(result.scores.self_improvement)}`);
  lines.push('');

  // Overall
  lines.push(`  ${BOLD}Overall Score: ${colorScore(result.scores.overall)}${RESET}`);

  // Badge
  const badgeColor = BADGE_COLORS[result.badge] ?? BADGE_COLORS.none;
  const badgeLabel = result.badge === 'none'
    ? 'No badge'
    : `${result.badge.charAt(0).toUpperCase()}${result.badge.slice(1)} Badge`;
  lines.push(`  ${BOLD}Badge: ${badgeColor}${badgeLabel}${RESET}`);
  lines.push('');

  return lines.join('\n');
}

// ─── Reporter Class ──────────────────────────────────────────────────

export class Reporter {
  toJSON(result: SuiteResult): string {
    return toJSON(result);
  }

  toTerminal(result: SuiteResult): string {
    return toTerminal(result);
  }
}
