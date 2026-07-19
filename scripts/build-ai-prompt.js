#!/usr/bin/env node

// Builds the user prompt sent to the model.
// Emits a compact, summarized view of the analysis context so the request
// stays well within the model's context window regardless of dependency count.

const fs = require('fs');

const contextFile = process.argv[2] || 'analysis-context.json';
const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));

// Optional inputs; each is skipped silently if missing or malformed:
//   argv[3] OSV.dev vulnerability summary   (fetch-osv-vulns.js)
//   argv[4] OSPAC license policy analysis   (analyze-licenses-ospac.js)
//   argv[5] AIBOM in CycloneDX format       (SCANOSS ai-finder)
function readOptionalJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}
const osv = readOptionalJson(process.argv[3]);
const licensePolicy = readOptionalJson(process.argv[4]);
const aibom = readOptionalJson(process.argv[5]);

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

// License policy evaluation against the project license (OSPAC data)
if (licensePolicy && licensePolicy.packagesEvaluated > 0) {
  summarizedContext.licensePolicy = {
    projectLicense: licensePolicy.projectLicense,
    packagesEvaluated: licensePolicy.packagesEvaluated,
    distribution: licensePolicy.distribution,
    copyleft: licensePolicy.copyleft,
    incompatibleWithProjectLicense: licensePolicy.incompatible,
    requiresLegalReview: licensePolicy.requiresReview,
    packagesWithUnknownLicense: licensePolicy.unknownLicenses.slice(0, 10)
  };
}

// AI components detected in the codebase (SCANOSS ai-finder AIBOM)
if (aibom) {
  summarizedContext.aiComponents = {
    detected: (aibom.components || []).length,
    components: (aibom.components || []).slice(0, 15).map(c => ({
      name: c.name,
      type: c.type,
      version: c.version
    }))
  };
}

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
