#!/usr/bin/env node

const fs = require('fs');

const consolidatedFile = process.argv[2];

if (!consolidatedFile) {
  console.error('# Error\nNo consolidated report file provided');
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(consolidatedFile, 'utf8'));
  
  console.log(`# OpenSSF Scorecard Analysis Report`);
  console.log(`\n**Generated**: ${data.timestamp}`);
  console.log(`**Repositories Analyzed**: ${data.totalReposAnalyzed}`);
  console.log(`**Average Score**: ${data.summary.averageScore}/10`);
  
  // Risk Distribution
  if (data.summary.riskDistribution) {
    console.log(`\n## Risk Distribution`);
    console.log(`- **High Risk** (Score < 4): ${data.summary.riskDistribution.high} repositories`);
    console.log(`- **Medium Risk** (Score 4-6.9): ${data.summary.riskDistribution.medium} repositories`);
    console.log(`- **Low Risk** (Score ≥ 7): ${data.summary.riskDistribution.low} repositories`);
  }
  
  // Critical Findings
  if (data.summary.criticalFindings && data.summary.criticalFindings.length > 0) {
    console.log(`\n## ⚠️ Critical Security Findings`);
    console.log(`\nThe following critical security issues were identified:\n`);
    
    data.summary.criticalFindings.forEach(finding => {
      console.log(`- **${finding.repository}**: ${finding.check} (Score: ${finding.score}/10)`);
      console.log(`  - ${finding.reason}`);
    });
  }
  
  // Top Scoring
  if (data.summary.topScoring && data.summary.topScoring.length > 0) {
    console.log(`\n## ✅ Top Scoring Repositories`);
    console.log(`\n| Repository | Score |`);
    console.log(`|------------|-------|`);
    data.summary.topScoring.forEach(repo => {
      console.log(`| ${repo.repository} | ${repo.score}/10 |`);
    });
  }
  
  // Low Scoring
  if (data.summary.lowScoring && data.summary.lowScoring.length > 0) {
    console.log(`\n## ⚡ Repositories Needing Attention`);
    console.log(`\n| Repository | Score | Priority Actions |`);
    console.log(`|------------|-------|------------------|`);
    
    data.summary.lowScoring.forEach(repo => {
      const report = data.reports.find(r => r.repository === repo.repository);
      const actions = [];
      
      if (report && report.checks) {
        // Identify top 2 worst checks
        const checkScores = Object.entries(report.checks)
          .sort((a, b) => a[1].score - b[1].score)
          .slice(0, 2);
        
        checkScores.forEach(([name, check]) => {
          if (check.score < 5) {
            actions.push(name.replace(/-/g, ' '));
          }
        });
      }
      
      console.log(`| ${repo.repository} | ${repo.score}/10 | ${actions.join(', ') || 'Review all checks'} |`);
    });
  }
  
  // Detailed Check Results
  console.log(`\n## Detailed Check Analysis`);
  
  // Aggregate check scores
  const checkAggregates = {};
  data.reports.forEach(report => {
    if (report.checks) {
      Object.entries(report.checks).forEach(([name, check]) => {
        if (!checkAggregates[name]) {
          checkAggregates[name] = {
            totalScore: 0,
            count: 0,
            failing: []
          };
        }
        checkAggregates[name].totalScore += check.score;
        checkAggregates[name].count++;
        if (check.score < 5) {
          checkAggregates[name].failing.push(report.repository);
        }
      });
    }
  });
  
  console.log(`\n### Check Performance Overview`);
  console.log(`\n| Check | Avg Score | Pass Rate | Failing Repos |`);
  console.log(`|-------|-----------|-----------|---------------|`);
  
  Object.entries(checkAggregates)
    .sort((a, b) => (a[1].totalScore/a[1].count) - (b[1].totalScore/b[1].count))
    .forEach(([name, stats]) => {
      const avgScore = (stats.totalScore / stats.count).toFixed(1);
      const passRate = ((stats.count - stats.failing.length) / stats.count * 100).toFixed(0);
      console.log(`| ${name} | ${avgScore}/10 | ${passRate}% | ${stats.failing.length} |`);
    });
  
  // Recommendations
  console.log(`\n## Recommendations`);
  console.log(`\n### Immediate Actions Required`);
  
  const recommendations = new Set();
  
  data.summary.criticalFindings.forEach(finding => {
    if (finding.check === 'Dangerous-Workflow') {
      recommendations.add('- Review and restrict GitHub Actions workflow permissions');
    }
    if (finding.check === 'Token-Permissions') {
      recommendations.add('- Implement least-privilege token permissions in CI/CD');
    }
    if (finding.check === 'Vulnerabilities') {
      recommendations.add('- Enable Dependabot and address known vulnerabilities');
    }
  });
  
  if (data.summary.averageScore < 5) {
    recommendations.add('- Establish a security baseline and improvement plan');
    recommendations.add('- Consider adopting OpenSSF Best Practices Badge program');
  }
  
  if (recommendations.size === 0) {
    console.log('- Continue monitoring and maintaining current security posture');
  } else {
    recommendations.forEach(rec => console.log(rec));
  }
  
  console.log(`\n### Long-term Improvements`);
  console.log(`- Implement automated security scanning in CI/CD pipelines`);
  console.log(`- Establish dependency update policies and schedules`);
  console.log(`- Regular security audits and penetration testing`);
  console.log(`- Develop incident response procedures`);
  
  console.log(`\n---`);
  console.log(`\n*This report was generated automatically using OpenSSF Scorecard.*`);
  
} catch (e) {
  console.error(`# Error\nFailed to generate report: ${e.message}`);
  process.exit(1);
}