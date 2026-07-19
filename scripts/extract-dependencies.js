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

const SUPPORTED_ECOSYSTEMS = ['npm', 'pypi'];

function parseSbomPackages(sbomFile) {
  const sbom = JSON.parse(fs.readFileSync(sbomFile, 'utf8'));
  const packages = [];

  (sbom.sbom?.packages || []).forEach(pkg => {
    const purlRef = (pkg.externalRefs || []).find(r =>
      r.referenceType === 'purl' &&
      SUPPORTED_ECOSYSTEMS.some(e => r.referenceLocator?.startsWith(`pkg:${e}/`))
    );
    if (!purlRef) return; // skip the root package and unsupported ecosystems

    // pkg:npm/%40scope/name@1.2.3 -> npm, @scope/name, 1.2.3
    const [, ecosystem, rest] = purlRef.referenceLocator.match(/^pkg:([^/]+)\/(.+)$/);
    const atIndex = rest.lastIndexOf('@');
    if (atIndex <= 0) return;

    packages.push({
      name: decodeURIComponent(rest.slice(0, atIndex)),
      version: rest.slice(atIndex + 1),
      ecosystem
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

// True only when the URL's host is exactly github.com (or www.github.com).
// Registry metadata is third-party input; substring checks would accept
// hosts like github.com.evil.com or paths containing "github.com".
function isGithubHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'github.com' || host === 'www.github.com';
  } catch (e) {
    return false;
  }
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
  if (pkg.homepage && isGithubHost(pkg.homepage)) {
    return normalizeGithubUrl(pkg.homepage);
  }

  // Check bugs URL
  if (pkg.bugs && pkg.bugs.url && isGithubHost(pkg.bugs.url)) {
    const match = pkg.bugs.url.match(/github\.com\/([^/]+\/[^/]+)/);
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
  
  // git@github.com:owner/repo style remotes (before the shorthand check,
  // which would otherwise mangle them)
  const sshMatch = url.match(/^git@github\.com:([\w.-]+\/[\w.-]+)$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`;
  }

  // Handle GitHub shorthand (e.g., "user/repo")
  if (url.match(/^[^/:@]+\/[^/:@]+$/)) {
    return `https://github.com/${url}`;
  }
  
  // Canonicalize URLs whose host really is github.com
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'github.com' || host === 'www.github.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `https://github.com/${parts[0]}/${parts[1]}`;
      }
    }
  } catch (e) {
    // not an absolute URL; handled by the branches above
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

  for (const { name, version, ecosystem = 'npm' } of packageList) {
    const isDirect = ecosystem === 'npm' && directDeps.has(name);

    const packageData = {
      name,
      version,
      ecosystem,
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