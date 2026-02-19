export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const prompt = `You are a Utah real estate rehab estimator expert with precise knowledge of current 2024-2025 labor and material costs in the Salt Lake City / Utah County market.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences. The structure must be:
{"prices":{"Category|Label":{"labor":number,"material":number}}}

Rules:
- "total" method: labor = all-in project cost, material = 0
- "labor-material" method: split realistic labor and material per unit
- "per-sqft" method: give per-square-foot rates for labor and material
- Reflect accurate 2024-2025 Utah market pricing with current inflation
- Numbers only, no $ signs, no commas

Items to price:
${items.map(it => `${it.cat}|${it.label} [${it.method}]`).join('\n')}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.2
      })
    });

    if (!openaiRes.ok) {
      const errData = await openaiRes.json();
      console.error('OpenAI error:', errData);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await openaiRes.json();
    let text = data.choices[0].message.content.trim();
    // Strip any accidental markdown fences
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('JSON parse error:', text);
      return res.status(502).json({ error: 'AI returned invalid data. Please try again.' });
    }

    if (!parsed.prices) {
      return res.status(502).json({ error: 'AI returned unexpected format.' });
    }

    return res.status(200).json({ prices: parsed.prices });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
