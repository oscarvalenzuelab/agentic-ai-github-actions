#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');

const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Optional: path to a GitHub dependency graph SBOM (SPDX JSON).
// When provided, the full dependency tree (direct + transitive, exact
// resolved versions) is taken from the SBOM instead of package.json alone.
const sbomPath = process.argv[2];

function parseSbomPackages(sbomFile) {
  const sbom = JSON.parse(fs.readFileSync(sbomFile, 'utf8'));
  const packages = [];

  (sbom.sbom?.packages || []).forEach(pkg => {
    const purlRef = (pkg.externalRefs || []).find(r =>
      r.referenceType === 'purl' && r.referenceLocator?.startsWith('pkg:npm/')
    );
    if (!purlRef) return; // skip the root package and non-npm entries

    // pkg:npm/%40scope/name@1.2.3 -> @scope/name, 1.2.3
    const locator = purlRef.referenceLocator.slice('pkg:npm/'.length);
    const atIndex = locator.lastIndexOf('@');
    if (atIndex <= 0) return;

    packages.push({
      name: decodeURIComponent(locator.slice(0, atIndex)),
      version: locator.slice(atIndex + 1)
    });
  });

  return packages;
}

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
  const directDeps = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
  ]);

  // Package list: full tree from the SBOM when available, otherwise
  // direct dependencies from package.json (versions are semver ranges).
  let packageList;
  if (sbomPath && fs.existsSync(sbomPath)) {
    packageList = parseSbomPackages(sbomPath);
  } else {
    packageList = Object.entries({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }).map(([name, version]) => ({ name, version }));
  }

  const result = {
    timestamp: new Date().toISOString(),
    projectName: packageJson.name,
    source: sbomPath && fs.existsSync(sbomPath) ? 'dependency-graph-sbom' : 'package.json',
    packages: [],
    repositories: []
  };

  const repoSet = new Set();

  for (const { name, version } of packageList) {
    const isDirect = directDeps.has(name);

    const packageData = {
      name,
      version,
      isDirect,
      isDev: packageJson.devDependencies && packageJson.devDependencies[name] !== undefined
    };

    // Deep enrichment (registry metadata + GitHub repo mapping) only for
    // direct dependencies — those are the ones the per-repo metric
    // collection analyzes. Transitive packages still get OSV vulnerability
    // coverage from name+version alone.
    if (isDirect) {
      const pkgInfo = await getPackageInfo(name);
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
    }

    result.packages.push(packageData);
  }

  result.repositories = Array.from(repoSet);

  console.log(JSON.stringify(result, null, 2));
}

extractDependencies().catch(console.error);