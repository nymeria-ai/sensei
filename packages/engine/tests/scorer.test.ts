import { describe, it, expect } from 'vitest';
import {
  scoreAutomatedKPI,
  calculateScenarioScore,
  calculateLayerScores,
} from '../src/scorer.js';
import { determineBadge } from '../src/types.js';
import type { KPIDefinition, KPIResult, ScenarioResult } from '../src/types.js';

function makeKPI(overrides: Partial<KPIDefinition> & { id: string; name: string }): KPIDefinition {
  return {
    weight: 1,
    method: 'automated',
    config: {},
    ...overrides,
  };
}

function makeKPIResult(score: number, weight: number): KPIResult {
  return {
    kpi_id: 'test',
    kpi_name: 'Test',
    score,
    raw_score: score,
    max_score: 100,
    weight,
    method: 'automated',
    evidence: '',
  };
}

function makeScenarioResult(layer: 'execution' | 'reasoning' | 'self-improvement', score: number): ScenarioResult {
  return {
    scenario_id: `s-${layer}`,
    scenario_name: `Scenario ${layer}`,
    layer,
    score,
    kpis: [],
    duration_ms: 100,
    agent_input: '',
    agent_output: '',
  };
}

describe('scoreAutomatedKPI', () => {
  // ─── contains ─────────────────────────────────────────────────

  it('scores "contains" — match', () => {
    const kpi = makeKPI({ id: 'c1', name: 'Contains', config: { type: 'contains', expected: 'hello' } });
    const result = scoreAutomatedKPI(kpi, 'say hello world');
    expect(result.score).toBe(100);
    expect(result.evidence).toContain('contains');
  });

  it('scores "contains" — no match', () => {
    const kpi = makeKPI({ id: 'c2', name: 'Contains', config: { type: 'contains', expected: 'hello' } });
    const result = scoreAutomatedKPI(kpi, 'goodbye');
    expect(result.score).toBe(0);
  });

  // ─── regex ────────────────────────────────────────────────────

  it('scores "regex" — match', () => {
    const kpi = makeKPI({ id: 'r1', name: 'Regex', config: { type: 'regex', expected: '\\d{3}-\\d{4}' } });
    const result = scoreAutomatedKPI(kpi, 'Call 555-1234');
    expect(result.score).toBe(100);
  });

  it('scores "regex" — no match', () => {
    const kpi = makeKPI({ id: 'r2', name: 'Regex', config: { type: 'regex', expected: '^\\d+$' } });
    const result = scoreAutomatedKPI(kpi, 'not a number');
    expect(result.score).toBe(0);
  });

  it('scores "regex" — invalid pattern returns 0 (Fix #8)', () => {
    const kpi = makeKPI({ id: 'r3', name: 'BadRegex', config: { type: 'regex', expected: '[invalid' } });
    const result = scoreAutomatedKPI(kpi, 'anything');
    expect(result.score).toBe(0);
    expect(result.evidence).toContain('Invalid regex');
  });

  // ─── json-schema (Fix #4) ────────────────────────────────────

  it('scores "json-schema" — valid JSON, no schema provided', () => {
    const kpi = makeKPI({ id: 'j1', name: 'JSON', config: { type: 'json-schema' } });
    const result = scoreAutomatedKPI(kpi, '{"key": "value"}');
    expect(result.score).toBe(100);
    expect(result.evidence).toContain('no schema provided');
  });

  it('scores "json-schema" — invalid JSON', () => {
    const kpi = makeKPI({ id: 'j2', name: 'JSON', config: { type: 'json-schema' } });
    const result = scoreAutomatedKPI(kpi, 'not json');
    expect(result.score).toBe(0);
  });

  it('scores "json-schema" — valid JSON matching schema (Fix #4)', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    };
    const kpi = makeKPI({
      id: 'j3', name: 'Schema',
      config: { type: 'json-schema', expected: schema },
    });
    const result = scoreAutomatedKPI(kpi, '{"name": "Alice", "age": 30}');
    expect(result.score).toBe(100);
    expect(result.evidence).toContain('conforms to the provided schema');
  });

  it('scores "json-schema" — valid JSON not matching schema (Fix #4)', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    };
    const kpi = makeKPI({
      id: 'j4', name: 'Schema',
      config: { type: 'json-schema', expected: schema },
    });
    const result = scoreAutomatedKPI(kpi, '{"name": "Alice"}');
    expect(result.score).toBe(0);
    expect(result.evidence).toContain('does not conform to schema');
    expect(result.evidence).toContain('age');
  });

  // ─── json-parse ───────────────────────────────────────────────

  it('scores "json-parse" — valid JSON', () => {
    const kpi = makeKPI({ id: 'jp1', name: 'JSONParse', config: { type: 'json-parse' as any } });
    const result = scoreAutomatedKPI(kpi, '{"key": "value"}');
    expect(result.score).toBe(100);
  });

  it('scores "json-parse" — invalid JSON', () => {
    const kpi = makeKPI({ id: 'jp2', name: 'JSONParse', config: { type: 'json-parse' as any } });
    const result = scoreAutomatedKPI(kpi, 'not json');
    expect(result.score).toBe(0);
  });

  // ─── numeric-range ────────────────────────────────────────────

  it('scores "numeric-range" — in range', () => {
    const kpi = makeKPI({ id: 'n1', name: 'Range', config: { type: 'numeric-range', expected: { min: 0, max: 100 } } });
    const result = scoreAutomatedKPI(kpi, '42');
    expect(result.score).toBe(100);
  });

  it('scores "numeric-range" — out of range', () => {
    const kpi = makeKPI({ id: 'n2', name: 'Range', config: { type: 'numeric-range', expected: { min: 0, max: 10 } } });
    const result = scoreAutomatedKPI(kpi, '50');
    expect(result.score).toBe(0);
  });

  it('scores "numeric-range" — not a number', () => {
    const kpi = makeKPI({ id: 'n3', name: 'Range', config: { type: 'numeric-range', expected: { min: 0, max: 10 } } });
    const result = scoreAutomatedKPI(kpi, 'abc');
    expect(result.score).toBe(0);
    expect(result.evidence).toContain('not a number');
  });

  // ─── word-count (Fix #1) ─────────────────────────────────────

  it('scores "word-count" — in range (Fix #1)', () => {
    const kpi = makeKPI({
      id: 'wc1', name: 'WordCount',
      config: { type: 'word-count' as any, expected: { min: 3, max: 10 } },
    });
    const result = scoreAutomatedKPI(kpi, 'hello world this is five words');
    expect(result.score).toBe(100);
    expect(result.evidence).toContain('Word count 6');
  });

  it('scores "word-count" — out of range (Fix #1)', () => {
    const kpi = makeKPI({
      id: 'wc2', name: 'WordCount',
      config: { type: 'word-count' as any, expected: { min: 100, max: 200 } },
    });
    const result = scoreAutomatedKPI(kpi, 'too short');
    expect(result.score).toBe(0);
    expect(result.evidence).toContain('Word count 2');
  });

  it('scores "word-count" — with tolerance (Fix #1)', () => {
    const kpi = makeKPI({
      id: 'wc3', name: 'WordCount',
      config: { type: 'word-count' as any, expected: { min: 10, max: 20 }, tolerance: 5 },
    });
    // 7 words is below min=10 but within tolerance of 5 (min-5=5)
    const result = scoreAutomatedKPI(kpi, 'one two three four five six seven');
    expect(result.score).toBe(100);
  });

  it('scores "word-count" — handles full email body correctly (Fix #1)', () => {
    // This is the exact bug: numeric-range tried parseFloat on email body → NaN → 0
    const email = `Subject: Quick question about your migration project

Hi Sarah,

I noticed your recent LinkedIn post about the monolith-to-microservices migration
at Meridian Health Systems. Managing that kind of transition across 3 time zones
while trying to prove velocity gains to the board sounds incredibly challenging.

AgentOps helps engineering leaders like you surface productivity patterns
without adding overhead to your team. Our privacy-first approach means
we analyze flow metrics, never actual code content.

Would you be open to a quick 15-minute call next week to see if there's a fit?

Best,
Alex`;
    const kpi = makeKPI({
      id: 'wc-email', name: 'EmailBrevity',
      config: { type: 'word-count' as any, expected: { min: 50, max: 200 }, tolerance: 20 },
    });
    const result = scoreAutomatedKPI(kpi, email);
    expect(result.score).toBe(100);
    expect(result.evidence).toContain('Word count');
    // Verify it actually counted words, not returned NaN
    expect(result.evidence).not.toContain('NaN');
  });

  // ─── function (Fix #9) ───────────────────────────────────────

  it('scores "function" — returns 0 with guidance (Fix #9)', () => {
    const kpi = makeKPI({ id: 'fn1', name: 'CustomFn', config: { type: 'function' } });
    const result = scoreAutomatedKPI(kpi, 'anything');
    expect(result.score).toBe(0);
    expect(result.evidence).toContain('registerKPI');
  });

  // ─── misc ─────────────────────────────────────────────────────

  it('handles custom max_score', () => {
    const kpi = makeKPI({ id: 'ms', name: 'MaxScore', config: { type: 'contains', expected: 'x', max_score: 5 } });
    const result = scoreAutomatedKPI(kpi, 'x');
    expect(result.score).toBe(100);
    expect(result.raw_score).toBe(5);
    expect(result.max_score).toBe(5);
  });

  it('handles truly unknown type', () => {
    const kpi = makeKPI({ id: 'unk', name: 'Unknown', config: { type: 'totally-fake' as any } });
    const result = scoreAutomatedKPI(kpi, 'anything');
    expect(result.score).toBe(0);
    expect(result.evidence).toContain('Unknown');
  });
});

