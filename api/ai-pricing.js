export default async function handler(req, res) {

  // ── CORS ─────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || "";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(o => o.trim()).filter(Boolean);

  const isAllowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", isAllowed ? (origin || "*") : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  if (!isAllowed) {
    console.warn(`[CORS BLOCKED] Origin: ${origin}`);
    return res.status(403).json({ error: "Forbidden origin." });
  }

  // ── IP ────────────────────────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  // ── RATE LIMITING — 10 calls/hour per IP ─────────────────────────────────
  if (!global._aiRateMap) global._aiRateMap = new Map();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxCalls = 10; // raised from 5 — batched calls from one session count separately
  const record = global._aiRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._aiRateMap.set(ip, record);
  if (record.count > maxCalls) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    console.warn(`[RATE LIMIT] AI endpoint — IP: ${ip}, calls: ${record.count}`);
    return res.status(429).json({ error: `Rate limit exceeded. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.` });
  }

  // ── API KEY ───────────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server configuration error." });

  // ── INPUT VALIDATION & SANITIZATION ──────────────────────────────────────
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid request body." });
  }
  if (items.length > 300) {
    return res.status(400).json({ error: "Too many items in request." });
  }

  const cleanItems = items.map(it => ({
    cat:   String(it.cat   || "").substring(0, 60).replace(/[^a-zA-Z0-9 &/\-().]/g, ""),
    label: String(it.label || "").substring(0, 100).replace(/[^a-zA-Z0-9 &/\-().]/g, ""),
    unit:  String(it.unit  || "LS").substring(0, 20)
  })).filter(it => it.cat && it.label);

  console.log("[AI REQUEST]", JSON.stringify({
    time: new Date().toISOString(), ip,
    itemCount: cleanItems.length,
    origin: origin || "unknown"
  }));

  // ── SYSTEM PROMPT ─────────────────────────────────────────────────────────
  const systemPrompt = `You are a deterministic construction cost database for Utah (Salt Lake City / Utah County market), locked to Q1 2025 rates.

Your only job is to return fixed, consistent mid-range contractor prices. You must return the EXACT SAME prices every time for the same inputs — no variation, no ranges, no rounding differently between calls. Always pick the single mid-point value of the typical Utah contractor range and never deviate from it.

Pricing is per unit of measure:
- SF = Square Foot, LF = Linear Feet, EA = Each, LS = Lump Sum, SQ = Roofing Square (100 sqft), CY = Cubic Yard, HR = Hour, PCT = Percentage`;

  // ── OPENAI CALL ───────────────────────────────────────────────────────────
  // Timeout: 55s — Vercel maxDuration is 60s, leaving 5s buffer for overhead
  const OPENAI_TIMEOUT_MS = 55000;

  const userPrompt = `Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{"prices":{"Category|Label":{"labor":number,"material":number,"qty":number}}}

Pricing rules:
- labor = labor cost per unit of measure
- material = material cost per unit of measure  
- qty = typical default quantity for this item (e.g. 1200 for SF flooring, 1 for EA items, etc.)
- Numbers only — no $ signs, no commas, always the same value every call
- For Lump Sum (LS) items: set qty=1, labor=all-in contractor total, material=0

Items to price (format: Category|Label [UNIT]):
${cleanItems.map(it => `${it.cat}|${it.label} [${it.unit}]`).join("\n")}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

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
        max_tokens: 6000,  // raised from 4000 to handle larger batches
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

    console.log("[AI SUCCESS]", JSON.stringify({
      time: new Date().toISOString(), ip,
      pricesReturned: Object.keys(parsed.prices).length
    }));

    return res.status(200).json({ prices: parsed.prices });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("[TIMEOUT] AI request exceeded", OPENAI_TIMEOUT_MS / 1000, "seconds");
      return res.status(504).json({ error: "Request timed out. Please try again." });
    }
    console.error("[PROXY ERROR]", err.message);
    return res.status(500).json({ error: "Internal server error." });
  }
}
