#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');

const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

async function getPackageInfo(packageName) {
  return new Promise((resolve, reject) => {
    https.get(`https://registry.npmjs.org/${packageName}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pkg = JSON.parse(data);
          resolve(pkg);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

function extractGithubRepo(pkg) {
  if (!pkg) return null;
  
  // Check repository field
  if (pkg.repository) {
    if (typeof pkg.repository === 'string') {
      return normalizeGithubUrl(pkg.repository);
    } else if (pkg.repository.url) {
      return normalizeGithubUrl(pkg.repository.url);
    }
  }
  
  // Check homepage
  if (pkg.homepage && pkg.homepage.includes('github.com')) {
    return normalizeGithubUrl(pkg.homepage);
  }
  
  // Check bugs URL
  if (pkg.bugs && pkg.bugs.url && pkg.bugs.url.includes('github.com')) {
    const bugsUrl = pkg.bugs.url;
    const match = bugsUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    if (match) {
      return `https://github.com/${match[1]}`;
    }
  }
  
  return null;
}

function normalizeGithubUrl(url) {
  if (!url) return null;
  
  // Handle git+https, git://, etc.
  url = url.replace(/^git\+/, '');
  url = url.replace(/^git:\/\//, 'https://');
  url = url.replace(/\.git$/, '');
  
  // Handle GitHub shorthand (e.g., "user/repo")
  if (url.match(/^[^/]+\/[^/]+$/)) {
    return `https://github.com/${url}`;
  }
  
  // Extract github.com URLs
  const match = url.match(/github\.com[/:]([\w-]+\/[\w-]+)/);
  if (match) {
    return `https://github.com/${match[1]}`;
  }
  
  if (url.includes('github.com')) {
    return url;
  }
  
  return null;
}

async function extractDependencies() {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  
  const result = {
    timestamp: new Date().toISOString(),
    projectName: packageJson.name,
    packages: [],
    repositories: []
  };
  
  const repoSet = new Set();
  
  for (const [name, version] of Object.entries(allDeps)) {
    const pkgInfo = await getPackageInfo(name);
    
    const packageData = {
      name,
      version,
      isDev: packageJson.devDependencies && packageJson.devDependencies[name] !== undefined
    };
    
    if (pkgInfo) {
      packageData.latest = pkgInfo['dist-tags']?.latest;
      packageData.description = pkgInfo.description;
      packageData.license = pkgInfo.license;
      packageData.maintainers = pkgInfo.maintainers?.map(m => m.name);
      
      const repoUrl = extractGithubRepo(pkgInfo);
      if (repoUrl) {
        packageData.repository = repoUrl;
        repoSet.add(repoUrl);
      }
    }
    
    result.packages.push(packageData);
  }
  
  result.repositories = Array.from(repoSet);
  
  console.log(JSON.stringify(result, null, 2));
}

extractDependencies().catch(console.error);