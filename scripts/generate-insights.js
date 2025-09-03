#!/usr/bin/env node

const fs = require('fs');

const aiResultFile = process.argv[2];
const riskMatrixFile = process.argv[3];

if (!aiResultFile || !riskMatrixFile) {
  console.error('Missing required files');
  process.exit(1);
}

try {
  const aiResult = fs.readFileSync(aiResultFile, 'utf8');
  const riskMatrix = JSON.parse(fs.readFileSync(riskMatrixFile, 'utf8'));
  
  console.log(`# Actionable Insights\n`);
  console.log(`*Generated: ${new Date().toISOString()}*\n`);
  
  // Priority matrix based on risk scores
  const criticalRepos = riskMatrix.repositories.filter(r => r.overallRisk >= 8);
  const highRiskRepos = riskMatrix.repositories.filter(r => r.overallRisk >= 6 && r.overallRisk < 8);
  const mediumRiskRepos = riskMatrix.repositories.filter(r => r.overallRisk >= 4 && r.overallRisk < 6);
  
  if (criticalRepos.length > 0) {
    console.log(`## 🔴 CRITICAL Priority Actions\n`);
    criticalRepos.forEach(repo => {
      console.log(`### ${repo.repository}`);
      console.log(`**Risk Score: ${repo.overallRisk}/10**\n`);
      
      Object.entries(repo.risks).forEach(([category, risk]) => {
        if (risk.level >= 7) {
          console.log(`- **${category.charAt(0).toUpperCase() + category.slice(1)} Issues:**`);
          risk.factors.forEach(factor => {
            console.log(`  - ${factor}`);
            console.log(`    - Action: ${getActionForFactor(factor)}`);
          });
        }
      });
      console.log('');
    });
  }
  
  if (highRiskRepos.length > 0) {
    console.log(`## 🟡 HIGH Priority Actions\n`);
    highRiskRepos.forEach(repo => {
      console.log(`### ${repo.repository}`);
      console.log(`**Risk Score: ${repo.overallRisk}/10**\n`);
      
      const topRisks = Object.entries(repo.risks)
        .filter(([_, risk]) => risk.level >= 5)
        .sort((a, b) => b[1].level - a[1].level)
        .slice(0, 2);
      
      topRisks.forEach(([category, risk]) => {
        console.log(`- **${category}**: ${risk.factors.join(', ')}`);
        console.log(`  - Recommended: ${getRecommendationForCategory(category, risk)}`);
      });
      console.log('');
    });
  }
  
  if (mediumRiskRepos.length > 0) {
    console.log(`## 🟢 MEDIUM Priority Actions\n`);
    console.log(`The following repositories have moderate risk levels:\n`);
    mediumRiskRepos.forEach(repo => {
      const mainIssue = Object.entries(repo.risks)
        .filter(([_, risk]) => risk.level > 0)
        .sort((a, b) => b[1].level - a[1].level)[0];
      
      if (mainIssue) {
        console.log(`- **${repo.repository}**: ${mainIssue[0]} concerns (${mainIssue[1].factors[0]})`);
      }
    });
  }
  
  console.log(`\n## 📊 Strategic Recommendations\n`);
  
  // Security recommendations
  const securityRisks = riskMatrix.riskCategories.security;
  if (securityRisks.length > 0) {
    console.log(`### Security Improvements`);
    console.log(`- Enable GitHub Advanced Security for ${securityRisks.length} repositories`);
    console.log(`- Implement mandatory commit signing policies`);
    console.log(`- Set up automated vulnerability scanning with Dependabot`);
    console.log(`- Configure branch protection rules with required security checks\n`);
  }
  
  // Sustainability recommendations
  const sustainabilityRisks = riskMatrix.riskCategories.sustainability;
  if (sustainabilityRisks.length > 0) {
    console.log(`### Sustainability Improvements`);
    console.log(`- Address bus factor issues in ${sustainabilityRisks.filter(r => 
      r.factors.includes('Single maintainer') || r.factors.includes('High bus factor')
    ).length} repositories`);
    console.log(`- Establish contributor onboarding documentation`);
    console.log(`- Consider finding co-maintainers for critical single-maintainer projects`);
    console.log(`- Set up GitHub Sponsors or Open Collective for funding\n`);
  }
  
  // Maintenance recommendations
  const maintenanceRisks = riskMatrix.riskCategories.maintenance;
  if (maintenanceRisks.length > 0) {
    console.log(`### Maintenance Improvements`);
    const archivedCount = maintenanceRisks.filter(r => 
      r.factors.includes('Repository archived')
    ).length;
    const staleCount = maintenanceRisks.filter(r => 
      r.factors.includes('No recent activity') || r.factors.includes('No activity for over a year')
    ).length;
    
    if (archivedCount > 0) {
      console.log(`- Consider replacing ${archivedCount} archived dependencies`);
    }
    if (staleCount > 0) {
      console.log(`- Evaluate ${staleCount} stale dependencies for alternatives`);
    }
    console.log(`- Establish regular dependency update schedules`);
    console.log(`- Implement automated testing for dependency updates\n`);
  }
  
  console.log(`## 📋 Next Steps\n`);
  console.log(`1. **Immediate (This Week)**`);
  console.log(`   - Review and address critical security vulnerabilities`);
  console.log(`   - Replace or fork archived dependencies`);
  console.log(`   - Enable basic security features (Dependabot, security alerts)`);
  console.log(`\n2. **Short-term (This Month)**`);
  console.log(`   - Implement automated security scanning`);
  console.log(`   - Update stale dependencies to latest stable versions`);
  console.log(`   - Document dependency update policies`);
  console.log(`\n3. **Long-term (This Quarter)**`);
  console.log(`   - Establish comprehensive dependency governance`);
  console.log(`   - Build relationships with key dependency maintainers`);
  console.log(`   - Consider contributing back to critical dependencies`);
  console.log(`   - Develop contingency plans for at-risk dependencies`);
  
} catch (e) {
  console.error(`Failed to generate insights: ${e.message}`);
  process.exit(1);
}

