#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoDataDir = process.argv[2] || 'repo-data';

function generateRiskMatrix() {
  const files = fs.readdirSync(repoDataDir);
  const repositories = {};
  
  // Parse repository data
  files.forEach(file => {
    const match = file.match(/^(.+?)_(overview|contributors|commits|issues|releases)\.json$/);
    if (match) {
      const repoName = match[1];
      const dataType = match[2];
      
      if (!repositories[repoName]) {
        repositories[repoName] = {};
      }
      
      try {
        const content = fs.readFileSync(path.join(repoDataDir, file), 'utf8');
        repositories[repoName][dataType] = JSON.parse(content);
      } catch (e) {
        repositories[repoName][dataType] = null;
      }
    }
  });
  
  const riskMatrix = {
    timestamp: new Date().toISOString(),
    repositories: [],
    summary: '',
    riskCategories: {
      security: [],
      maintenance: [],
      sustainability: [],
      licensing: []
    }
  };
  
  // Assess each repository
  Object.entries(repositories).forEach(([repoName, data]) => {
    const risks = assessRepositoryRisks(repoName, data);
    riskMatrix.repositories.push(risks);
    
    // Categorize risks
    if (risks.overallRisk >= 7) {
      if (risks.risks.security.level >= 7) {
        riskMatrix.riskCategories.security.push({
          repo: risks.repository,
          score: risks.risks.security.level,
          factors: risks.risks.security.factors
        });
      }
      if (risks.risks.maintenance.level >= 7) {
        riskMatrix.riskCategories.maintenance.push({
          repo: risks.repository,
          score: risks.risks.maintenance.level,
          factors: risks.risks.maintenance.factors
        });
      }
      if (risks.risks.sustainability.level >= 7) {
        riskMatrix.riskCategories.sustainability.push({
          repo: risks.repository,
          score: risks.risks.sustainability.level,
          factors: risks.risks.sustainability.factors
        });
      }
    }
  });
  
  // Sort by overall risk
  riskMatrix.repositories.sort((a, b) => b.overallRisk - a.overallRisk);
  
  // Generate summary
  const highRisk = riskMatrix.repositories.filter(r => r.overallRisk >= 7).length;
  const mediumRisk = riskMatrix.repositories.filter(r => r.overallRisk >= 4 && r.overallRisk < 7).length;
  const lowRisk = riskMatrix.repositories.filter(r => r.overallRisk < 4).length;
  
  riskMatrix.summary = `Risk Distribution: ${highRisk} high-risk, ${mediumRisk} medium-risk, ${lowRisk} low-risk repositories. ` +
    `Top concerns: ${riskMatrix.riskCategories.security.length} security, ` +
    `${riskMatrix.riskCategories.maintenance.length} maintenance, ` +
    `${riskMatrix.riskCategories.sustainability.length} sustainability risks.`;
  
  console.log(JSON.stringify(riskMatrix, null, 2));
}

