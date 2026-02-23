export default async function handler(req, res) {

  // ── CORS — only allow your specific domain ────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const origin = req.headers.origin || "";
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    console.warn(`[BLOCKED] Request from unauthorized origin: ${origin}`);
    return res.status(403).json({ error: "Forbidden origin." });
  }
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── IP EXTRACTION ─────────────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  // ── SIMPLE IN-MEMORY RATE LIMITING (per IP, per cold start) ──────────────
  // For production, replace with Vercel KV (same as verify-phone.js)
  // Max 5 AI calls per IP per hour
  if (!global._aiRateMap) global._aiRateMap = new Map();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxCalls = 5;
  const record = global._aiRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._aiRateMap.set(ip, record);
  if (record.count > maxCalls) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    console.warn(`[RATE LIMIT] AI endpoint — IP: ${ip}, calls: ${record.count}`);
    return res.status(429).json({ error: `Rate limit exceeded. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.` });
  }

  // ── API KEY CHECK ─────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server configuration error." });
  }

  // ── INPUT VALIDATION ──────────────────────────────────────────────────────
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid request body." });
  }
  if (items.length > 200) {
    return res.status(400).json({ error: "Too many items in request." });
  }
  // Sanitize each item
  const cleanItems = items.map(it => ({
    cat:    String(it.cat    || "").substring(0, 50).replace(/[^a-zA-Z0-9 &/\-]/g, ""),
    label:  String(it.label  || "").substring(0, 80).replace(/[^a-zA-Z0-9 &/\-().]/g, ""),
    method: ["total","labor-material","per-sqft"].includes(it.method) ? it.method : "total"
  })).filter(it => it.cat && it.label);

  // ── REQUEST LOGGING ───────────────────────────────────────────────────────
  console.log("[AI REQUEST]", JSON.stringify({
    time: new Date().toISOString(),
    ip,
    itemCount: cleanItems.length,
    origin: origin || "unknown",
    userAgent: req.headers["user-agent"]?.substring(0, 80) || "unknown"
  }));

  // ── OPENAI CALL WITH TIMEOUT ──────────────────────────────────────────────
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
${cleanItems.map(it => `${it.cat}|${it.label} [${it.method}]`).join("\n")}`;

  // AbortController for 25s timeout (Vercel max function = 30s)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

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
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("[JSON PARSE ERROR]", text.substring(0, 200));
      return res.status(502).json({ error: "AI returned invalid data. Please try again." });
    }

    if (!parsed.prices) {
      return res.status(502).json({ error: "AI returned unexpected format." });
    }

    // Log success
    console.log("[AI SUCCESS]", JSON.stringify({
      time: new Date().toISOString(),
      ip,
      pricesReturned: Object.keys(parsed.prices).length
    }));

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
