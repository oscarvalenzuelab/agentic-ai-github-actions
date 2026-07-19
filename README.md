# Agentic AI Workflow for Supply Chain Analysis using GitHub Actions

GitHub Actions workflows that help an OSPO evaluate the health, security, and sustainability of open source dependencies (npm and Python). The pipeline combines native GitHub supply chain data (dependency graph, OpenSSF Scorecard), known-vulnerability data from OSV.dev, and model-driven assessments via GitHub Models.

## What It Does

Three workflows:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `scorecard-analysis.yml` | Mondays 02:00 UTC | OpenSSF Scorecard of this repository plus an npm audit of its dependencies |
| `ai-dependency-analysis.yml` | Wednesdays 04:00 UTC | Full dependency-tree analysis with model-driven risk assessment |
| `dependency-remediation.md` | After each AI analysis run | Optional agent that fixes what the analysis found: bumps vulnerable dependencies and opens a pull request. Requires a GitHub Copilot plan (see Setup) |

The first two also run on manual dispatch and on pushes to `main` that change the relevant files; all three support manual dispatch.

## How the AI Analysis Works

The `ai-dependency-analysis.yml` pipeline, in order:

1. **Enumerate dependencies** from the GitHub dependency graph SBOM API (`/dependency-graph/sbom`) — the full tree, direct and transitive, with exact resolved versions. Falls back to parsing `package.json` if the dependency graph is unavailable.
2. **Query known vulnerabilities** for every package version against the OSV.dev batch API (free, no authentication).
3. **Evaluate license policy** with the [OSPAC](https://github.com/SemClone/ospac) dataset: every package license in the tree is checked against the project's own license for compatibility, copyleft exposure, and obligations.
4. **Generate an AIBOM** with [SCANOSS ai-finder](https://pypi.org/project/ai-finder/): detects AI/ML SDKs, packages, and model files in the codebase and produces a CycloneDX 1.6 AI bill of materials (useful for EU AI Act reporting).
5. **Collect repository metrics** for each direct dependency's GitHub repository via the REST API: overview, contributor statistics, recent commits, issues/PRs, community profile, and releases.
6. **Compute health scores** (0-100) per repository from a weighted heuristic: recent activity, contributor count and concentration (bus factor), issue-resolution time, release recency, and popularity. GitHub's community-profile `health_percentage` is one input; the composite score is computed locally in `prepare-analysis-context.js`.
7. **Run AI analysis** with [GitHub Models](https://docs.github.com/en/github-models) through [`actions/ai-inference`](https://github.com/actions/ai-inference). The selected analysis prompt from `analysis-prompts/` becomes the system prompt (with a strict JSON output contract appended), and the summarized metrics, OSV vulnerability data, OSPAC license findings, and detected AI components become the user prompt. Authentication uses the built-in `GITHUB_TOKEN` with the `models: read` permission — no external API key or secret is required.
8. **Fall back to rule-based analysis** (`enhanced-rule-analysis.js`) if GitHub Models is unavailable, so the workflow always produces a result.
9. **Generate the report**: a single consolidated Markdown report (assessment, vulnerabilities, license policy, AI components, per-repository health and risk) plus a per-repository risk matrix scored 0-10 across security, maintenance, sustainability, and licensing.
10. **Create or update a tracking issue** (labels `ai-analysis`, `dependencies`) on scheduled and manual runs.

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
4. Optional — the remediation agent. Skip this entirely if you only want the analysis and reports; the first two workflows are fully independent of it. The agent requires a GitHub Copilot plan that supports explicit model selection (paid plans; see the known limitation below), plus one repository secret — a fine-grained PAT with the Copilot Requests permission:
   1. Open https://github.com/settings/personal-access-tokens/new
   2. Set **Resource owner** to your personal account — the Copilot Requests permission is only available on user-owned tokens, so it will not appear if an organization is selected
   3. Repository access: "Public repositories" is sufficient
   4. Click **Add permissions** (the list is collapsed by default) and select **Copilot Requests**
   5. Generate the token (`github_pat_...`) and store it as a repository Actions secret named `COPILOT_GITHUB_TOKEN`:

      ```bash
      gh secret set COPILOT_GITHUB_TOKEN --repo <owner>/<repo>
      ```

   Notes: OAuth tokens (`gho_...`) and classic PATs (`ghp_...`) are rejected — it must be a fine-grained PAT.

   **Known limitation (July 2026):** the agent currently fails on Copilot Free with `400 model not supported`. Copilot Free permits automatic model selection only, while gh-aw's architecture always sends an explicitly pinned model (and its proxy does not pass through the CLI's auto-selection). The models endpoint lists `gpt-5-mini` as available in the same run — the catalog is not entitlement-filtered, but pinned completion requests are. The identical CLI and PAT work outside Actions where auto-selection is allowed. Paid plans that permit explicit model selection are reported to work with a pinned model ([gh-aw#26223](https://github.com/github/gh-aw/issues/26223)); unverified here. Fix requires upstream gh-aw support for auto-model pass-through.

The analysis and Scorecard workflows require no repository secrets. The remediation agent requires the single `COPILOT_GITHUB_TOKEN` secret described above.

### Running Manually

1. Go to the Actions tab.
2. Select "OpenSSF Scorecard Analysis", "AI-Powered Dependency Analysis", or "Dependency Remediation Agent".
3. Click "Run workflow". For the AI analysis you can choose the analysis type and override the model (default: `openai/gpt-4o-mini`; any model in the [GitHub Models catalog](https://github.com/marketplace/models) works).

### Running Locally

```bash
# List dependencies and their GitHub repositories (package.json mode)
npm run extract-deps

# Query OSV.dev for known vulnerabilities
node scripts/extract-dependencies.js > dependencies.json
node scripts/fetch-osv-vulns.js dependencies.json

# License policy analysis (download OSPAC data first)
mkdir -p ospac-data && gh release download -R SemClone/ospac --pattern 'ospac-data-*.tar.gz' -O - | tar xz -C ospac-data
node scripts/analyze-licenses-ospac.js ospac-data/data dependencies.json

# AIBOM (requires Python)
pip install ai-finder && ai-finder scan . -f cyclonedx -o aibom.json
```

## Scripts

Data collection:
- `extract-dependencies.js` — enumerates the dependency tree (npm and PyPI packages) from an SBOM file argument, or `package.json` without one, and maps direct dependencies to their GitHub repositories via the npm registry
- `fetch-osv-vulns.js` — batch-queries OSV.dev for known vulnerabilities across the dependency set
- `analyze-licenses-ospac.js` — evaluates every package license against the project license using the OSPAC dataset (compatibility, copyleft exposure, obligations)
- `prepare-analysis-context.js` — aggregates raw repository data into per-repo metrics and health scores

AI analysis:
- `build-ai-prompt.js` — builds the summarized user prompt (metrics, vulnerabilities, license policy, AI components) sent to the model
- `parse-ai-response.js` — normalizes the model response into structured JSON, tolerating fenced or prose-wrapped output
- `enhanced-rule-analysis.js` — rule-based analysis used when GitHub Models is unavailable

Reporting:
- `generate-report.js` — composes the consolidated Markdown report from all analysis outputs
- `generate-risk-matrix.js` — scores each repository 0-10 across security, maintenance, sustainability, and licensing

## Output Artifacts

AI analysis run (`ai-dependency-analysis` artifact): raw repository data, the SBOM, OSV vulnerability results, the OSPAC license analysis, the CycloneDX AIBOM, the analysis context, the AI result JSON, the consolidated report, and the risk matrix.

Scorecard run (`security-report` artifact): the security report, npm audit JSON, and the Scorecard SARIF file. The SARIF results are also uploaded to the repository's Security tab.

### Stable Compliance URLs

Workflow artifacts expire after 90 days, so each analysis run also refreshes the assets of the rolling `compliance-latest` release, giving permanent, stable download URLs:

```
https://github.com/<owner>/<repo>/releases/download/compliance-latest/aibom.json
https://github.com/<owner>/<repo>/releases/download/compliance-latest/sbom.json
https://github.com/<owner>/<repo>/releases/download/compliance-latest/license-analysis.json
https://github.com/<owner>/<repo>/releases/download/compliance-latest/analysis-report.md
```

## Automated Remediation

`dependency-remediation.md` is an optional add-on: a [GitHub Agentic Workflow](https://github.github.com/gh-aw/) that runs after each AI dependency analysis completes. The analysis pipeline works fully without it — the agent closes the loop for teams with a suitable GitHub Copilot plan. It downloads the analysis artifacts (OSV vulnerabilities, the OSPAC license evaluation, the consolidated report), and if any direct dependency has known vulnerabilities with a fixed version available, it updates `package.json`, regenerates the lockfile, verifies `npm audit` improves, and opens a single pull request listing each bump and the advisory IDs it resolves. Its summary comment on the tracking issue also flags OSPAC license findings (incompatible, requires-review, or unknown licenses) for OSPO follow-up — it never modifies anything over a license finding. If there is nothing to remediate, it only comments.

Design constraints:

- Runs on the Copilot engine with `model: gpt-5-mini` in the frontmatter (matched against gh-aw's proxy model table). The lock file also carries a post-compile Copilot CLI version bump (1.0.65 to 1.0.71) that `gh aw compile` will revert — re-apply it or upgrade gh-aw when recompiling.
- Authenticates with the `COPILOT_GITHUB_TOKEN` repository secret — a fine-grained PAT with the Copilot Requests permission (see Setup). This carries the account's Copilot plan entitlement into the workflow.
- All writes go through gh-aw safe-outputs (one PR, at most one comment); the agent itself runs sandboxed with read-only permissions, an egress firewall, and hard caps (`max-turns: 15`, `max-ai-credits: 100`).
- The runnable workflow is the compiled `dependency-remediation.lock.yml`. To change the agent, edit the `.md` file and run `gh aw compile` (requires the [gh-aw extension](https://github.com/github/gh-aw)). `agentics-maintenance.yml` is gh-aw housekeeping that keeps compiled workflows current.

## Demo Application

`demo-app/` contains a small Python agent (Strands Agents + the OpenAI SDK) that exists as an analysis subject: its dependencies appear in the dependency graph and therefore in the SBOM, OSV, and license checks, and its AI SDK usage is what the ai-finder AIBOM step detects. It doubles as a usage example — it reads a generated analysis report and produces a three-bullet executive summary (requires `OPENAI_API_KEY` to actually run).

## Customization

- **Dependencies**: the packages declared in `package.json` and `demo-app/requirements.txt` are the analysis subjects. Point the workflows at your own project (or replace the dependency list) to analyze what you actually ship. None of the declared `package.json` runtime dependencies are imported by the scripts here — the scripts use only Node.js built-ins.
- **Prompts**: add a new file to `analysis-prompts/` and a matching option to the `analysis_type` workflow input.
- **Model**: pass any GitHub Models catalog identifier via the `model` input.
- **Schedules**: adjust the `cron` expressions in the workflow files.

## Security Considerations

- All workflows run under least-privilege permissions. Write scopes: `issues: write` (tracking issues), `security-events: write` (SARIF upload), and `contents: write` (refreshing the compliance release). The remediation agent job itself runs read-only; its PR and comment go through validated safe-outputs.
- All actions are pinned to full commit SHAs.
- The analysis workflows use no API keys or secrets; the remediation agent uses one repository secret (`COPILOT_GITHUB_TOKEN`, a fine-grained Copilot PAT). The external services contacted are the npm registry (package metadata), OSV.dev (vulnerability data), and PyPI (installing ai-finder); the OSPAC dataset is fetched from its GitHub release. AI inference stays within GitHub via GitHub Models.

## Limitations

- Deep repository metrics (contributors, activity, community health) cover direct dependencies with discoverable GitHub repositories. Transitive packages get license coverage regardless, and vulnerability coverage when the SBOM records exact versions (packages declared only as ranges, such as unlocked Python requirements, are skipped by the OSV check).
- GitHub Models free-tier rate limits apply to AI analysis; scheduled weekly runs fit comfortably within them.
- Health and risk scores are heuristics intended for triage, not verdicts.
- GitHub REST API rate limits may slow metric collection for very large direct-dependency sets.

## Data Sources and Tools

- [GitHub dependency graph](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-the-dependency-graph) — component inventory (SBOM)
- [OSV.dev](https://osv.dev) — known-vulnerability database
- [OSPAC](https://github.com/SemClone/ospac) — license obligations and compatibility data
- [SCANOSS ai-finder](https://pypi.org/project/ai-finder/) — AI component detection and AIBOM generation
- [OpenSSF Scorecard](https://github.com/ossf/scorecard) — repository security posture
- [GitHub Models](https://docs.github.com/en/github-models) and [actions/ai-inference](https://github.com/actions/ai-inference) — analysis inference
- [GitHub Agentic Workflows](https://github.github.com/gh-aw/) — the remediation agent framework
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli) — the agent engine

## License

Apache-2.0
