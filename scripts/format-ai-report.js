#!/usr/bin/env node

const fs = require('fs');

const aiResultFile = process.argv[2];
const contextFile = process.argv[3];

if (!aiResultFile || !contextFile) {
  console.error('# Error\nMissing required files');
  process.exit(1);
}

try {
  let aiResult;
  try {
    // Try to parse as JSON first
    aiResult = JSON.parse(fs.readFileSync(aiResultFile, 'utf8'));
  } catch (e) {
    // If not JSON, treat as plain text
    aiResult = { summary: fs.readFileSync(aiResultFile, 'utf8') };
  }

  const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));

  console.log(`# AI-Powered Dependency Analysis Report`);
  console.log(`\n**Analysis Date**: ${context.analysisDate}`);
  console.log(`**Repositories Analyzed**: ${context.repositoriesAnalyzed}`);
  console.log(`**Average Health Score**: ${context.summary.averageHealthScore}/100`);

  console.log(`\n## AI Analysis Summary`);

  // Handle structured AI response
  if (aiResult.summary) {
    console.log(`\n${aiResult.summary}`);

    if (aiResult.overallRisk) {
      console.log(`\n**Overall Risk Level**: ${aiResult.overallRisk}`);
    }

    if (aiResult.criticalFindings && aiResult.criticalFindings.length > 0) {
      console.log(`\n### Critical Findings`);
      aiResult.criticalFindings.forEach(finding => {
        console.log(`- ${finding}`);
      });
    }

    if (aiResult.securityIssues && aiResult.securityIssues.length > 0) {
      console.log(`\n### Security Issues`);
      aiResult.securityIssues.forEach(issue => {
        console.log(`- ${issue}`);
      });
    }

    if (aiResult.recommendations && aiResult.recommendations.length > 0) {
      console.log(`\n### AI Recommendations`);
      aiResult.recommendations.forEach(rec => {
        console.log(`- ${rec}`);
      });
    }
  } else {
    console.log(`\n${JSON.stringify(aiResult)}`);
  }
  
  console.log(`\n## Repository Health Metrics`);
  
  console.log(`\n### Top Performers`);
  console.log(`\n| Repository | Health Score | Key Strengths |`);
  console.log(`|------------|--------------|---------------|`);
  
  context.summary.topPerformers.forEach(repo => {
    const details = context.detailedAnalysis.find(r => r.repository === repo.name);
    const strengths = [];
    
    if (details) {
      if (details.metrics.contributorCount > 20) strengths.push('Strong community');
      if (details.metrics.commitsLastMonth > 50) strengths.push('Very active');
      if (details.metrics.stars > 1000) strengths.push('Popular');
      if (details.metrics.communityHealth?.healthPercentage > 80) strengths.push('Good practices');
    }
    
    console.log(`| ${repo.name} | ${repo.score}/100 | ${strengths.join(', ') || 'Well-maintained'} |`);
  });
  
  console.log(`\n### Repositories Needing Attention`);
  console.log(`\n| Repository | Health Score | Issues Identified |`);
  console.log(`|------------|--------------|-------------------|`);
  
  context.summary.needsAttention.forEach(repo => {
    console.log(`| ${repo.name} | ${repo.score}/100 | ${repo.issues.join(', ')} |`);
  });
  
  console.log(`\n## Detailed Metrics Overview`);
  
  // Activity Analysis
  console.log(`\n### Development Activity`);
  const activeRepos = context.detailedAnalysis.filter(r => r.metrics.commitsLastMonth > 0);
  const staleRepos = context.detailedAnalysis.filter(r => 
    r.metrics.commitsLastMonth === 0 && !r.metrics.archived
  );
  
  console.log(`- **Active repositories**: ${activeRepos.length}/${context.repositoriesAnalyzed}`);
  console.log(`- **Stale repositories**: ${staleRepos.length}`);
  console.log(`- **Average commits/month**: ${
    Math.round(activeRepos.reduce((sum, r) => sum + r.metrics.commitsLastMonth, 0) / activeRepos.length)
  }`);
  
  // Community Health
  console.log(`\n### Community Health`);
  const withDocs = context.detailedAnalysis.filter(r => 
    r.metrics.communityHealth?.hasReadme && 
    r.metrics.communityHealth?.hasLicense
  );
  const highBusFactor = context.detailedAnalysis.filter(r => 
    r.metrics.contributionConcentration > 0.7
  );
  
  console.log(`- **Repos with documentation**: ${withDocs.length}/${context.repositoriesAnalyzed}`);
  console.log(`- **High bus factor risk**: ${highBusFactor.length} repositories`);
  console.log(`- **Average contributors**: ${
    Math.round(context.detailedAnalysis.reduce((sum, r) => 
      sum + (r.metrics.contributorCount || 0), 0) / context.repositoriesAnalyzed
    )
  }`);
  
  // Maintenance Patterns
  console.log(`\n### Maintenance Patterns`);
  const regularReleases = context.detailedAnalysis.filter(r => 
    r.metrics.avgDaysBetweenReleases && r.metrics.avgDaysBetweenReleases < 60
  );
  const staleReleases = context.detailedAnalysis.filter(r => 
    r.metrics.latestRelease?.daysSince > 180
  );
  
  console.log(`- **Regular release cycle**: ${regularReleases.length} repositories`);
  console.log(`- **Stale releases (>6 months)**: ${staleReleases.length} repositories`);
  console.log(`- **Average issue resolution time**: ${
    context.detailedAnalysis
      .filter(r => r.metrics.avgDaysToCloseIssue)
      .reduce((sum, r) => sum + parseFloat(r.metrics.avgDaysToCloseIssue), 0) / 
    context.detailedAnalysis.filter(r => r.metrics.avgDaysToCloseIssue).length || 0
  } days`);
  
  console.log(`\n## Risk Assessment Matrix`);
  
  const risks = {
    critical: [],
    high: [],
    medium: [],
    low: []
  };
  
  context.detailedAnalysis.forEach(repo => {
    let riskLevel = 'low';
    let reasons = [];
    
    if (repo.metrics.archived) {
      riskLevel = 'critical';
      reasons.push('archived');
    } else if (repo.metrics.disabled) {
      riskLevel = 'critical';
      reasons.push('disabled');
    } else if (repo.healthScore < 30) {
      riskLevel = 'critical';
      reasons.push('very low health');
    } else if (repo.metrics.commitsLastMonth === 0 && repo.metrics.contributorCount < 2) {
      riskLevel = 'high';
      reasons.push('inactive + low contributors');
    } else if (repo.metrics.contributionConcentration > 0.9) {
      riskLevel = 'high';
      reasons.push('single maintainer');
    } else if (repo.healthScore < 50) {
      riskLevel = 'medium';
      reasons.push('low health score');
    }
    
    if (reasons.length > 0) {
      risks[riskLevel].push({
        name: repo.repository,
        reasons: reasons
      });
    }
  });
  
  ['critical', 'high', 'medium'].forEach(level => {
    if (risks[level].length > 0) {
      console.log(`\n### ${level.charAt(0).toUpperCase() + level.slice(1)} Risk`);
      risks[level].forEach(repo => {
        console.log(`- **${repo.name}**: ${repo.reasons.join(', ')}`);
      });
    }
  });
  
  console.log(`\n---`);
  console.log(`\n*Generated by AI-powered dependency analysis workflow*`);
  
} catch (e) {
  console.error(`# Error\nFailed to format report: ${e.message}`);
  process.exit(1);
}