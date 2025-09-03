#!/usr/bin/env node

// Enhanced rule-based analysis that provides more sophisticated insights without AI
const fs = require('fs');

const contextFile = process.argv[2] || 'analysis-context.json';
const analysisType = process.argv[3] || 'comprehensive';

const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));

function analyzeLicenseCompliance(repos) {
  const findings = [];
  const recommendations = [];
  
  const licenseCounts = {};
  const riskyLicenses = [];
  const noLicense = [];
  
  repos.forEach(repo => {
    const license = repo.metrics.license;
    if (license === 'None' || !license) {
      noLicense.push(repo.repository);
      findings.push(`⚠️ ${repo.repository} has no license specified`);
    } else {
      licenseCounts[license] = (licenseCounts[license] || 0) + 1;
      
      // Check for copyleft licenses
      if (['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'].includes(license)) {
        riskyLicenses.push({ repo: repo.repository, license });
        findings.push(`🔴 ${repo.repository} uses strong copyleft license (${license})`);
      }
    }
  });
  
  if (noLicense.length > 0) {
    recommendations.push(`CRITICAL: ${noLicense.length} dependencies lack licenses - legal review required`);
  }
  if (riskyLicenses.length > 0) {
    recommendations.push(`Review ${riskyLicenses.length} dependencies with copyleft licenses for compatibility`);
  }
  
  return { findings, recommendations, summary: { licenseCounts, riskyLicenses, noLicense } };
}

function analyzeSecurityFocus(repos) {
  const findings = [];
  const recommendations = [];
  
  repos.forEach(repo => {
    const securityScore = 0;
    
    // Check for security indicators
    if (!repo.metrics.communityHealth?.hasSecurityPolicy) {
      findings.push(`🔒 ${repo.repository} lacks security policy`);
    }
    
    if (repo.metrics.openIssues > 100) {
      findings.push(`⚠️ ${repo.repository} has ${repo.metrics.openIssues} open issues (potential unaddressed vulnerabilities)`);
    }
    
    if (repo.metrics.avgDaysToCloseIssue > 90) {
      findings.push(`🐌 ${repo.repository} slow to close issues (avg ${repo.metrics.avgDaysToCloseIssue} days)`);
    }
    
    if (repo.metrics.latestRelease?.daysSince > 365) {
      findings.push(`📦 ${repo.repository} hasn't released in ${repo.metrics.latestRelease.daysSince} days`);
    }
  });
  
  recommendations.push('Enable Dependabot for all repositories');
  recommendations.push('Implement security scanning in CI/CD');
  recommendations.push('Regular dependency updates schedule');
  
  return { findings, recommendations };
}

function analyzeMaintainerBurnout(repos) {
  const findings = [];
  const recommendations = [];
  
  repos.forEach(repo => {
    // Bus factor analysis
    if (repo.metrics.contributorCount === 1) {
      findings.push(`👤 ${repo.repository} has single maintainer (critical bus factor)`);
      recommendations.push(`Find alternatives for ${repo.repository} or offer maintainer support`);
    }
    
    // Activity decline detection
    if (repo.metrics.commitsLastMonth === 0 && repo.metrics.commitsLastQuarter > 0) {
      findings.push(`📉 ${repo.repository} shows declining activity`);
    }
    
    // Contribution concentration
    if (repo.metrics.contributionConcentration > 0.8) {
      findings.push(`⚠️ ${repo.repository} has ${(repo.metrics.contributionConcentration * 100).toFixed(0)}% contribution concentration`);
    }
  });
  
  return { findings, recommendations };
}

function analyzeCommunityHealth(repos) {
  const findings = [];
  const recommendations = [];
  
  repos.forEach(repo => {
    const health = repo.metrics.communityHealth;
    if (health) {
      const score = health.healthPercentage || 0;
      if (score < 50) {
        findings.push(`📊 ${repo.repository} has low community health score (${score}%)`);
        
        const missing = [];
        if (!health.hasReadme) missing.push('README');
        if (!health.hasContributing) missing.push('CONTRIBUTING');
        if (!health.hasCodeOfConduct) missing.push('CODE_OF_CONDUCT');
        if (!health.hasLicense) missing.push('LICENSE');
        
        if (missing.length > 0) {
          findings.push(`  Missing: ${missing.join(', ')}`);
        }
      }
    }
    
    if (repo.metrics.openPRs > 10) {
      findings.push(`🔄 ${repo.repository} has ${repo.metrics.openPRs} unmerged PRs`);
    }
  });
  
  recommendations.push('Engage with communities of critical dependencies');
  recommendations.push('Consider sponsoring well-maintained projects');
  
  return { findings, recommendations };
}

// Main analysis
let analysis;

switch (analysisType) {
  case 'license-compliance':
    analysis = analyzeLicenseCompliance(context.detailedAnalysis);
    break;
  case 'security-focused':
    analysis = analyzeSecurityFocus(context.detailedAnalysis);
    break;
  case 'maintainer-burnout':
    analysis = analyzeMaintainerBurnout(context.detailedAnalysis);
    break;
  case 'community-health':
    analysis = analyzeCommunityHealth(context.detailedAnalysis);
    break;
  default:
    // Comprehensive - run all analyses
    const license = analyzeLicenseCompliance(context.detailedAnalysis);
    const security = analyzeSecurityFocus(context.detailedAnalysis);
    const burnout = analyzeMaintainerBurnout(context.detailedAnalysis);
    const community = analyzeCommunityHealth(context.detailedAnalysis);
    
    analysis = {
      findings: [...license.findings, ...security.findings, ...burnout.findings, ...community.findings],
      recommendations: [...new Set([...license.recommendations, ...security.recommendations, ...burnout.recommendations, ...community.recommendations])]
    };
    break;
}

// Output formatted report
console.log(`## ${analysisType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Analysis\n`);
console.log(`### Key Findings\n`);
analysis.findings.slice(0, 20).forEach(f => console.log(`- ${f}`));

if (analysis.findings.length > 20) {
  console.log(`\n... and ${analysis.findings.length - 20} more findings`);
}

console.log(`\n### Recommendations\n`);
analysis.recommendations.forEach(r => console.log(`- ${r}`));

console.log(`\n### Summary Statistics\n`);
console.log(`- Total repositories analyzed: ${context.repositoriesAnalyzed}`);
console.log(`- Average health score: ${context.summary.averageHealthScore}/100`);
console.log(`- At-risk repositories: ${context.summary.atRiskRepositories}`);

if (analysis.summary) {
  console.log(`\n### Additional Insights\n`);
  if (analysis.summary.licenseCounts) {
    console.log('License Distribution:');
    Object.entries(analysis.summary.licenseCounts).forEach(([license, count]) => {
      console.log(`  - ${license}: ${count} repositories`);
    });
  }
}