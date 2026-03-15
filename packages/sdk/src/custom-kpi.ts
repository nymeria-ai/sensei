/**
 * Custom KPI registration — allow users to define custom scoring functions
 */

export type CustomKPIFn = (agentOutput: string, context?: Record<string, unknown>) => number | Promise<number>;

export interface CustomKPIEntry {
  id: string;
  name: string;
  description?: string;
  maxScore: number;
  fn: CustomKPIFn;
}

const registry = new Map<string, CustomKPIEntry>();

/**
 * Register a custom KPI scoring function.
 * The function receives the agent's output and optional context,
 * and should return a raw score (0 to maxScore).
 */
export function registerKPI(entry: CustomKPIEntry): void {
  if (registry.has(entry.id)) {
    throw new Error(`Custom KPI "${entry.id}" is already registered`);
  }
  if (entry.maxScore <= 0) {
    throw new Error(`maxScore must be positive, got ${entry.maxScore}`);
  }
  registry.set(entry.id, entry);
}

/** Retrieve a registered custom KPI by id */
export function getCustomKPI(id: string): CustomKPIEntry | undefined {
  return registry.get(id);
}

/** List all registered custom KPIs */
export function listCustomKPIs(): CustomKPIEntry[] {
  return Array.from(registry.values());
}

/** Clear all registered KPIs (useful for testing) */
export function clearCustomKPIs(): void {
  registry.clear();
}
