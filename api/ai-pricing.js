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

  // System prompt forces the model to act as a fixed price database, not a creative assistant
  const systemPrompt = `You are a deterministic construction cost database for Utah (Salt Lake City / Utah County market), locked to Q1 2025 rates.

Your only job is to return fixed, consistent mid-range contractor prices. You must return the EXACT SAME prices every time for the same inputs — no variation, no ranges, no rounding differently between calls. Always pick the single mid-point value of the typical Utah contractor range and never deviate from it.`;

  const userPrompt = `Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{"prices":{"Category|Label":{"labor":number,"material":number}}}

Pricing rules:
- "total" method: labor = fixed all-in contractor total, material = 0
- "labor-material" method: fixed labor per unit + fixed material per unit
- "per-sqft" method: fixed labor per sqft + fixed material per sqft
- Numbers only — no $ signs, no commas, no ranges, always the same value every call

Items to price:
${items.map(it => `${it.cat}|${it.label} [${it.method}]`).join("\n")}`;

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   }
        ],
        max_tokens: 4000,
        temperature: 0,   // 0 = fully deterministic, no randomness
        seed: 42          // fixed seed for maximum consistency across calls
      })
    });

    if (!openaiRes.ok) {
      const errData = await openaiRes.json();
      console.error("OpenAI error:", errData);
      return res.status(502).json({ error: "AI service error. Please try again." });
    }

    const data = await openaiRes.json();
    let text = data.choices[0].message.content.trim();
    // Strip any accidental markdown fences
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("JSON parse error:", text);
      return res.status(502).json({ error: "AI returned invalid data. Please try again." });
    }

    if (!parsed.prices) {
      return res.status(502).json({ error: "AI returned unexpected format." });
    }

    return res.status(200).json({ prices: parsed.prices });

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
