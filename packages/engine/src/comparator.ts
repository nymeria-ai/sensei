/**
 * Comparator — Before/after comparison for the self-improvement layer.
 *
 * Uses the LLM judge to compare an agent's original output with its
 * revised output after feedback, scoring improvement quality.
 */

import OpenAI from 'openai';
import pLimit from 'p-limit';
import type { JudgeConfig, JudgeVerdict, KPIDefinition } from './types.js';
import { createLLMClient } from './llm-client.js';

// ─── Comparison Prompt ──────────────────────────────────────────────

function buildComparisonPrompt(opts: {
  kpi: KPIDefinition;
  task: string;
  feedback: string;
  originalOutput: string;
  revisedOutput: string;
}): { system: string; user: string } {
  const comparisonType = opts.kpi.config.comparison_type ?? 'improvement';

  const system = `You are an expert evaluator assessing whether an AI agent improved its output after receiving feedback.
Always respond with valid JSON only — no markdown fences, no extra text.`;

  const user = `## KPI: ${opts.kpi.name}
Comparison type: ${comparisonType}

## Original Task
${opts.task}

## Feedback Given
${opts.feedback}

## Original Output
${opts.originalOutput}

## Revised Output
${opts.revisedOutput}

## Scoring Instructions
Evaluate the revised output compared to the original:
- For "improvement": Did the agent meaningfully address the feedback? (0-${opts.kpi.config.max_score ?? 10})
- For "consistency": Did the agent maintain strengths while improving? (0-${opts.kpi.config.max_score ?? 10})
- For "adaptation": Did the agent adapt its approach appropriately? (0-${opts.kpi.config.max_score ?? 10})

Respond in JSON:
{
  "score": <number>,
  "max_score": ${opts.kpi.config.max_score ?? 10},
  "reasoning": "<string explaining what improved and what didn't>",
  "confidence": <number 0.0-1.0>
}`;

  return { system, user };
}

// ─── Public API ─────────────────────────────────────────────────────

// Concurrency limit shared across Comparator calls (Fix #12)
const DEFAULT_LLM_CONCURRENCY = 3;

export class Comparator {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxRetries: number;
  private concurrencyLimit: ReturnType<typeof pLimit>;

  constructor(private config: JudgeConfig) {
    this.client = createLLMClient(config);
    this.model = config.model;
    this.temperature = config.temperature ?? 0.0;
    this.maxRetries = config.max_retries ?? 3;
    this.concurrencyLimit = pLimit(DEFAULT_LLM_CONCURRENCY);
  }

  async compare(opts: {
    kpi: KPIDefinition;
    task: string;
    feedback: string;
    originalOutput: string;
    revisedOutput: string;
  }): Promise<JudgeVerdict> {
    return this.concurrencyLimit(() => this._compare(opts));
  }

  private async _compare(opts: {
    kpi: KPIDefinition;
    task: string;
    feedback: string;
    originalOutput: string;
    revisedOutput: string;
  }): Promise<JudgeVerdict> {
    const prompt = buildComparisonPrompt(opts);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: this.temperature,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        });

        const raw = completion.choices[0]?.message?.content ?? '';
        const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned) as Record<string, unknown>;

        const score = Number(parsed.score);
        const max_score = Number(parsed.max_score);
        if (Number.isNaN(score) || Number.isNaN(max_score)) {
          throw new Error(`Invalid comparator verdict — NaN score/max_score from: ${raw}`);
        }

        return {
          score,
          max_score,
          reasoning: String(parsed.reasoning ?? ''),
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error('Comparator call failed');
  }
}

export { buildComparisonPrompt };