describe('calculateScenarioScore', () => {
  it('computes weighted average', () => {
    const kpis = [makeKPIResult(80, 0.3), makeKPIResult(60, 0.7)];
    const score = calculateScenarioScore(kpis);
    expect(score).toBeCloseTo((80 * 0.3 + 60 * 0.7) / (0.3 + 0.7));
  });

  it('returns 0 for empty KPIs', () => {
    expect(calculateScenarioScore([])).toBe(0);
  });

  it('handles equal weights', () => {
    const kpis = [makeKPIResult(100, 1), makeKPIResult(50, 1)];
    expect(calculateScenarioScore(kpis)).toBe(75);
  });
});

describe('calculateLayerScores', () => {
  it('computes layer and overall scores with all layers present', () => {
    const scenarios = [
      makeScenarioResult('execution', 80),
      makeScenarioResult('execution', 90),
      makeScenarioResult('reasoning', 70),
      makeScenarioResult('self-improvement', 60),
    ];
    const scores = calculateLayerScores(scenarios);
    expect(scores.execution).toBe(85);
    expect(scores.reasoning).toBe(70);
    expect(scores.self_improvement).toBe(60);
    expect(scores.overall).toBeCloseTo(85 * 0.5 + 70 * 0.3 + 60 * 0.2);
  });

  // Fix #3: Missing layers should NOT penalize the overall score
  it('execution-only suite gets full credit — not penalized for missing layers (Fix #3)', () => {
    const scenarios = [makeScenarioResult('execution', 90)];
    const scores = calculateLayerScores(scenarios);
    expect(scores.execution).toBe(90);
    expect(scores.reasoning).toBe(0);
    expect(scores.self_improvement).toBe(0);
    // Fix #3: overall should be 90, not 45 (90 * 0.5)
    expect(scores.overall).toBeCloseTo(90);
  });

  it('two layers present — weights are re-normalized (Fix #3)', () => {
    const scenarios = [
      makeScenarioResult('execution', 80),
      makeScenarioResult('reasoning', 60),
    ];
    const scores = calculateLayerScores(scenarios);
    // execution weight: 0.5, reasoning weight: 0.3, total: 0.8
    // normalized: execution: 0.5/0.8 = 0.625, reasoning: 0.3/0.8 = 0.375
    const expected = 80 * (0.5 / 0.8) + 60 * (0.3 / 0.8);
    expect(scores.overall).toBeCloseTo(expected);
  });

  it('returns 0 for empty scenarios', () => {
    const scores = calculateLayerScores([]);
    expect(scores.overall).toBe(0);
    expect(scores.execution).toBe(0);
  });
});

describe('determineBadge', () => {
  it('gold >= 90', () => expect(determineBadge(90)).toBe('gold'));
  it('gold at 95', () => expect(determineBadge(95)).toBe('gold'));
  it('silver >= 75', () => expect(determineBadge(75)).toBe('silver'));
  it('silver at 89', () => expect(determineBadge(89)).toBe('silver'));
  it('bronze >= 60', () => expect(determineBadge(60)).toBe('bronze'));
  it('bronze at 74', () => expect(determineBadge(74)).toBe('bronze'));
  it('none < 60', () => expect(determineBadge(59)).toBe('none'));
  it('none at 0', () => expect(determineBadge(0)).toBe('none'));
});
