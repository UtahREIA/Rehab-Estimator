// api/ai-pricing.js

export default async function handler(req, res) {
  // 1. Setup CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Handle Preflight Options
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 3. Strict Method Check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // 4. Validate Environment Variables
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'API Key missing in Vercel environment variables.' });
  }

  const { categories, context } = req.body;

  try {
    // 5. Fetch from OpenAI with JSON-Object enforcement
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a professional Utah real estate rehab cost estimator. Return ONLY a valid JSON object. Do not include any text before or after the JSON. Mentioning "JSON" in this instruction is required.' 
          },
          { 
            role: 'user', 
            content: `Estimate labor and material prices for these categories: ${categories.join(", ")}. Context: ${context || 'none'}. Output keys as category names with "labor" and "material" as numeric values.` 
          }
        ],
        response_format: { type: "json_object" } // Enforces pure JSON output
      })
    });

    const data = await response.json();

    // 6. Handle API-level errors (Rate limits, account issues)
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'OpenAI API Error', 
        details: data.error?.message || 'Unknown API failure' 
      });
    }

    // 7. Extract and Parse Content
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned an empty response.');
    }

    // Since response_format is 'json_object', parsing is safer
    const prices = JSON.parse(content);
    
    return res.status(200).json({ prices });

  } catch (err) {
    // 8. Catch-all for parsing or connection errors
    console.error('AI-Pricing Handler Error:', err.message);
    return res.status(500).json({ 
      error: 'Internal processing failure', 
      details: err.message 
    });
  }
}