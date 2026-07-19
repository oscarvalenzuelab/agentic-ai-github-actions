---
on:
  workflow_run:
    workflows: ["AI-Powered Dependency Analysis"]
    types: [completed]
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  actions: read
  copilot-requests: write

engine:
  id: copilot
  model: gpt-5-mini

max-turns: 15
max-ai-credits: 100

safe-outputs:
  create-pull-request:
    title-prefix: "[deps] "
    labels: [dependencies, automated]
  add-comment:
    max: 1
---

# Dependency Remediation Agent

You run after the "AI-Powered Dependency Analysis" workflow completes. Your job
is to act on its findings by preparing a remediation pull request.

## Steps

1. Download the `ai-dependency-analysis` artifact from the workflow run that
   triggered you. The relevant files are:
   - `osv-vulns.json` — known vulnerabilities per package (OSV.dev data)
   - `actionable-insights.md` — prioritized findings
   - `ai-analysis-result.json` — the analysis summary and recommendations
2. Identify direct dependencies in `package.json` that have known
   vulnerabilities in `osv-vulns.json` with a fixed version available.
3. For each, update `package.json` to the smallest version range that resolves
   all listed vulnerabilities. Prefer staying within the current major version;
   only propose a major bump when no fixed version exists within it, and say so
   in the PR description.
4. Regenerate `package-lock.json` with `npm install --package-lock-only` and
   confirm `npm audit` reports fewer vulnerabilities than before.
5. Open a single pull request with all version bumps. In the description, list
   each package, the old and new version, and the vulnerability IDs resolved.
6. Add one comment to the open issue labeled `ai-analysis` summarizing what the
   pull request addresses and what (if anything) could not be auto-remediated.

## Constraints

- Do not modify any file other than `package.json` and `package-lock.json`.
- Do not open a pull request if there is nothing to remediate; in that case
  just add the issue comment saying the dependency set is clean.
- If the triggering workflow failed, only add an issue comment noting the
  failure; do not attempt remediation.
