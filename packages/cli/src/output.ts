/**
 * Output utilities — write results to file
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeOutput(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}
