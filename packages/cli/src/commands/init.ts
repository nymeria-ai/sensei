/**
 * sensei init — Interactive template generator for suite YAML
 */
import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline';

interface InitAnswers {
  id: string;
  name: string;
  description: string;
  version: string;
}

function ask(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/** Escape a string for safe YAML double-quoted scalar */
function yamlEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function generateSuiteYaml(answers: InitAnswers): string {
  return `id: ${answers.id}
version: ${answers.version}
name: "${yamlEscape(answers.name)}"
description: "${yamlEscape(answers.description)}"

agent:
  adapter: http
  endpoint: "http://localhost:3000"
  timeout_ms: 60000

judge:
  provider: openai
  model: gpt-4o
  temperature: 0.0

scenarios:
  - id: example-task
    name: "Example Task"
    layer: execution
    input:
      prompt: |
        Complete this example task.
      context: {}
    kpis:
      - id: quality
        name: "Output Quality"
        weight: 0.5
        method: llm-judge
        config:
          rubric: |
            5: Excellent output, fully addresses the task
            4: Good output with minor gaps
            3: Acceptable but incomplete
            2: Poor quality, major issues
            1: Does not address the task
          max_score: 5

      - id: format
        name: "Format Compliance"
        weight: 0.5
        method: automated
        config:
          type: contains
          expected: ""

  - id: explain-approach
    name: "Explain Approach"
    layer: reasoning
    depends_on: example-task
    input:
      prompt: |
        Explain your approach to the previous task.
      previous_scenario: example-task
    kpis:
      - id: clarity
        name: "Reasoning Clarity"
        weight: 1.0
        method: llm-judge
        config:
          rubric: |
            5: Clear, structured, insightful reasoning
            3: Adequate explanation
            1: Vague or missing reasoning
          max_score: 5

  - id: improve-after-feedback
    name: "Improve After Feedback"
    layer: self-improvement
    depends_on: example-task
    input:
      prompt: |
        Redo the original task incorporating this feedback.
      feedback: "Please be more specific and provide concrete examples."
      previous_scenario: example-task
    kpis:
      - id: improvement
        name: "Improvement Over Original"
        weight: 1.0
        method: comparative-judge
        config:
          comparison_type: improvement
`;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Generate a new suite template')
    .argument('[name]', 'Suite name')
    .option('--non-interactive', 'Use defaults without prompting')
    .action(async (name?: string, cmdOpts?: { nonInteractive?: boolean }) => {
      let answers: InitAnswers;

      if (cmdOpts?.nonInteractive || !process.stdin.isTTY) {
        const id = name ?? 'my-suite';
        answers = {
          id,
          name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          description: `Evaluation suite for ${id}`,
          version: '1.0.0',
        };
      } else {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        try {
          const id = await ask(rl, 'Suite ID', name ?? 'my-suite');
          const suiteName = await ask(rl, 'Suite name', id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
          const description = await ask(rl, 'Description', `Evaluation suite for ${id}`);
          const version = await ask(rl, 'Version', '1.0.0');
          answers = { id, name: suiteName, description, version };
        } finally {
          rl.close();
        }
      }

      const yaml = generateSuiteYaml(answers);
      const outPath = join(process.cwd(), `${answers.id}.suite.yaml`);

      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, yaml, 'utf-8');

      console.log(`Suite template written to ${outPath}`);
    });
}
