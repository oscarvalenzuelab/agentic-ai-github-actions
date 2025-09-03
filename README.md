# Dependency Scorecard Analyzer

A GitHub Actions-powered tool for comprehensive dependency analysis using OpenSSF Scorecard and AI models to evaluate the health, security, and sustainability of npm dependencies.

## Features

### 🔍 OpenSSF Scorecard Analysis
- Automated security scoring of all dependencies
- Comprehensive vulnerability assessment  
- Best practices evaluation
- SARIF report generation for GitHub Security tab integration

### 🤖 AI-Powered Analysis
- Multiple analysis modes:
  - **Comprehensive**: Full dependency health assessment
  - **Security-focused**: Deep security vulnerability analysis
  - **Maintainer burnout**: Sustainability and bus factor evaluation
  - **Community health**: Engagement and governance analysis
  - **License compliance**: Legal risk assessment

### 📊 Automated Reporting
- Consolidated scorecard reports
- Risk matrix generation
- Actionable insights and recommendations
- GitHub Issues integration for tracking
- Markdown reports for easy reading

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure GitHub Secrets (Optional)
For enhanced AI analysis, add these secrets to your repository:
- `OPENAI_API_KEY`: OpenAI API key for GPT-4 analysis (optional, falls back to GitHub Models)

### 3. Enable GitHub Actions
The workflows are configured to run:
- **Scorecard Analysis**: Weekly on Mondays at 2 AM UTC
- **AI Analysis**: Weekly on Wednesdays at 4 AM UTC
- **Manual Trigger**: Both workflows support `workflow_dispatch` for on-demand runs

## Usage

### Running Workflows Manually

1. Go to Actions tab in your GitHub repository
2. Select either "OpenSSF Scorecard Analysis" or "AI-Powered Dependency Analysis"
3. Click "Run workflow"
4. For AI analysis, select the analysis type (comprehensive, security-focused, etc.)

### Local Scripts

Extract dependency information:
```bash
npm run extract-deps
```

Analyze repositories (requires repo-data directory):
```bash
npm run analyze
```

## Workflows

### OpenSSF Scorecard Analysis (`scorecard-analysis.yml`)
- Extracts all npm dependencies
- Identifies GitHub repositories
- Runs OpenSSF Scorecard on each repository
- Generates consolidated security reports
- Creates GitHub issues with findings

### AI-Powered Dependency Analysis (`ai-dependency-analysis.yml`)
- Collects comprehensive GitHub metrics:
  - Repository statistics
  - Contributor patterns
  - Issue/PR activity
  - Community health indicators
  - Release patterns
- Runs AI analysis using selected prompts
- Generates risk matrices
- Provides actionable insights
- Creates or updates tracking issues

## Scripts

### Data Collection
- `extract-dependencies.js`: Extracts npm dependencies and finds GitHub repos
- `prepare-analysis-context.js`: Processes repository data for AI analysis

### Report Generation
- `consolidate-scorecard-reports.js`: Merges individual scorecard results
- `generate-markdown-report.js`: Creates readable scorecard reports
- `format-ai-report.js`: Formats AI analysis results
- `generate-risk-matrix.js`: Creates risk assessment matrices
- `generate-insights.js`: Produces actionable recommendations

## Analysis Prompts

The `analysis-prompts/` directory contains specialized prompts for different analysis types:

- `comprehensive.md`: Full dependency health assessment
- `security-focused.md`: Deep security analysis
- `maintainer-burnout.md`: Sustainability evaluation
- `community-health.md`: Community engagement analysis
- `license-compliance.md`: Legal risk assessment

## Output Artifacts

Both workflows generate artifacts containing:
- Raw analysis data (JSON)
- Formatted reports (Markdown)
- Risk matrices
- Actionable insights

Access artifacts through:
1. Go to Actions tab
2. Click on a completed workflow run
3. Scroll to Artifacts section
4. Download desired reports

## Customization

### Adding Dependencies
Simply update `package.json` with your actual project dependencies. The workflows will automatically analyze all dependencies on the next run.

### Custom Analysis Prompts
Create new prompts in `analysis-prompts/` directory following the existing format. Update the workflow to include your custom analysis type.

### Scheduling
Modify the `cron` expressions in the workflow files to adjust the analysis schedule.

## Security Considerations

- The workflows use `GITHUB_TOKEN` with minimal required permissions
- Sensitive data is not exposed in logs or artifacts
- All API calls use secure authentication
- Consider private repositories for sensitive dependency analysis

## Limitations

- Only analyzes packages with GitHub repositories
- Rate limits may affect large dependency sets
- AI analysis quality depends on available data
- Some metrics require repository admin access

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT