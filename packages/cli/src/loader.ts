/**
 * Suite file loader — reads YAML or JSON suite definitions
 */
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { SuiteDefinition } from '@sensei/engine';

export async function loadSuiteFile(filePath: string): Promise<SuiteDefinition> {
  const ext = extname(filePath).toLowerCase();
  const raw = await readFile(filePath, 'utf-8');

  if (ext === '.json') {
    return JSON.parse(raw) as SuiteDefinition;
  }

  if (ext === '.yaml' || ext === '.yml') {
    // Dynamic import of yaml to keep it optional
    const { parse } = await import('yaml');
    return parse(raw) as SuiteDefinition;
  }

  throw new Error(`Unsupported suite file format: ${ext} (expected .yaml, .yml, or .json)`);
}
