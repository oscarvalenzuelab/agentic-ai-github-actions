#!/usr/bin/env node

// Queries OSV.dev for known vulnerabilities affecting the dependency set
// produced by extract-dependencies.js. Uses the free batch API (no auth).
// Output: JSON summary consumed by build-ai-prompt.js and the reports.

const fs = require('fs');
const https = require('https');

const depsFile = process.argv[2] || 'dependencies.json';
const deps = JSON.parse(fs.readFileSync(depsFile, 'utf8'));

// OSV needs concrete versions. SBOM-sourced versions already are; for
// package.json ranges, strip common range operators as an approximation.
function concreteVersion(version) {
  return (version || '').replace(/^[~^>=<\s]+/, '').split(' ')[0];
}

const queries = deps.packages
  .map(p => ({ name: p.name, version: concreteVersion(p.version) }))
  .filter(p => p.name && /^\d/.test(p.version))
  .map(p => ({
    package: { name: p.name, ecosystem: 'npm' },
    version: p.version
  }));

function postJson(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid OSV response (HTTP ${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const summary = {
    queriedAt: new Date().toISOString(),
    packagesQueried: queries.length,
    packagesWithVulns: 0,
    totalVulns: 0,
    vulnerablePackages: []
  };

  // OSV querybatch accepts up to 1000 queries per request
  const BATCH = 1000;
  for (let offset = 0; offset < queries.length; offset += BATCH) {
    const batch = queries.slice(offset, offset + BATCH);
    const response = await postJson('api.osv.dev', '/v1/querybatch', { queries: batch });

    (response.results || []).forEach((result, i) => {
      const vulns = result.vulns || [];
      if (vulns.length > 0) {
        const q = batch[i];
        summary.packagesWithVulns += 1;
        summary.totalVulns += vulns.length;
        summary.vulnerablePackages.push({
          name: q.package.name,
          version: q.version,
          vulnIds: vulns.map(v => v.id)
        });
      }
    });
  }

  // Most-affected packages first
  summary.vulnerablePackages.sort((a, b) => b.vulnIds.length - a.vulnIds.length);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(`OSV query failed: ${err.message}`);
  process.exit(1);
});
