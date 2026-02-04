// api/ai-pricing.js
// Endpoint to get AI-generated pricing using OpenAI



module.exports = async (req, res) => {
  // Vercel/Next.js: req.method, req.body, res.status().json()
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Parse body if not already parsed (Vercel auto-parses, but fallback for raw)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { categories, context } = body || {};
  if (!categories || !Array.isArray(categories)) {
    res.status(400).json({ error: 'Missing or invalid categories' });
    return;
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OpenAI API key not set' });
    return;
  }

  const prompt = `You are a real estate rehab cost estimator for Utah. Given these categories: ${categories.join(", ")}, and this context: ${context || 'none'}, return a JSON object with estimated labor and material prices for each category, using current Utah market rates. Example output: { "Painting": { "labor": 2.5, "material": 1.5 }, ... }`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a real estate rehab cost estimator for Utah.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.2
      })
    });
    const data = await response.json();
    let prices = {};
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      try {
        prices = JSON.parse(data.choices[0].message.content);
      } catch (e) {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) prices = JSON.parse(match[0]);
      }
    }
    res.status(200).json({ prices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from OpenAI', details: err.message });
  }
};
