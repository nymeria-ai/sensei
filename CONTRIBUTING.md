# Contributing to Sensei

We love contributions! Here's how you can help.

## Ways to Contribute

### 1. Add a Test Suite
The most impactful contribution. Create a new suite for a professional role:
- Define scenarios across all 3 layers (execution, reasoning, self-improvement)
- Include realistic fixtures (sample data, transcripts, etc.)
- Write clear rubrics for LLM-judge KPIs
- Test with at least 2 different agents

### 2. Improve Existing Suites
- Add scenarios to existing suites
- Improve scoring rubrics for more accurate evaluation
- Add edge-case scenarios
- Contribute fixtures (more diverse test data)

### 3. Build Adapters
- Add support for new agent frameworks
- Improve existing adapters (HTTP, Stdio, OpenClaw)

### 4. Core Engine
- Improve scoring algorithms
- Add new automated scorer types
- Add new reporter formats
- Optimize performance
- Fix bugs

## Development Setup

```bash
git clone https://github.com/mondaycom/sensei.git
cd sensei
npm install
npm run build
npm test          # runs vitest across all packages
```

## Suite Contribution Guidelines

1. Each suite lives in `suites/<role-name>/`
2. Define scenarios in `suite.yaml`
3. Put test data in `fixtures/`
4. Include at least:
   - 3 execution scenarios
   - 2 reasoning scenarios
   - 1 self-improvement scenario
5. Each KPI must have a clear rubric (for LLM-judge) or expected value (for automated)
6. Test your suite against a real agent before submitting

## Code Style

- TypeScript strict mode
- Meaningful variable names
- Comments for complex logic only
- All new code should have corresponding tests

## Changesets

We use [changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

When you make a user-facing change, add a changeset before opening your PR:

```bash
npx changeset
```

This will prompt you to select which packages are affected, the semver bump type, and a summary of the change. The generated markdown file in `.changeset/` should be committed with your PR.

Releases are triggered manually via the GitHub Actions `Release` workflow (`workflow_dispatch`). Select which packages to release and the bump type (patch/minor/major).

## Pull Request Process

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Add a changeset: `npx changeset`
5. Run tests: `npm test`
6. Run build: `npm run build`
7. Submit PR with clear description

## License

By contributing, you agree that your contributions will be licensed under MIT.
