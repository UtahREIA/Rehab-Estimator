export default async function handler(req, res) {

  // CORS is handled entirely by vercel.json — no manual headers needed here

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── IP EXTRACTION ─────────────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  // ── IN-MEMORY RATE LIMITING ───────────────────────────────────────────────
  // Max 5 AI calls per IP per hour
  if (!global._aiRateMap) global._aiRateMap = new Map();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxCalls = 5;
  const record = global._aiRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._aiRateMap.set(ip, record);
  if (record.count > maxCalls) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    console.warn(`[RATE LIMIT] AI — IP: ${ip}, calls: ${record.count}`);
    return res.status(429).json({ error: `Rate limit exceeded. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.` });
  }

  // ── API KEY CHECK ─────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server configuration error." });

  // ── INPUT VALIDATION ──────────────────────────────────────────────────────
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid request body." });
  }
  if (items.length > 200) {
    return res.status(400).json({ error: "Too many items in request." });
  }
  const cleanItems = items.map(it => ({
    cat:    String(it.cat    || "").substring(0, 50).replace(/[^a-zA-Z0-9 &/\-]/g, ""),
    label:  String(it.label  || "").substring(0, 80).replace(/[^a-zA-Z0-9 &/\-().]/g, ""),
    method: ["total","labor-material","per-sqft"].includes(it.method) ? it.method : "total"
  })).filter(it => it.cat && it.label);

  // ── REQUEST LOG ───────────────────────────────────────────────────────────
  console.log("[AI REQUEST]", JSON.stringify({
    time: new Date().toISOString(),
    ip,
    itemCount: cleanItems.length,
    userAgent: req.headers["user-agent"]?.substring(0, 80) || "unknown"
  }));

  // ── OPENAI CALL WITH TIMEOUT ──────────────────────────────────────────────
  const systemPrompt = `You are a deterministic construction cost database for Utah (Salt Lake City / Utah County market), locked to Q1 2025 rates. Return the EXACT SAME prices every time for the same inputs — always the mid-point of the typical Utah contractor range, never varying between calls.`;

  const userPrompt = `Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{"prices":{"Category|Label":{"labor":number,"material":number}}}

Rules:
- "total" method: labor = all-in contractor total, material = 0
- "labor-material" method: labor per unit + material per unit
- "per-sqft" method: labor per sqft + material per sqft
- Numbers only, same value every call

Items:
${cleanItems.map(it => `${it.cat}|${it.label} [${it.method}]`).join("\n")}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0,
        seed: 42
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!openaiRes.ok) {
      const errData = await openaiRes.json();
      console.error("[OPENAI ERROR]", errData);
      return res.status(502).json({ error: "AI service error. Please try again." });
    }

    const data = await openaiRes.json();
    let text = data.choices[0].message.content.trim();
    text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) {
      console.error("[JSON PARSE ERROR]", text.substring(0, 200));
      return res.status(502).json({ error: "AI returned invalid data. Please try again." });
    }

    if (!parsed.prices) return res.status(502).json({ error: "AI returned unexpected format." });

    console.log("[AI SUCCESS]", JSON.stringify({ time: new Date().toISOString(), ip, pricesReturned: Object.keys(parsed.prices).length }));
    return res.status(200).json({ prices: parsed.prices });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("[TIMEOUT] AI request exceeded 25 seconds");
      return res.status(504).json({ error: "Request timed out. Please try again." });
    }
    console.error("[PROXY ERROR]", err.message);
    return res.status(500).json({ error: "Internal server error." });
  }
}
