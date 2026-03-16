/**
 * Shared LLM client factory — creates OpenAI-compatible clients for Judge and Comparator.
 *
 * Extracted from judge.ts and comparator.ts to eliminate duplication (DRY).
 * Handles provider-specific API key inference and base URL configuration.
 */

import OpenAI from 'openai';
import type { JudgeConfig } from './types.js';

/**
 * Infer the API key from environment variables based on the provider.
 */
function inferApiKey(provider: string): string {
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    return key;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY environment variable is not set');
  return key;
}

/**
 * Create an OpenAI-compatible client from a JudgeConfig.
 *
 * Note: The Anthropic API is NOT OpenAI-compatible. If provider is 'anthropic',
 * this will throw a clear error directing users to use 'openai-compatible' with
 * a proxy/gateway, or a native Anthropic adapter (not yet implemented).
 */
export function createLLMClient(config: JudgeConfig): OpenAI {
  const apiKey = config.api_key ?? inferApiKey(config.provider);

  // Fix #6: Anthropic's API is not OpenAI-compatible — throw a clear error
  if (config.provider === 'anthropic') {
    if (!config.base_url) {
      throw new Error(
        `Anthropic's native API is not compatible with the OpenAI SDK. ` +
        `To use Anthropic models, either:\n` +
        `  1. Use provider: "openai-compatible" with a proxy that provides OpenAI-compatible endpoints ` +
        `(e.g., LiteLLM, OpenRouter, AWS Bedrock)\n` +
        `  2. Set base_url to an OpenAI-compatible proxy endpoint\n` +
        `Direct Anthropic API support is planned for a future release.`,
      );
    }
    // If base_url is provided, assume it's a compatible proxy (e.g. LiteLLM)
    return new OpenAI({ apiKey, baseURL: config.base_url });
  }

  if (config.provider === 'openai-compatible' && config.base_url) {
    return new OpenAI({ apiKey, baseURL: config.base_url });
  }

  // Default: OpenAI
  return new OpenAI({ apiKey });
}
