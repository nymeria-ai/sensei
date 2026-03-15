/**
 * Runner — orchestrates scenario execution for a suite.
 *
 * Flow: load suite → init adapter → health check → run scenarios by layer order → aggregate → return SuiteResult
 */

import type {
  SuiteDefinition,
  ScenarioDefinition,
  ScenarioResult,
  KPIResult,
  SuiteResult,
  AgentAdapter,
  EvaluationLayer,
} from './types.js';
import { scoreAutomatedKPI, calculateScenarioScore, calculateLayerScores } from './scorer.js';
import { determineBadge } from './types.js';

export interface RunnerOptions {
  /** Maximum retries per scenario on failure */
  retries?: number;
  /** Override per-scenario timeout (ms) */
  timeout_ms?: number;
  /** Callback for progress updates */
  onScenarioComplete?: (result: ScenarioResult, index: number, total: number) => void;
  /** External KPI scorer for llm-judge KPIs */
  judgeScorer?: (
    kpi: import('./types.js').KPIDefinition,
    agentOutput: string,
    scenarioInput: string,
  ) => Promise<KPIResult>;
  /** External scorer for comparative-judge KPIs (self-improvement layer) */
  comparatorScorer?: (
    kpi: import('./types.js').KPIDefinition,
    task: string,
    feedback: string,
    originalOutput: string,
    revisedOutput: string,
  ) => Promise<KPIResult>;
}

const LAYER_ORDER: EvaluationLayer[] = ['execution', 'reasoning', 'self-improvement'];

export class Runner {
  private adapter: AgentAdapter;
  private options: RunnerOptions;

  constructor(adapter: AgentAdapter, options: RunnerOptions = {}) {
    this.adapter = adapter;
    this.options = options;
  }

  async run(suite: SuiteDefinition): Promise<SuiteResult> {
    const startTime = Date.now();

    // Connect and health check
    await this.adapter.connect();
    const healthy = await this.adapter.healthCheck();
    if (!healthy) {
      throw new Error(`Agent health check failed for adapter "${this.adapter.name}"`);
    }

    // Sort scenarios by layer order, preserving definition order within layers
    const sorted = this.sortByLayer(suite.scenarios);

    // Track outputs for depends_on references
    const outputMap = new Map<string, string>();
    const results: ScenarioResult[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const scenario = sorted[i];
      const result = await this.runScenarioWithRetry(scenario, outputMap, suite);
      outputMap.set(scenario.id, result.agent_output);
      results.push(result);
      this.options.onScenarioComplete?.(result, i, sorted.length);
    }

    // Disconnect adapter
    await this.adapter.disconnect();

    // Aggregate scores
    const scores = calculateLayerScores(results);
    const badge = determineBadge(scores.overall);

    return {
      suite_id: suite.id,
      suite_version: suite.version,
      agent_id: this.adapter.name,
      timestamp: new Date().toISOString(),
      scores,
      scenarios: results,
      badge,
      duration_ms: Date.now() - startTime,
      judge_model: suite.judge?.model,
    };
  }

  private sortByLayer(scenarios: ScenarioDefinition[]): ScenarioDefinition[] {
    return [...scenarios].sort((a, b) => {
      return LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer);
    });
  }

  private async runScenarioWithRetry(
    scenario: ScenarioDefinition,
    outputMap: Map<string, string>,
    suite: SuiteDefinition,
  ): Promise<ScenarioResult> {
    const maxRetries = this.options.retries ?? 0;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.runScenario(scenario, outputMap, suite);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) continue;
      }
    }

    // All retries exhausted — return error result
    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      layer: scenario.layer,
      score: 0,
      kpis: [],
      duration_ms: 0,
      agent_input: scenario.input.prompt,
      agent_output: '',
      error: lastError,
    };
  }

  private async runScenario(
    scenario: ScenarioDefinition,
    outputMap: Map<string, string>,
    suite: SuiteDefinition,
  ): Promise<ScenarioResult> {
    const startTime = Date.now();

    // Build prompt, injecting dependency output if needed
    let prompt = scenario.input.prompt;
    if (scenario.depends_on) {
      const depOutput = outputMap.get(scenario.depends_on);
      if (depOutput) {
        prompt = `Previous output:\n${depOutput}\n\n${prompt}`;
      }
    }
    if (scenario.input.feedback) {
      prompt = `${prompt}\n\nFeedback: ${scenario.input.feedback}`;
    }

    // Send to agent
    const timeout = this.options.timeout_ms ?? suite.agent.timeout_ms;
    const output = await this.adapter.send({
      prompt,
      context: scenario.input.context,
      timeout_ms: timeout,
    });

    if (output.error) {
      throw new Error(output.error);
    }

    // Score each KPI
    const kpis: KPIResult[] = [];
    for (const kpiDef of scenario.kpis) {
      if (kpiDef.method === 'automated') {
        kpis.push(scoreAutomatedKPI(kpiDef, output.response));
      } else if (
        kpiDef.method === 'comparative-judge' &&
        this.options.comparatorScorer &&
        scenario.depends_on
      ) {
        const originalOutput = outputMap.get(scenario.depends_on) ?? '';
        kpis.push(
          await this.options.comparatorScorer(
            kpiDef,
            scenario.input.prompt,
            scenario.input.feedback ?? '',
            originalOutput,
            output.response,
          ),
        );
      } else if (this.options.judgeScorer) {
        kpis.push(await this.options.judgeScorer(kpiDef, output.response, prompt));
      } else {
        // No judge available — score 0 with explanation
        kpis.push({
          kpi_id: kpiDef.id,
          kpi_name: kpiDef.name,
          score: 0,
          raw_score: 0,
          max_score: kpiDef.config.max_score ?? 10,
          weight: kpiDef.weight,
          method: kpiDef.method,
          evidence: `No judge configured for ${kpiDef.method} scoring`,
        });
      }
    }

    const score = calculateScenarioScore(kpis);

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      layer: scenario.layer,
      score,
      kpis,
      duration_ms: Date.now() - startTime,
      agent_input: prompt,
      agent_output: output.response,
    };
  }
}
