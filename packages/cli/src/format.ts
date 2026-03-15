/**
 * Report formatters — terminal and HTML output
 */
import type { SuiteResult, ScenarioResult, KPIResult, Badge } from '@sensei/engine';

// ─── Badge display ──────────────────────────────────────────────────

const BADGE_ICONS: Record<Badge, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
  none: '—',
};

function badgeLabel(badge: Badge): string {
  return `${BADGE_ICONS[badge]} ${badge.toUpperCase()}`;
}

function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${score.toFixed(1)}`;
}

// ─── Terminal Report ────────────────────────────────────────────────

export function formatTerminalReport(result: SuiteResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push(`  SENSEI QUALIFICATION REPORT`);
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Suite:     ${result.suite_id} v${result.suite_version}`);
  lines.push(`  Agent:     ${result.agent_id}`);
  lines.push(`  Timestamp: ${result.timestamp}`);
  lines.push(`  Duration:  ${(result.duration_ms / 1000).toFixed(1)}s`);
  if (result.judge_model) {
    lines.push(`  Judge:     ${result.judge_model}`);
  }
  lines.push('');

  // Overall scores
  lines.push('───────────────────────────────────────────────────────');
  lines.push('  SCORES');
  lines.push('───────────────────────────────────────────────────────');
  lines.push(`  Overall:          ${scoreBar(result.scores.overall)}`);
  lines.push(`  Execution:        ${scoreBar(result.scores.execution)}`);
  lines.push(`  Reasoning:        ${scoreBar(result.scores.reasoning)}`);
  lines.push(`  Self-Improvement: ${scoreBar(result.scores.self_improvement)}`);
  lines.push('');
  lines.push(`  Badge: ${badgeLabel(result.badge)}`);
  lines.push('');

  // Scenarios
  lines.push('───────────────────────────────────────────────────────');
  lines.push('  SCENARIOS');
  lines.push('───────────────────────────────────────────────────────');

  for (const scenario of result.scenarios) {
    lines.push('');
    lines.push(`  [${scenario.layer.toUpperCase()}] ${scenario.scenario_name}`);
    lines.push(`    Score: ${scenario.score.toFixed(1)} / 100  (${(scenario.duration_ms / 1000).toFixed(1)}s)`);
    if (scenario.error) {
      lines.push(`    ERROR: ${scenario.error}`);
    }
    for (const kpi of scenario.kpis) {
      lines.push(`    • ${kpi.kpi_name}: ${kpi.score.toFixed(1)} (${kpi.raw_score}/${kpi.max_score}, weight: ${kpi.weight})`);
      if (kpi.evidence) {
        lines.push(`      ${kpi.evidence}`);
      }
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

// ─── HTML Report ────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kpiRow(kpi: KPIResult): string {
  return `<tr>
    <td>${escapeHtml(kpi.kpi_name)}</td>
    <td>${kpi.score.toFixed(1)}</td>
    <td>${kpi.raw_score}/${kpi.max_score}</td>
    <td>${kpi.weight}</td>
    <td>${kpi.method}</td>
    <td>${escapeHtml(kpi.evidence)}</td>
  </tr>`;
}

function scenarioSection(scenario: ScenarioResult): string {
  return `
    <div class="scenario">
      <h3>[${escapeHtml(scenario.layer.toUpperCase())}] ${escapeHtml(scenario.scenario_name)}</h3>
      <p>Score: <strong>${scenario.score.toFixed(1)}</strong> / 100 &mdash; ${(scenario.duration_ms / 1000).toFixed(1)}s</p>
      ${scenario.error ? `<p class="error">Error: ${escapeHtml(scenario.error)}</p>` : ''}
      <table>
        <thead><tr><th>KPI</th><th>Score</th><th>Raw</th><th>Weight</th><th>Method</th><th>Evidence</th></tr></thead>
        <tbody>${scenario.kpis.map(kpiRow).join('\n')}</tbody>
      </table>
    </div>`;
}

export function formatHtmlReport(result: SuiteResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sensei Report — ${escapeHtml(result.suite_id)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #222; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    .meta { color: #666; margin-bottom: 1.5rem; }
    .scores { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .score-card { background: #f5f5f5; border-radius: 8px; padding: 1rem; text-align: center; }
    .score-card .value { font-size: 2rem; font-weight: bold; }
    .badge { font-size: 1.5rem; text-align: center; margin: 1rem 0; }
    .scenario { margin-bottom: 2rem; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
    .error { color: #c00; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; }
    th { background: #f9f9f9; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Sensei Qualification Report</h1>
  <div class="meta">
    <p>Suite: ${escapeHtml(result.suite_id)} v${escapeHtml(result.suite_version)} &mdash; Agent: ${escapeHtml(result.agent_id)}</p>
    <p>Timestamp: ${escapeHtml(result.timestamp)} &mdash; Duration: ${(result.duration_ms / 1000).toFixed(1)}s${result.judge_model ? ` &mdash; Judge: ${escapeHtml(result.judge_model)}` : ''}</p>
  </div>

  <div class="badge">${badgeLabel(result.badge)}</div>

  <div class="scores">
    <div class="score-card"><div class="value">${result.scores.overall.toFixed(1)}</div><div>Overall</div></div>
    <div class="score-card"><div class="value">${result.scores.execution.toFixed(1)}</div><div>Execution</div></div>
    <div class="score-card"><div class="value">${result.scores.reasoning.toFixed(1)}</div><div>Reasoning</div></div>
    <div class="score-card"><div class="value">${result.scores.self_improvement.toFixed(1)}</div><div>Self-Improvement</div></div>
  </div>

  <h2>Scenarios</h2>
  ${result.scenarios.map(scenarioSection).join('\n')}
</body>
</html>`;
}
