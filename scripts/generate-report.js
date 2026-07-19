#!/usr/bin/env node

// Composes the single analysis report used as the tracking-issue body and
// the main artifact. Sections render only when they have data; nothing is
// boilerplate. Plain Markdown, no emoji.
//
// Usage: generate-report.js <analysis-context.json> [ai-analysis-result.json]
//                           [risk-matrix.json] [osv-vulns.json]
//                           [license-analysis.json] [aibom.json]

const fs = require('fs');

function readJson(file, required) {
  if (!file || !fs.existsSync(file)) {
    if (required) {
      console.error(`Missing required file: ${file}`);
      process.exit(1);
    }
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

const context = readJson(process.argv[2] || 'analysis-context.json', true);
const ai = readJson(process.argv[3] || 'ai-analysis-result.json');
const riskMatrix = readJson(process.argv[4] || 'risk-matrix.json');
const osv = readJson(process.argv[5] || 'osv-vulns.json');
const licenses = readJson(process.argv[6] || 'license-analysis.json');
const aibom = readJson(process.argv[7] || 'aibom.json');

const lines = [];
const date = (context.analysisDate || new Date().toISOString()).split('T')[0];

lines.push(`# Dependency Analysis - ${date}`);
lines.push('');

// --- Assessment ---
if (ai?.summary) {
  lines.push(ai.summary.trim());
  lines.push('');
  if (ai.overallRisk) {
    lines.push(`**Overall risk:** ${ai.overallRisk}`);
    lines.push('');
  }
}

const section = (title, items) => {
  if (Array.isArray(items) && items.length > 0) {
    lines.push(`## ${title}`);
    lines.push('');
    items.forEach(i => lines.push(`- ${i}`));
    lines.push('');
  }
};

section('Critical Findings', ai?.criticalFindings);
section('Immediate Actions', ai?.immediateActions);

// --- Known vulnerabilities (OSV) ---
if (osv && osv.packagesQueried > 0) {
  lines.push('## Known Vulnerabilities');
  lines.push('');
  if (osv.totalVulns === 0) {
    lines.push(`None. ${osv.packagesQueried} package versions checked against OSV.dev.`);
  } else {
    lines.push(`${osv.totalVulns} known ${osv.totalVulns === 1 ? 'vulnerability' : 'vulnerabilities'} across ${osv.packagesWithVulns} of ${osv.packagesQueried} package versions (OSV.dev).`);
    lines.push('');
    lines.push('| Package | Advisories |');
    lines.push('|---------|------------|');
    osv.vulnerablePackages.slice(0, 10).forEach(p => {
      const shown = p.vulnIds.slice(0, 3).join(', ');
      const more = p.vulnIds.length > 3 ? ` and ${p.vulnIds.length - 3} more` : '';
      lines.push(`| ${p.name}@${p.version} | ${shown}${more} |`);
    });
    if (osv.vulnerablePackages.length > 10) {
      lines.push('');
      lines.push(`${osv.vulnerablePackages.length - 10} more affected packages in the workflow artifacts.`);
    }
  }
  lines.push('');
}

// --- License policy (OSPAC) ---
if (licenses && licenses.packagesEvaluated > 0) {
  lines.push('## License Policy');
  lines.push('');
  const dist = Object.entries(licenses.distribution)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, d]) => `${id} (${d.count})`)
    .join(', ');
  lines.push(`${licenses.packagesEvaluated} packages evaluated against the project license (${licenses.projectLicense}): ${dist}.`);
  lines.push('');
  const flag = (label, entries) => {
    if (entries?.length) {
      entries.forEach(e => {
        lines.push(`- ${label}: ${e.license} — ${e.packages.join(', ')}`);
      });
    }
  };
  if (licenses.incompatible?.length || licenses.requiresReview?.length || licenses.unknownLicenses?.length) {
    flag('Incompatible', licenses.incompatible);
    flag('Requires review', licenses.requiresReview);
    if (licenses.unknownLicenses?.length) {
      lines.push(`- Unknown license: ${licenses.unknownLicenses.map(u => u.name).join(', ')}`);
    }
    lines.push('');
  } else {
    lines.push('No conflicts, copyleft exposure, or unknown licenses.');
    lines.push('');
  }
}

// --- AI components (AIBOM) ---
if (aibom) {
  const components = aibom.components || [];
  lines.push('## AI Components');
  lines.push('');
  if (components.length === 0) {
    lines.push('None detected in the codebase. AIBOM (CycloneDX) available in the workflow artifacts.');
  } else {
    components.slice(0, 15).forEach(c => {
      lines.push(`- ${c.name}${c.version ? `@${c.version}` : ''} (${c.type || 'component'})`);
    });
  }
  lines.push('');
}

// --- Repository health ---
const risksByRepo = {};
(riskMatrix?.repositories || []).forEach(r => {
  risksByRepo[r.repository] = r;
});

if (context.detailedAnalysis?.length) {
  lines.push('## Repository Health');
  lines.push('');
  lines.push(`Average health score: ${context.summary.averageHealthScore}/100 across ${context.repositoriesAnalyzed} direct-dependency repositories.`);
  lines.push('');
  lines.push('| Repository | Health | Risk | Notes |');
  lines.push('|------------|--------|------|-------|');
  context.detailedAnalysis.forEach(repo => {
    const risk = risksByRepo[repo.repository];
    const riskLabel = !risk ? '-' :
      risk.overallRisk >= 7 ? `High (${risk.overallRisk}/10)` :
      risk.overallRisk >= 4 ? `Medium (${risk.overallRisk}/10)` :
      `Low (${risk.overallRisk}/10)`;
    const notes = [];
    if (repo.metrics.archived) notes.push('archived');
    if (repo.metrics.commitsLastMonth === 0 && !repo.metrics.archived) notes.push('no activity this month');
    if (repo.metrics.contributionConcentration > 0.8) notes.push('high contribution concentration');
    if (repo.metrics.latestRelease?.daysSince > 180) notes.push(`last release ${repo.metrics.latestRelease.daysSince}d ago`);
    lines.push(`| ${repo.repository} | ${repo.healthScore}/100 | ${riskLabel} | ${notes.join('; ') || '-'} |`);
  });
  lines.push('');
}

// --- Recommendations (from the model or the rule-based fallback) ---
section('Recommendations', ai?.recommendations);

// --- Footer ---
lines.push('---');
lines.push(`Data sources: GitHub dependency graph, OSV.dev, OSPAC, ai-finder, GitHub REST API. Full data in the \`ai-dependency-analysis\` workflow artifact.`);

console.log(lines.join('\n'));
