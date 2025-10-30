#!/usr/bin/env node

const fs = require('fs');
const https = require('https');

// Read the analysis context
const context = JSON.parse(fs.readFileSync('analysis-context.json', 'utf8'));

// Create a summarized context focusing on key metrics
const summarizedContext = {
  analysisDate: context.analysisDate,
  repositoriesAnalyzed: context.repositoriesAnalyzed,
  summary: context.summary,
  // Only include top concerning repos
  topConcerns: context.detailedAnalysis
    .filter(r => r.healthScore < 50)
    .slice(0, 5)
    .map(r => ({
      name: r.repository,
      score: r.healthScore,
      issues: r.metrics.archived ? 'archived' :
              r.metrics.disabled ? 'disabled' :
              r.metrics.commitsLastMonth === 0 ? 'no recent activity' :
              r.metrics.contributorCount < 2 ? 'low contributors' :
              'low health score'
    })),
  // Include security metrics
  securityMetrics: {
    reposWithoutSecurity: context.detailedAnalysis
      .filter(r => !r.metrics.hasSecurityPolicy).length,
    reposWithVulnerabilities: context.detailedAnalysis
      .filter(r => r.metrics.vulnerabilityAlerts > 0).length
  }
};

// Prepare the OpenAI request with smaller context
const requestData = {
  model: "gpt-3.5-turbo-16k", // Use model with larger context window
  messages: [
    {
      role: "system",
      content: "You are an expert in open source software analysis. Provide concise, actionable insights in JSON format."
    },
    {
      role: "user",
      content: `Analyze these dependency health metrics and provide recommendations:

${JSON.stringify(summarizedContext, null, 2)}

Respond with a JSON object containing:
- summary: Executive summary (2-3 sentences)
- overallRisk: "Low", "Medium", "High", or "Critical"
- criticalFindings: Array of 3-5 critical issues
- securityIssues: Array of security concerns
- sustainabilityIssues: Array of maintenance risks
- recommendations: Array of 5 actionable recommendations
- immediateActions: Array of 2-3 urgent actions`
    }
  ],
  temperature: 0.3,
  max_tokens: 2000 // Reduced token limit
};

const options = {
  hostname: 'api.openai.com',
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
  }
};

if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);

      if (response.error) {
        console.error('OpenAI API Error:', response.error);
        process.exit(1);
      }

      const aiResponse = response.choices[0].message.content;

      // Try to parse as JSON first
      let analysisResult;
      try {
        analysisResult = JSON.parse(aiResponse);
      } catch (e) {
        // If not valid JSON, create a structured response
        analysisResult = {
          summary: aiResponse,
          overallRisk: "Medium",
          criticalFindings: [],
          securityIssues: [],
          sustainabilityIssues: [],
          recommendations: [
            "Review the detailed analysis above for specific recommendations"
          ],
          immediateActions: []
        };
      }

      // Write the result
      fs.writeFileSync('ai-analysis-result.json', JSON.stringify(analysisResult, null, 2));
      console.log('Analysis completed successfully!');
      console.log('Result written to ai-analysis-result.json');

    } catch (error) {
      console.error('Error processing response:', error);
      console.error('Raw response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
  process.exit(1);
});

req.write(JSON.stringify(requestData));
req.end();