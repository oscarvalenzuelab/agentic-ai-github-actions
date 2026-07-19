#!/usr/bin/env node

// Builds the user prompt sent to the model.
// Emits a compact, summarized view of the analysis context so the request
// stays well within the model's context window regardless of dependency count.

const fs = require('fs');

const contextFile = process.argv[2] || 'analysis-context.json';
const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));

// Optional: OSV.dev vulnerability summary (from fetch-osv-vulns.js)
const osvFile = process.argv[3];
let osv = null;
if (osvFile && fs.existsSync(osvFile)) {
  try {
    osv = JSON.parse(fs.readFileSync(osvFile, 'utf8'));
  } catch (e) {
    /* proceed without vulnerability data */
  }
}

const summarizedContext = {
  analysisDate: context.analysisDate,
  repositoriesAnalyzed: context.repositoriesAnalyzed,
  summary: context.summary,
  // Only include the most concerning repositories to keep the payload small.
  topConcerns: context.detailedAnalysis
    .filter(r => r.healthScore < 50)
    .slice(0, 10)
    .map(r => ({
      name: r.repository,
      score: r.healthScore,
      issue: r.metrics.archived ? 'archived' :
             r.metrics.disabled ? 'disabled' :
             r.metrics.commitsLastMonth === 0 ? 'no recent activity' :
             r.metrics.contributorCount < 2 ? 'low contributors' :
             'low health score',
      license: r.metrics.license,
      openIssues: r.metrics.openIssues,
      contributors: r.metrics.contributorCount,
      contributionConcentration: r.metrics.contributionConcentration,
      lastReleaseDaysAgo: r.metrics.latestRelease?.daysSince
    })),
  securityMetrics: {
    reposWithoutSecurityPolicy: context.detailedAnalysis
      .filter(r => !r.metrics.communityHealth?.hasSecurityPolicy).length,
    reposWithoutLicense: context.detailedAnalysis
      .filter(r => !r.metrics.license || r.metrics.license === 'None').length,
    highBusFactorRepos: context.detailedAnalysis
      .filter(r => r.metrics.contributionConcentration > 0.8).length
  }
};

// Known vulnerabilities across the full dependency tree (OSV.dev)
if (osv) {
  summarizedContext.knownVulnerabilities = {
    packagesQueried: osv.packagesQueried,
    packagesWithVulns: osv.packagesWithVulns,
    totalVulns: osv.totalVulns,
    // Most-affected packages, capped to keep the prompt small
    topVulnerable: (osv.vulnerablePackages || []).slice(0, 10).map(p => ({
      package: `${p.name}@${p.version}`,
      vulnCount: p.vulnIds.length,
      vulnIds: p.vulnIds.slice(0, 5)
    }))
  };
}

process.stdout.write(
  `Analyze the following npm dependency health metrics and produce the required JSON assessment.\n\n` +
  JSON.stringify(summarizedContext, null, 2)
);
