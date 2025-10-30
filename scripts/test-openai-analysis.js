#!/usr/bin/env node

const fs = require('fs');
const https = require('https');

// Read the analysis context
const context = JSON.parse(fs.readFileSync('analysis-context.json', 'utf8'));
const prompt = fs.readFileSync('analysis-prompts/comprehensive.md', 'utf8');

// Prepare the OpenAI request
const requestData = {
  model: "gpt-4",
  messages: [
    {
      role: "system",
      content: "You are an expert in open source software analysis, focusing on dependency health, security, and sustainability. Provide your response in valid JSON format."
    },
    {
      role: "user",
      content: `${prompt}\n\nHere is the repository data to analyze:\n${JSON.stringify(context, null, 2)}\n\nIMPORTANT: Respond with a JSON object containing these keys:\n- summary (string): Executive summary of findings\n- overallRisk (string): One of "Low", "Medium", "High", "Critical"\n- criticalFindings (array): Array of critical issues found\n- securityIssues (array): Array of security concerns\n- sustainabilityIssues (array): Array of maintenance/sustainability concerns\n- recommendations (array): Array of actionable recommendations\n- immediateActions (array): Array of urgent actions needed`
    }
  ],
  temperature: 0.3,
  max_tokens: 4000
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