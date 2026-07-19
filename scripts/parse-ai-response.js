#!/usr/bin/env node

// Normalizes a model response (from GitHub Models via actions/ai-inference)
// into the ai-analysis-result.json shape consumed by format-ai-report.js and
// generate-insights.js. Tolerates plain text, fenced code blocks, or JSON with
// surrounding prose, and always writes a well-formed result file.

const fs = require('fs');

const responseFile = process.argv[2];
const outputFile = process.argv[3] || 'ai-analysis-result.json';

const shape = {
  summary: '',
  overallRisk: 'Medium',
  criticalFindings: [],
  securityIssues: [],
  sustainabilityIssues: [],
  recommendations: [],
  immediateActions: []
};

function extractJson(text) {
  // Prefer a fenced ```json block, then the first balanced object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch (e) {
      /* try next candidate */
    }
  }
  return null;
}

let raw = '';
try {
  raw = fs.readFileSync(responseFile, 'utf8');
} catch (e) {
  console.error(`Could not read model response file: ${e.message}`);
}

let result;
if (!raw.trim()) {
  result = { ...shape, summary: 'Model returned an empty response.', overallRisk: 'Unknown' };
} else {
  const parsed = extractJson(raw);
  result = parsed
    ? { ...shape, ...parsed }
    : { ...shape, summary: raw.trim() };
}

fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
console.log(`Wrote ${outputFile} (overallRisk: ${result.overallRisk})`);
