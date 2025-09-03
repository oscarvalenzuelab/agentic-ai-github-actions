#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoDataDir = process.argv[2] || 'repo-data';

function processRepositoryData() {
  const files = fs.readdirSync(repoDataDir);
  const repositories = {};
  
  // Group files by repository
  files.forEach(file => {
    const match = file.match(/^(.+?)_(overview|contributors|commits|issues|community|releases)\.json$/);
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
  
  const context = {
    analysisDate: new Date().toISOString(),
    repositoriesAnalyzed: Object.keys(repositories).length,
    detailedAnalysis: []
  };
  
  // Process each repository
  Object.entries(repositories).forEach(([repoName, data]) => {
    const analysis = {
      repository: repoName.replace(/_/g, '/'),
      metrics: {}
    };
    
    // Overview metrics
    if (data.overview) {
      const overview = data.overview;
      analysis.metrics.stars = overview.stargazers_count || 0;
      analysis.metrics.forks = overview.forks_count || 0;
      analysis.metrics.openIssues = overview.open_issues_count || 0;
      analysis.metrics.watchers = overview.watchers_count || 0;
      analysis.metrics.size = overview.size || 0;
      analysis.metrics.language = overview.language;
      analysis.metrics.license = overview.license?.name || 'None';
      analysis.metrics.archived = overview.archived || false;
      analysis.metrics.disabled = overview.disabled || false;
      analysis.metrics.createdAt = overview.created_at;
      analysis.metrics.updatedAt = overview.updated_at;
      analysis.metrics.pushedAt = overview.pushed_at;
    }
    
    // Contributor analysis
    if (data.contributors && Array.isArray(data.contributors)) {
      const totalContributors = data.contributors.length;
      const recentContributions = data.contributors
        .filter(c => c.weeks && c.weeks.length > 0)
        .reduce((sum, c) => {
          const recent4Weeks = c.weeks.slice(-4);
          return sum + recent4Weeks.reduce((s, w) => s + (w.c || 0), 0);
        }, 0);
      
      const topContributors = data.contributors
        .sort((a, b) => (b.total || 0) - (a.total || 0))
        .slice(0, 5)
        .map(c => ({
          author: c.author?.login || 'unknown',
          commits: c.total || 0
        }));
      
      analysis.metrics.contributorCount = totalContributors;
      analysis.metrics.recentCommits = recentContributions;
      analysis.metrics.topContributors = topContributors;
      
      // Calculate bus factor (concentration of contributions)
      if (totalContributors > 0) {
        const totalCommits = data.contributors.reduce((sum, c) => sum + (c.total || 0), 0);
        const top20PercentCount = Math.max(1, Math.ceil(totalContributors * 0.2));
        const top20PercentCommits = data.contributors
          .sort((a, b) => (b.total || 0) - (a.total || 0))
          .slice(0, top20PercentCount)
          .reduce((sum, c) => sum + (c.total || 0), 0);
        
        analysis.metrics.contributionConcentration = totalCommits > 0 
          ? (top20PercentCommits / totalCommits).toFixed(2)
          : 0;
      }
    }
    
    // Recent activity
    if (data.commits && Array.isArray(data.commits)) {
      const now = new Date();
      const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const threeMonthsAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);
      
      const recentCommits = data.commits.filter(c => 
        new Date(c.commit?.author?.date) > oneMonthAgo
      ).length;
      
      const quarterlyCommits = data.commits.filter(c => 
        new Date(c.commit?.author?.date) > threeMonthsAgo
      ).length;
      
      analysis.metrics.commitsLastMonth = recentCommits;
      analysis.metrics.commitsLastQuarter = quarterlyCommits;
    }
    
    // Issues and PR metrics
    if (data.issues && Array.isArray(data.issues)) {
      const openIssues = data.issues.filter(i => i.state === 'open' && !i.pull_request).length;
      const openPRs = data.issues.filter(i => i.state === 'open' && i.pull_request).length;
      const closedIssues = data.issues.filter(i => i.state === 'closed' && !i.pull_request).length;
      const closedPRs = data.issues.filter(i => i.state === 'closed' && i.pull_request).length;
      
      // Calculate average time to close
      const closedIssuesWithTime = data.issues
        .filter(i => i.state === 'closed' && i.created_at && i.closed_at)
        .map(i => {
          const created = new Date(i.created_at);
          const closed = new Date(i.closed_at);
          return (closed - created) / (1000 * 60 * 60 * 24); // Days
        });
      
      const avgTimeToClose = closedIssuesWithTime.length > 0
        ? (closedIssuesWithTime.reduce((a, b) => a + b, 0) / closedIssuesWithTime.length).toFixed(1)
        : null;
      
      analysis.metrics.openIssues = openIssues;
      analysis.metrics.openPRs = openPRs;
      analysis.metrics.closedIssues = closedIssues;
      analysis.metrics.closedPRs = closedPRs;
      analysis.metrics.avgDaysToCloseIssue = avgTimeToClose;
    }
    
    // Community health
    if (data.community) {
      analysis.metrics.communityHealth = {
        hasReadme: data.community.files?.readme !== null,
        hasContributing: data.community.files?.contributing !== null,
        hasCodeOfConduct: data.community.files?.code_of_conduct !== null,
        hasLicense: data.community.files?.license !== null,
        hasSecurityPolicy: data.community.files?.security !== null,
        healthPercentage: data.community.health_percentage || 0
      };
    }
    
    // Release frequency
    if (data.releases && Array.isArray(data.releases)) {
      const releases = data.releases
        .filter(r => r.published_at)
        .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      
      if (releases.length > 0) {
        const latestRelease = releases[0];
        const daysSinceLastRelease = Math.floor(
          (new Date() - new Date(latestRelease.published_at)) / (1000 * 60 * 60 * 24)
        );
        
        analysis.metrics.latestRelease = {
          version: latestRelease.tag_name,
          date: latestRelease.published_at,
          daysSince: daysSinceLastRelease,
          isPrerelease: latestRelease.prerelease
        };
        
        // Calculate release frequency
        if (releases.length > 1) {
          const releaseDates = releases.map(r => new Date(r.published_at));
          const intervals = [];
          for (let i = 1; i < releaseDates.length; i++) {
            intervals.push((releaseDates[i-1] - releaseDates[i]) / (1000 * 60 * 60 * 24));
          }
          const avgReleaseInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          analysis.metrics.avgDaysBetweenReleases = Math.round(avgReleaseInterval);
        }
      }
    }
    
    // Calculate health score
    analysis.healthScore = calculateHealthScore(analysis.metrics);
    
    context.detailedAnalysis.push(analysis);
  });
  
  // Sort by health score
  context.detailedAnalysis.sort((a, b) => b.healthScore - a.healthScore);
  
  // Add summary statistics
  context.summary = generateSummary(context.detailedAnalysis);
  
  console.log(JSON.stringify(context, null, 2));
}

function calculateHealthScore(metrics) {
  let score = 0;
  let factors = 0;
  
  // Activity score (0-25)
  if (metrics.commitsLastMonth !== undefined) {
    if (metrics.commitsLastMonth > 50) score += 25;
    else if (metrics.commitsLastMonth > 20) score += 20;
    else if (metrics.commitsLastMonth > 5) score += 15;
    else if (metrics.commitsLastMonth > 0) score += 10;
    factors += 25;
  }
  
  // Community score (0-25)
  if (metrics.contributorCount !== undefined) {
    if (metrics.contributorCount > 50) score += 15;
    else if (metrics.contributorCount > 20) score += 12;
    else if (metrics.contributorCount > 5) score += 8;
    else if (metrics.contributorCount > 1) score += 5;
    factors += 15;
    
    // Bus factor penalty
    if (metrics.contributionConcentration > 0.8) score -= 5;
    else if (metrics.contributionConcentration > 0.6) score -= 2;
  }
  
  if (metrics.communityHealth) {
    const healthItems = Object.values(metrics.communityHealth).filter(v => v === true).length;
    score += (healthItems / 6) * 10;
    factors += 10;
  }
  
  // Maintenance score (0-25)
  if (metrics.avgDaysToCloseIssue !== null) {
    if (metrics.avgDaysToCloseIssue < 7) score += 10;
    else if (metrics.avgDaysToCloseIssue < 30) score += 7;
    else if (metrics.avgDaysToCloseIssue < 90) score += 4;
    factors += 10;
  }
  
  if (metrics.latestRelease) {
    if (metrics.latestRelease.daysSince < 30) score += 15;
    else if (metrics.latestRelease.daysSince < 90) score += 10;
    else if (metrics.latestRelease.daysSince < 180) score += 5;
    factors += 15;
  }
  
  // Popularity score (0-25)
  if (metrics.stars !== undefined) {
    if (metrics.stars > 10000) score += 15;
    else if (metrics.stars > 1000) score += 12;
    else if (metrics.stars > 100) score += 8;
    else if (metrics.stars > 10) score += 4;
    factors += 15;
  }
  
  if (metrics.forks !== undefined) {
    if (metrics.forks > 1000) score += 10;
    else if (metrics.forks > 100) score += 7;
    else if (metrics.forks > 10) score += 4;
    factors += 10;
  }
  
  // Normalize to 0-100
  return factors > 0 ? Math.round((score / factors) * 100) : 0;
}

function generateSummary(repos) {
  const activeRepos = repos.filter(r => r.metrics.commitsLastMonth > 0);
  const healthyRepos = repos.filter(r => r.healthScore > 70);
  const atRiskRepos = repos.filter(r => r.healthScore < 40);
  
  return {
    totalRepositories: repos.length,
    activeRepositories: activeRepos.length,
    healthyRepositories: healthyRepos.length,
    atRiskRepositories: atRiskRepos.length,
    averageHealthScore: Math.round(
      repos.reduce((sum, r) => sum + r.healthScore, 0) / repos.length
    ),
    topPerformers: repos.slice(0, 3).map(r => ({
      name: r.repository,
      score: r.healthScore
    })),
    needsAttention: repos.slice(-3).map(r => ({
      name: r.repository,
      score: r.healthScore,
      issues: identifyIssues(r.metrics)
    }))
  };
}

function identifyIssues(metrics) {
  const issues = [];
  
  if (metrics.commitsLastMonth === 0) {
    issues.push('No recent activity');
  }
  if (metrics.contributorCount < 3) {
    issues.push('Low contributor count');
  }
  if (metrics.contributionConcentration > 0.8) {
    issues.push('High contribution concentration');
  }
  if (metrics.latestRelease && metrics.latestRelease.daysSince > 180) {
    issues.push('Stale releases');
  }
  if (metrics.archived) {
    issues.push('Repository archived');
  }
  
  return issues;
}

processRepositoryData();