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
      findings.push(`${repo.repository} has no license specified`);
    } else {
      licenseCounts[license] = (licenseCounts[license] || 0) + 1;
      
      // Check for copyleft licenses
      if (['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'].includes(license)) {
        riskyLicenses.push({ repo: repo.repository, license });
        findings.push(`${repo.repository} uses strong copyleft license (${license})`);
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
      findings.push(`${repo.repository} lacks security policy`);
    }
    
    if (repo.metrics.openIssues > 100) {
      findings.push(`${repo.repository} has ${repo.metrics.openIssues} open issues (potential unaddressed vulnerabilities)`);
    }
    
    if (repo.metrics.avgDaysToCloseIssue > 90) {
      findings.push(`${repo.repository} slow to close issues (avg ${repo.metrics.avgDaysToCloseIssue} days)`);
    }
    
    if (repo.metrics.latestRelease?.daysSince > 365) {
      findings.push(`${repo.repository} hasn't released in ${repo.metrics.latestRelease.daysSince} days`);
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
      findings.push(`${repo.repository} has single maintainer (critical bus factor)`);
      recommendations.push(`Find alternatives for ${repo.repository} or offer maintainer support`);
    }
    
    // Activity decline detection
    if (repo.metrics.commitsLastMonth === 0 && repo.metrics.commitsLastQuarter > 0) {
      findings.push(`${repo.repository} shows declining activity`);
    }
    
    // Contribution concentration
    if (repo.metrics.contributionConcentration > 0.8) {
      findings.push(`${repo.repository} has ${(repo.metrics.contributionConcentration * 100).toFixed(0)}% contribution concentration`);
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
        findings.push(`${repo.repository} has low community health score (${score}%)`);
        
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
      findings.push(`${repo.repository} has ${repo.metrics.openPRs} unmerged PRs`);
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

// Emit the same JSON contract the model produces, so downstream report
// generation is identical whether or not GitHub Models was available.
const atRisk = context.summary.atRiskRepositories;
const avgScore = context.summary.averageHealthScore;

const overallRisk =
  atRisk > context.repositoriesAnalyzed / 2 ? 'High' :
  atRisk > 0 || avgScore < 50 ? 'Medium' :
  'Low';

const modeLabel = analysisType.replace(/-/g, ' ');
const result = {
  summary: `Rule-based ${modeLabel} analysis (GitHub Models unavailable) of ` +
    `${context.repositoriesAnalyzed} direct-dependency repositories. ` +
    `Average health score ${avgScore}/100; ${atRisk} at risk. ` +
    `${analysis.findings.length} findings.`,
  overallRisk,
  criticalFindings: analysis.findings.slice(0, 5),
  securityIssues: analysis.findings.filter(f =>
    /security|vulnerab|open issues/i.test(f)).slice(0, 5),
  sustainabilityIssues: analysis.findings.filter(f =>
    /maintainer|concentration|activity|archived/i.test(f)).slice(0, 5),
  recommendations: analysis.recommendations.slice(0, 5),
  immediateActions: analysis.findings
    .filter(f => /archived|no license|single maintainer/i.test(f))
    .slice(0, 3)
};

console.log(JSON.stringify(result, null, 2));