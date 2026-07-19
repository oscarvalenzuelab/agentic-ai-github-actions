#!/usr/bin/env node

// License and policy analysis using the OSPAC dataset
// (https://github.com/SemClone/ospac). Evaluates every package license in the
// dependency tree against the project's own license and OSPAC's
// obligations/compatibility data.
//
// Usage: analyze-licenses-ospac.js <ospac-data-dir> <dependencies.json> [sbom.json]
//
// License source: the dependency graph SBOM (licenseConcluded/licenseDeclared,
// full tree) when provided, otherwise the npm registry licenses in
// dependencies.json (direct dependencies only).

const fs = require('fs');
const path = require('path');

const ospacDir = process.argv[2];
const depsFile = process.argv[3] || 'dependencies.json';
const sbomFile = process.argv[4];

const index = JSON.parse(fs.readFileSync(path.join(ospacDir, 'index.json'), 'utf8'));
const projectLicense = JSON.parse(fs.readFileSync('package.json', 'utf8')).license || 'NOASSERTION';

// Collect {name, license} for every package we know a license for
function collectPackages() {
  if (sbomFile && fs.existsSync(sbomFile)) {
    const sbom = JSON.parse(fs.readFileSync(sbomFile, 'utf8'));
    return (sbom.sbom?.packages || [])
      .filter(p => (p.externalRefs || []).some(r =>
        /^pkg:(npm|pypi)\//.test(r.referenceLocator || '')))
      .map(p => ({
        name: p.name.replace(/^npm:/, ''),
        license: p.licenseDeclared && p.licenseDeclared !== 'NOASSERTION'
          ? p.licenseDeclared
          : (p.licenseConcluded || 'NOASSERTION')
      }));
  }
  const deps = JSON.parse(fs.readFileSync(depsFile, 'utf8'));
  return deps.packages.map(p => ({ name: p.name, license: p.license || 'NOASSERTION' }));
}

// Resolve an SPDX id or simple expression to known OSPAC license ids
function resolveLicenseIds(expr) {
  if (!expr || expr === 'NOASSERTION') return [];
  if (index.licenses[expr]) return [expr];
  // Simple expression handling: split on OR/AND/parentheses, keep known ids
  const tokens = expr.split(/\s+(?:OR|AND|WITH)\s+|[()]/).map(t => t.trim()).filter(Boolean);
  return tokens.filter(t => index.licenses[t]);
}

// Load the compatibility verdicts for the project license, if OSPAC has them
function loadProjectCompatibility() {
  const relDir = path.join(ospacDir, 'compatibility', 'relationships');
  for (const file of fs.readdirSync(relDir)) {
    const rel = JSON.parse(fs.readFileSync(path.join(relDir, file), 'utf8'));
    if (rel[projectLicense]) return rel[projectLicense];
  }
  return null;
}

const packages = collectPackages();
const projectCompat = loadProjectCompatibility();

const byLicense = {};
const unknown = [];

packages.forEach(pkg => {
  const ids = resolveLicenseIds(pkg.license);
  if (ids.length === 0) {
    unknown.push({ name: pkg.name, declared: pkg.license });
    return;
  }
  // For OR expressions, use the most permissive option (matches consumer choice)
  const id = ids.sort((a, b) => {
    const rank = c => c === 'permissive' ? 0 : c === 'weak-copyleft' ? 1 : 2;
    return rank(index.licenses[a].category) - rank(index.licenses[b].category);
  })[0];

  if (!byLicense[id]) byLicense[id] = { packages: [], meta: index.licenses[id] };
  byLicense[id].packages.push(pkg.name);
});

const result = {
  analyzedAt: new Date().toISOString(),
  projectLicense,
  ospacVersion: index.version,
  packagesEvaluated: packages.length,
  unknownLicenses: unknown,
  distribution: {},
  copyleft: [],
  incompatible: [],
  requiresReview: [],
  obligations: {}
};

Object.entries(byLicense).forEach(([id, info]) => {
  const category = info.meta.category;
  result.distribution[id] = { count: info.packages.length, category };

  // Obligations from the per-license file
  try {
    const detail = JSON.parse(
      fs.readFileSync(path.join(ospacDir, info.meta.file), 'utf8')
    ).license;
    if (detail.obligations?.length) result.obligations[id] = detail.obligations;
  } catch (e) { /* obligations stay unlisted */ }

  if (category !== 'permissive' && category !== 'public-domain') {
    result.copyleft.push({ license: id, category, packages: info.packages });
  }

  // Compatibility with the project license (distribution context)
  if (projectCompat) {
    const verdict = projectCompat[id]?.distribution;
    if (verdict === 'incompatible') {
      result.incompatible.push({ license: id, packages: info.packages });
    } else if (verdict === 'requires_review' || verdict === 'review') {
      result.requiresReview.push({ license: id, packages: info.packages });
    }
  } else if (category === 'copyleft' || category === 'strong-copyleft') {
    // No OSPAC verdict available for the project license: flag copyleft for review
    result.requiresReview.push({ license: id, packages: info.packages });
  }
});

console.log(JSON.stringify(result, null, 2));
