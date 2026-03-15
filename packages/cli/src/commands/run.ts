/**
 * sensei run — Execute a suite against an agent
 */
import { Command } from 'commander';
import type { SuiteDefinition, JudgeConfig, AgentConfig, SuiteResult } from '@sensei/engine';
import { formatTerminalReport } from '../format.js';
import { loadSuiteFile } from '../loader.js';
import { writeOutput } from '../output.js';

export interface RunOptions {
  suite: string;
  target?: string;
  adapter?: 'http' | 'stdio' | 'openclaw' | 'langchain';
  judgeModel?: string;
  timeout?: string;
  verbose?: boolean;
  output?: string;
  format?: string;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run a qualification suite against an agent')
    .requiredOption('--suite <path>', 'Path to suite YAML or .ts file')
    .option('--target <url>', 'Agent endpoint URL or command')
    .option('--adapter <type>', 'Adapter type: http, stdio, openclaw, langchain', 'http')
    .option('--judge-model <model>', 'LLM judge model', 'gpt-4o')
    .option('--timeout <ms>', 'Per-scenario timeout in ms', '60000')
    .action(async (opts: RunOptions) => {
      const parentOpts = program.opts();
      const verbose = parentOpts.verbose ?? false;
      const format = parentOpts.format ?? 'terminal';
      const outputPath = parentOpts.output;

      try {
        const suite = await loadSuiteFile(opts.suite);

        // Override agent config if --target provided
        if (opts.target) {
          suite.agent = {
            adapter: (opts.adapter ?? 'http') as AgentConfig['adapter'],
            endpoint: opts.target,
            timeout_ms: parseInt(opts.timeout ?? '60000', 10),
          };
        }

        // Override judge config if --judge-model provided
        if (opts.judgeModel) {
          suite.judge = {
            ...(suite.judge ?? { provider: 'openai' as const, model: 'gpt-4o' }),
            model: opts.judgeModel,
          };
        }

        if (verbose) {
          console.error(`[sensei] Suite: ${suite.name} (${suite.id} v${suite.version})`);
          console.error(`[sensei] Scenarios: ${suite.scenarios.length}`);
          console.error(`[sensei] Adapter: ${suite.agent.adapter}`);
          console.error(`[sensei] Judge: ${suite.judge?.model ?? 'none'}`);
        }

        // Dynamic import of engine Runner (may not exist yet — guard gracefully)
        let result: SuiteResult;
        try {
          const { Runner } = await import('@sensei/engine');
          const runner = new Runner();
          result = await runner.run(suite);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Cannot find module') || msg.includes('is not a function')) {
            console.error('[sensei] Engine runner not yet available. Suite parsed successfully:');
            console.error(JSON.stringify({ id: suite.id, name: suite.name, scenarios: suite.scenarios.length }, null, 2));
            process.exit(0);
          }
          throw err;
        }

        const output = format === 'json'
          ? JSON.stringify(result, null, 2)
          : formatTerminalReport(result);

        if (outputPath) {
          await writeOutput(outputPath, output);
          if (verbose) console.error(`[sensei] Report written to ${outputPath}`);
        } else {
          console.log(output);
        }

        // Exit with non-zero if badge is 'none'
        if (result.badge === 'none') {
          process.exit(1);
        }
      } catch (err: unknown) {
        console.error(`[sensei] Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