function assessRepositoryRisks(repoName, data) {
  const assessment = {
    repository: repoName.replace(/_/g, '/'),
    overallRisk: 0,
    risks: {
      security: { level: 0, factors: [] },
      maintenance: { level: 0, factors: [] },
      sustainability: { level: 0, factors: [] },
      licensing: { level: 0, factors: [] }
    }
  };
  
  // Security Risk Assessment
  if (data.overview) {
    // Check for security policy
    if (!data.overview.security_and_analysis?.advanced_security?.status) {
      assessment.risks.security.level += 3;
      assessment.risks.security.factors.push('No advanced security enabled');
    }
    
    // Check for vulnerability alerts
    if (data.overview.open_issues_count > 50) {
      assessment.risks.security.level += 2;
      assessment.risks.security.factors.push('High number of open issues');
    }
  }
  
  // Check commit signing
  if (data.commits && Array.isArray(data.commits)) {
    const unsignedCommits = data.commits.filter(c => !c.commit?.verification?.verified).length;
    if (unsignedCommits > data.commits.length * 0.8) {
      assessment.risks.security.level += 2;
      assessment.risks.security.factors.push('Most commits unsigned');
    }
  }
  
  // Maintenance Risk Assessment
  if (data.overview) {
    const lastPush = new Date(data.overview.pushed_at);
    const daysSinceLastPush = (new Date() - lastPush) / (1000 * 60 * 60 * 24);
    
    if (daysSinceLastPush > 365) {
      assessment.risks.maintenance.level += 5;
      assessment.risks.maintenance.factors.push('No activity for over a year');
    } else if (daysSinceLastPush > 180) {
      assessment.risks.maintenance.level += 3;
      assessment.risks.maintenance.factors.push('No recent activity (>6 months)');
    } else if (daysSinceLastPush > 90) {
      assessment.risks.maintenance.level += 1;
      assessment.risks.maintenance.factors.push('Low activity (>3 months)');
    }
    
    if (data.overview.archived) {
      assessment.risks.maintenance.level += 10;
      assessment.risks.maintenance.factors.push('Repository archived');
    }
    
    if (data.overview.disabled) {
      assessment.risks.maintenance.level += 10;
      assessment.risks.maintenance.factors.push('Repository disabled');
    }
  }
  
  // Check release patterns
  if (data.releases && Array.isArray(data.releases)) {
    if (data.releases.length === 0) {
      assessment.risks.maintenance.level += 2;
      assessment.risks.maintenance.factors.push('No releases');
    } else {
      const latestRelease = new Date(data.releases[0].published_at);
      const daysSinceRelease = (new Date() - latestRelease) / (1000 * 60 * 60 * 24);
      
      if (daysSinceRelease > 365) {
        assessment.risks.maintenance.level += 3;
        assessment.risks.maintenance.factors.push('Stale releases (>1 year)');
      }
    }
  }
  
  // Sustainability Risk Assessment
  if (data.contributors && Array.isArray(data.contributors)) {
    const activeContributors = data.contributors.filter(c => {
      const recentWeeks = c.weeks?.slice(-12) || [];
      return recentWeeks.some(w => w.c > 0);
    }).length;
    
    if (activeContributors === 0) {
      assessment.risks.sustainability.level += 8;
      assessment.risks.sustainability.factors.push('No active contributors');
    } else if (activeContributors === 1) {
      assessment.risks.sustainability.level += 6;
      assessment.risks.sustainability.factors.push('Single maintainer');
    } else if (activeContributors < 3) {
      assessment.risks.sustainability.level += 3;
      assessment.risks.sustainability.factors.push('Few active contributors');
    }
    
    // Check bus factor
    if (data.contributors.length > 0) {
      const totalCommits = data.contributors.reduce((sum, c) => sum + (c.total || 0), 0);
      const topContributorCommits = Math.max(...data.contributors.map(c => c.total || 0));
      
      if (topContributorCommits > totalCommits * 0.8) {
        assessment.risks.sustainability.level += 4;
        assessment.risks.sustainability.factors.push('High bus factor');
      }
    }
  }
  
  // Check funding/sponsorship
  if (data.overview) {
    if (!data.overview.has_sponsors) {
      assessment.risks.sustainability.level += 1;
      assessment.risks.sustainability.factors.push('No sponsorship program');
    }
  }
  
  // Licensing Risk Assessment
  if (data.overview) {
    if (!data.overview.license) {
      assessment.risks.licensing.level += 8;
      assessment.risks.licensing.factors.push('No license specified');
    } else {
      const license = data.overview.license.spdx_id;
      
      // Check for copyleft licenses that might have compatibility issues
      if (['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'].includes(license)) {
        assessment.risks.licensing.level += 3;
        assessment.risks.licensing.factors.push(`Strong copyleft license (${license})`);
      }
      
      // Check for non-standard licenses
      if (license === 'NOASSERTION' || license === 'OTHER') {
        assessment.risks.licensing.level += 5;
        assessment.risks.licensing.factors.push('Non-standard license');
      }
    }
  }
  
  // Calculate overall risk (weighted average)
  assessment.overallRisk = Math.min(10, Math.round(
    (assessment.risks.security.level * 0.35 +
     assessment.risks.maintenance.level * 0.25 +
     assessment.risks.sustainability.level * 0.30 +
     assessment.risks.licensing.level * 0.10)
  ));
  
  // Cap individual risk levels at 10
  Object.keys(assessment.risks).forEach(category => {
    assessment.risks[category].level = Math.min(10, assessment.risks[category].level);
  });
  
  return assessment;
}

generateRiskMatrix();