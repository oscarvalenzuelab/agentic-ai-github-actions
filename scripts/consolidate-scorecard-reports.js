#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const reportsDir = process.argv[2] || 'scorecard-reports';

function consolidateReports() {
  if (!fs.existsSync(reportsDir)) {
    console.error(JSON.stringify({
      error: 'Reports directory not found',
      message: 'No scorecard reports to consolidate'
    }, null, 2));
    process.exit(0);
  }
  
  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
  const consolidated = {
    timestamp: new Date().toISOString(),
    totalReposAnalyzed: files.length,
    reports: [],
    summary: {
      averageScore: 0,
      criticalFindings: [],
      topScoring: [],
      lowScoring: []
    }
  };
  
  let totalScore = 0;
  
  files.forEach(file => {
    try {
      const content = fs.readFileSync(path.join(reportsDir, file), 'utf8');
      const report = JSON.parse(content);
      
      if (report && report.score !== undefined) {
        const repoName = file.replace('.json', '').replace(/_/g, '/');
        
        const summary = {
          repository: repoName,
          score: report.score,
          date: report.date,
          checks: {}
        };
        
        // Extract check results
        if (report.checks && Array.isArray(report.checks)) {
          report.checks.forEach(check => {
            summary.checks[check.name] = {
              score: check.score,
              reason: check.reason,
              details: check.details ? check.details.slice(0, 2) : []
            };
            
            // Identify critical findings
            if (check.score < 3 && (
              check.name === 'Dangerous-Workflow' ||
              check.name === 'Token-Permissions' ||
              check.name === 'Vulnerabilities'
            )) {
              consolidated.summary.criticalFindings.push({
                repository: repoName,
                check: check.name,
                score: check.score,
                reason: check.reason
              });
            }
          });
        }
        
        totalScore += report.score;
        consolidated.reports.push(summary);
      }
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
  });
  
  // Calculate summary statistics
  if (consolidated.reports.length > 0) {
    consolidated.summary.averageScore = (totalScore / consolidated.reports.length).toFixed(2);
    
    // Sort by score
    const sorted = consolidated.reports.sort((a, b) => b.score - a.score);
    consolidated.summary.topScoring = sorted.slice(0, 5).map(r => ({
      repository: r.repository,
      score: r.score
    }));
    consolidated.summary.lowScoring = sorted.slice(-5).map(r => ({
      repository: r.repository,
      score: r.score
    }));
    
    // Add risk categories
    consolidated.summary.riskDistribution = {
      high: consolidated.reports.filter(r => r.score < 4).length,
      medium: consolidated.reports.filter(r => r.score >= 4 && r.score < 7).length,
      low: consolidated.reports.filter(r => r.score >= 7).length
    };
  }
  
  console.log(JSON.stringify(consolidated, null, 2));
}

consolidateReports();