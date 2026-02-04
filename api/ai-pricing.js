// api/ai-pricing.js

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ONLY allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { categories, context } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a Utah rehab estimator. Return ONLY JSON.' },
          { role: 'user', content: `Categories: ${categories.join(", ")}. Context: ${context}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    // Log the full OpenAI response for debugging
    console.log('OpenAI response:', JSON.stringify(data));

    if (data.error) {
      return res.status(500).json({ error: 'OpenAI API error', details: data.error });
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      return res.status(500).json({ error: 'No valid response from OpenAI', details: data });
    }

    let prices = {};
    try {
      prices = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      // Try to extract JSON substring if AI wrapped it in text
      const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          prices = JSON.parse(match[0]);
        } catch (e2) {
          return res.status(500).json({ error: 'Failed to parse AI response as JSON', details: data.choices[0].message.content });
        }
      } else {
        return res.status(500).json({ error: 'Failed to parse AI response as JSON', details: data.choices[0].message.content });
      }
    }
    res.status(200).json({ prices });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}