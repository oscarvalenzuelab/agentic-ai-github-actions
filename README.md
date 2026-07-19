# Agentic AI Workflow for Supply Chain Analysis using GitHub Actions

GitHub Actions workflows that help an OSPO evaluate the health, security, and sustainability of npm dependencies. The pipeline combines native GitHub supply chain data (dependency graph, OpenSSF Scorecard), known-vulnerability data from OSV.dev, and model-driven assessments via GitHub Models.

## What It Does

Two independent workflows:

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `scorecard-analysis.yml` | Mondays 02:00 UTC | OpenSSF Scorecard of this repository plus an npm audit of its dependencies |
| `ai-dependency-analysis.yml` | Wednesdays 04:00 UTC | Full dependency-tree analysis with model-driven risk assessment |

Both also run on manual dispatch and on pushes to `main` that change the relevant files.

## How the AI Analysis Works

The `ai-dependency-analysis.yml` pipeline, in order:

1. **Enumerate dependencies** from the GitHub dependency graph SBOM API (`/dependency-graph/sbom`) — the full tree, direct and transitive, with exact resolved versions. Falls back to parsing `package.json` if the dependency graph is unavailable.
2. **Query known vulnerabilities** for every package version against the OSV.dev batch API (free, no authentication).
3. **Collect repository metrics** for each direct dependency's GitHub repository via the REST API: overview, contributor statistics, recent commits, issues/PRs, community profile, and releases.
4. **Compute health scores** (0-100) per repository from a weighted heuristic: recent activity, contributor count and concentration (bus factor), issue-resolution time, release recency, and popularity. GitHub's community-profile `health_percentage` is one input; the composite score is computed locally in `prepare-analysis-context.js`.
5. **Run AI analysis** with [GitHub Models](https://docs.github.com/en/github-models) through [`actions/ai-inference`](https://github.com/actions/ai-inference). The selected analysis prompt from `analysis-prompts/` becomes the system prompt (with a strict JSON output contract appended), and the summarized metrics plus OSV vulnerability data become the user prompt. Authentication uses the built-in `GITHUB_TOKEN` with the `models: read` permission — no external API key or secret is required.
6. **Fall back to rule-based analysis** (`enhanced-rule-analysis.js`) if GitHub Models is unavailable, so the workflow always produces a result.
7. **Generate reports**: a formatted analysis report, a per-repository risk matrix (security / maintenance / sustainability / licensing, each scored 0-10), actionable insights with prioritized recommendations, and a summary dashboard.
8. **Create or update a tracking issue** (labels `ai-analysis`, `dependencies`) on scheduled and manual runs.

## Analysis Modes

The `analysis_type` input selects the system prompt sent to the model. Each mode corresponds to a file in `analysis-prompts/`:

- `comprehensive` — full dependency health assessment (default)
- `security-focused` — security posture and vulnerability exposure
- `maintainer-burnout` — sustainability and bus-factor evaluation
- `community-health` — engagement and governance analysis
- `license-compliance` — license risk assessment

The rule-based fallback implements the same five modes with heuristics.

## Setup

1. Enable GitHub Actions on the repository.
2. Ensure the dependency graph is enabled (on by default for public repositories; Settings > Security for private ones).
3. Ensure GitHub Models is available to the repository or organization (Settings > Models). If it is not, the workflow still runs and uses the rule-based fallback.

No repository secrets are required.

### Running Manually

1. Go to the Actions tab.
2. Select "OpenSSF Scorecard Analysis" or "AI-Powered Dependency Analysis".
3. Click "Run workflow". For the AI analysis you can choose the analysis type and override the model (default: `openai/gpt-4o-mini`; any model in the [GitHub Models catalog](https://github.com/marketplace/models) works).

### Running Locally

```bash
# List dependencies and their GitHub repositories (package.json mode)
npm run extract-deps

# Query OSV.dev for known vulnerabilities
node scripts/extract-dependencies.js > dependencies.json
node scripts/fetch-osv-vulns.js dependencies.json
```

## Scripts

Data collection:
- `extract-dependencies.js` — enumerates the dependency tree from an SBOM file argument (or `package.json` without one) and maps direct dependencies to their GitHub repositories via the npm registry
- `fetch-osv-vulns.js` — batch-queries OSV.dev for known vulnerabilities across the dependency set
- `prepare-analysis-context.js` — aggregates raw repository data into per-repo metrics and health scores

AI analysis:
- `build-ai-prompt.js` — builds the summarized user prompt (metrics plus vulnerability data) sent to the model
- `parse-ai-response.js` — normalizes the model response into structured JSON, tolerating fenced or prose-wrapped output
- `enhanced-rule-analysis.js` — rule-based analysis used when GitHub Models is unavailable

Reporting:
- `format-ai-report.js` — renders the analysis result and metrics as a Markdown report
- `generate-risk-matrix.js` — scores each repository 0-10 across security, maintenance, sustainability, and licensing
- `generate-insights.js` — produces prioritized, actionable recommendations from the risk matrix

## Output Artifacts

AI analysis run (`ai-dependency-analysis` artifact): raw repository data, the SBOM, OSV vulnerability results, the analysis context, the AI result JSON, the formatted report, the risk matrix, actionable insights, and the summary dashboard.

Scorecard run (`security-report` artifact): the security report, npm audit JSON, and the Scorecard SARIF file. The SARIF results are also uploaded to the repository's Security tab.

## Customization

- **Dependencies**: the packages declared in `package.json` are the analysis subjects. Point the workflows at your own project (or replace the dependency list) to analyze what you actually ship. None of the declared runtime dependencies are imported by the scripts here — the scripts use only Node.js built-ins.
- **Prompts**: add a new file to `analysis-prompts/` and a matching option to the `analysis_type` workflow input.
- **Model**: pass any GitHub Models catalog identifier via the `model` input.
- **Schedules**: adjust the `cron` expressions in the workflow files.

## Security Considerations

- Both workflows run under least-privilege permissions; the only write scopes are `issues: write` (tracking issues) and `security-events: write` (SARIF upload).
- All actions are pinned to full commit SHAs.
- No external API keys or secrets are used. The only external services contacted are the npm registry (package metadata) and OSV.dev (vulnerability data); AI inference stays within GitHub via GitHub Models.

## Limitations

- Deep repository metrics (contributors, activity, community health) cover direct dependencies with discoverable GitHub repositories; transitive packages get vulnerability coverage only.
- GitHub Models free-tier rate limits apply to AI analysis; scheduled weekly runs fit comfortably within them.
- Health and risk scores are heuristics intended for triage, not verdicts.
- GitHub REST API rate limits may slow metric collection for very large direct-dependency sets.

## License

Apache-2.0
