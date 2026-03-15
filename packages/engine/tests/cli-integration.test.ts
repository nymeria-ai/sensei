/**
 * CLI Integration Test — verifies the full wiring:
 *   createAdapter → HttpAdapter → Runner → SuiteResult
 *
 * Uses a real mock HTTP server (no mocks/stubs for the adapter layer).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMockServer } from './mock-server.js';
import { Runner } from '../src/runner.js';
import { createAdapter } from '../src/adapters/types.js';
// Side-effect import to register the http adapter factory
import '../src/adapters/http.js';
import type { SuiteDefinition, KPIResult } from '../src/types.js';

const RESPONSES = new Map<string, string>([
  ['summarize', 'The document discusses key strategies for improving software quality through automated testing and continuous integration.'],
  ['explain', 'The main argument is that automated testing reduces bugs by catching regressions early in the development cycle.'],
  ['improve', 'The revised summary now includes specific metrics: automated testing reduces bug escape rate by 40% and CI pipelines catch 95% of integration issues before deployment.'],
  ['default', 'This is a generic mock agent response for testing purposes.'],
]);

let mockServer: ReturnType<typeof createMockServer>;
let baseUrl: string;

beforeAll(async () => {
  mockServer = createMockServer({ responses: RESPONSES });
  const port = await mockServer.start();
  baseUrl = mockServer.url();
});

afterAll(async () => {
  await mockServer.stop();
});

function buildSuite(endpoint: string): SuiteDefinition {
  return {
    id: 'cli-integration-test',
    name: 'CLI Integration Test Suite',
    version: '1.0.0',
    agent: {
      adapter: 'http',
      endpoint,
      timeout_ms: 5000,
      health_check: `${endpoint}/health`,
    },
    scenarios: [
      {
        id: 'exec-summarize',
        name: 'Summarize Document',
        layer: 'execution',
        input: {
          prompt: 'Please summarize this document.',
          context: { doc: 'A paper about software testing best practices.' },
        },
        kpis: [
          {
            id: 'contains-testing',
            name: 'Mentions testing',
            weight: 0.5,
            method: 'automated',
            config: { type: 'contains', expected: 'testing' },
          },
          {
            id: 'contains-quality',
            name: 'Mentions quality',
            weight: 0.5,
            method: 'automated',
            config: { type: 'contains', expected: 'quality' },
          },
        ],
      },
      {
        id: 'reason-explain',
        name: 'Explain Main Argument',
        layer: 'reasoning',
        depends_on: 'exec-summarize',
        input: {
          prompt: 'Now explain the main argument in the summary.',
        },
        kpis: [
          {
            id: 'contains-argument',
            name: 'Contains argument reference',
            weight: 1,
            method: 'automated',
            config: { type: 'contains', expected: 'argument' },
          },
        ],
      },
      {
        id: 'si-improve',
        name: 'Improve Summary',
        layer: 'self-improvement',
        depends_on: 'exec-summarize',
        input: {
          prompt: 'Please improve the original summary with specific metrics.',
          feedback: 'The summary lacks concrete numbers. Add quantitative data.',
        },
        kpis: [
          {
            id: 'contains-metrics',
            name: 'Includes metrics',
            weight: 1,
            method: 'automated',
            config: { type: 'contains', expected: 'metrics' },
          },
        ],
      },
    ],
  };
}

describe('CLI Integration — Runner + HttpAdapter against mock server', () => {
  it('creates an adapter via createAdapter factory', () => {
    const adapter = createAdapter({
      adapter: 'http',
      endpoint: baseUrl,
    });
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('http');
  });

  it('runs a full suite and produces valid SuiteResult', async () => {
    const suite = buildSuite(baseUrl);
    const adapter = createAdapter(suite.agent);

    const progressCalls: number[] = [];
    const runner = new Runner(adapter, {
      retries: 1,
      onScenarioComplete: (_res, idx) => progressCalls.push(idx),
    });

    const result = await runner.run(suite);

    // Basic structure
    expect(result.suite_id).toBe('cli-integration-test');
    expect(result.agent_id).toBe('http');
    expect(result.scenarios).toHaveLength(3);
    expect(result.duration_ms).toBeGreaterThan(0);
    expect(result.badge).toBeDefined();
    expect(result.timestamp).toBeTruthy();

    // Scores structure
    expect(result.scores).toHaveProperty('overall');
    expect(result.scores).toHaveProperty('execution');
    expect(result.scores).toHaveProperty('reasoning');
    expect(result.scores).toHaveProperty('self_improvement');

    // Progress callback was called for each scenario
    expect(progressCalls).toEqual([0, 1, 2]);
  });

  it('scores automated KPIs correctly against mock responses', async () => {
    const suite = buildSuite(baseUrl);
    const adapter = createAdapter(suite.agent);
    const runner = new Runner(adapter);
    const result = await runner.run(suite);

    // Execution scenario: response contains "testing" and "quality"
    const exec = result.scenarios.find((s) => s.scenario_id === 'exec-summarize')!;
    expect(exec.score).toBe(100);
    expect(exec.kpis).toHaveLength(2);
    expect(exec.kpis.every((k) => k.score === 100)).toBe(true);

    // Reasoning scenario: response contains "argument"
    const reason = result.scenarios.find((s) => s.scenario_id === 'reason-explain')!;
    expect(reason.score).toBe(100);

    // Self-improvement scenario: response contains "metrics"
    const si = result.scenarios.find((s) => s.scenario_id === 'si-improve')!;
    expect(si.score).toBe(100);
  });

  it('injects depends_on output into downstream scenario prompts', async () => {
    const suite = buildSuite(baseUrl);
    const adapter = createAdapter(suite.agent);
    const runner = new Runner(adapter);
    const result = await runner.run(suite);

    // The reasoning scenario should have received the execution output in its input
    const reason = result.scenarios.find((s) => s.scenario_id === 'reason-explain')!;
    expect(reason.agent_input).toContain('Previous output:');
    expect(reason.agent_input).toContain('explain');
  });

  it('includes feedback in self-improvement scenario input', async () => {
    const suite = buildSuite(baseUrl);
    const adapter = createAdapter(suite.agent);
    const runner = new Runner(adapter);
    const result = await runner.run(suite);

    const si = result.scenarios.find((s) => s.scenario_id === 'si-improve')!;
    expect(si.agent_input).toContain('Feedback:');
    expect(si.agent_input).toContain('quantitative data');
  });

  it('uses comparatorScorer when provided for comparative-judge KPIs', async () => {
    const suite = buildSuite(baseUrl);
    // Replace the self-improvement KPI with a comparative-judge one
    const siScenario = suite.scenarios.find((s) => s.id === 'si-improve')!;
    siScenario.kpis = [
      {
        id: 'comp-improvement',
        name: 'Improvement Quality',
        weight: 1,
        method: 'comparative-judge',
        config: { comparison_type: 'improvement', max_score: 10 },
      },
    ];

    const adapter = createAdapter(suite.agent);
    const comparatorCalls: string[] = [];

    const runner = new Runner(adapter, {
      comparatorScorer: async (kpi, task, feedback, originalOutput, revisedOutput) => {
        comparatorCalls.push(kpi.id);
        return {
          kpi_id: kpi.id,
          kpi_name: kpi.name,
          score: 80,
          raw_score: 8,
          max_score: 10,
          weight: kpi.weight,
          method: kpi.method,
          evidence: 'Good improvement detected',
        };
      },
    });

    const result = await runner.run(suite);

    expect(comparatorCalls).toContain('comp-improvement');
    const si = result.scenarios.find((s) => s.scenario_id === 'si-improve')!;
    expect(si.kpis[0].score).toBe(80);
    expect(si.kpis[0].evidence).toBe('Good improvement detected');
  });

  it('handles server errors gracefully with retries', async () => {
    // Point to a non-existent endpoint to trigger connection errors
    const suite = buildSuite('http://127.0.0.1:1'); // port 1 won't be listening
    const adapter = createAdapter(suite.agent);
    const runner = new Runner(adapter, { retries: 0 });

    // Health check should fail
    await expect(runner.run(suite)).rejects.toThrow('health check failed');
  });
});