function getActionForFactor(factor) {
  const actions = {
    'No advanced security enabled': 'Enable GitHub Advanced Security in repository settings',
    'Most commits unsigned': 'Configure GPG/SSH signing and enforce via branch protection',
    'No activity for over a year': 'Evaluate for replacement or consider forking',
    'Repository archived': 'Find alternative package or fork if critical',
    'Repository disabled': 'Urgent: Find immediate alternative',
    'Single maintainer': 'Assess criticality and consider offering maintainer support',
    'High bus factor': 'Encourage contributor diversification or prepare contingency',
    'No license specified': 'Contact maintainer or seek legal guidance before use',
    'No sponsorship program': 'Consider direct support if dependency is critical'
  };
  
  for (const [key, action] of Object.entries(actions)) {
    if (factor.includes(key)) {
      return action;
    }
  }
  
  return 'Review and assess impact';
}

function getRecommendationForCategory(category, risk) {
  const recommendations = {
    security: {
      high: 'Implement comprehensive security controls and monitoring',
      medium: 'Enable automated security scanning and alerts',
      low: 'Maintain current security practices'
    },
    maintenance: {
      high: 'Consider replacement or active fork development',
      medium: 'Monitor for updates and prepare migration plans',
      low: 'Track release cycles and update regularly'
    },
    sustainability: {
      high: 'Urgent: Develop contingency plans and consider alternatives',
      medium: 'Engage with community and consider contributing',
      low: 'Monitor project health metrics quarterly'
    },
    licensing: {
      high: 'Seek legal review before continued use',
      medium: 'Document license compliance requirements',
      low: 'Maintain license inventory'
    }
  };
  
  const level = risk.level >= 7 ? 'high' : risk.level >= 4 ? 'medium' : 'low';
  return recommendations[category]?.[level] || 'Assess and monitor regularly';
}