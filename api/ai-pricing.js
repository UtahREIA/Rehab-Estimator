export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
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

  // ── RATE LIMITING — 6 calls/hour per IP (2 batches × 3 clicks) ───────────
  if (!global._aiRateMap) global._aiRateMap = new Map();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxCalls = 6;
  const record = global._aiRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._aiRateMap.set(ip, record);
  if (record.count > maxCalls) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    console.warn(`[RATE LIMIT] IP: ${ip}, calls: ${record.count}`);
    return res.status(429).json({
      error: `Rate limit exceeded. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`
    });
  }

  // ── API KEY ───────────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server configuration error." });

  // ── INPUT VALIDATION ──────────────────────────────────────────────────────
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid request body." });
  }
  if (items.length > 150) {
    return res.status(400).json({ error: "Too many items. Max 150 per batch." });
  }

  const cleanItems = items.map(it => ({
    cat:   String(it.cat   || "").substring(0, 60).replace(/[^a-zA-Z0-9 &/\-.()]/g, ""),
    label: String(it.label || "").substring(0, 100).replace(/[^a-zA-Z0-9 &/\-.()]/g, ""),
    unit:  String(it.unit  || "LS").substring(0, 20).replace(/[^a-zA-Z]/g, "")
  })).filter(it => it.cat && it.label);

  if (cleanItems.length === 0) {
    return res.status(400).json({ error: "No valid items after sanitization." });
  }

  console.log("[AI REQUEST]", JSON.stringify({
    time: new Date().toISOString(), ip,
    itemCount: cleanItems.length,
    origin: origin || "unknown"
  }));

  // ── PROMPTS ───────────────────────────────────────────────────────────────
  const systemPrompt =
    `You are a Utah construction cost database (Salt Lake City/Utah County, Q1 2025). ` +
    `Output ONLY valid JSON — no markdown, no explanation, no extra text. ` +
    `Every response must start with { and be parseable by JSON.parse().`;

  const itemLines = cleanItems.map((it, idx) =>
    `${idx + 1}. "${it.cat}|${it.label}" [${it.unit}]`
  ).join("\n");

  const userPrompt =
    `Return mid-range Utah contractor prices for each item.\n` +
    `JSON: {"prices":{"<key>":{"labor":<num>,"material":<num>}}}\n` +
    `Rules: labor=labor/unit, material=material/unit, numbers only, no $.\n` +
    `LS items: labor=lump sum total, material=0.\n` +
    `Units: SF=sqft, LF=linear ft, EA=each, LS=lump sum, SQ=100sqft, CY=cu yd, HR=hour.\n` +
    `Use exact key string with | separator.\n\nItems:\n${itemLines}`;

  // ── OPENAI CALL with 50s timeout ─────────────────────────────────────────
  const TIMEOUT_MS = 50000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
        max_tokens: 5000,         // ~88 items × ~40 tokens = ~3500, 5000 gives headroom
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!openaiRes.ok) {
      const errData = await openaiRes.json().catch(() => ({}));
      console.error("[OPENAI ERROR]", JSON.stringify(errData));
      if (openaiRes.status === 429) {
        return res.status(429).json({ error: "OpenAI rate limit reached. Please wait 1–2 minutes and try again." });
      }
      return res.status(502).json({ error: "AI service error. Please try again." });
    }

    const data = await openaiRes.json();
    let text = (data?.choices?.[0]?.message?.content || "").trim();

    // Strip any accidental fences
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    // Extract JSON block if needed
    if (!text.startsWith("{")) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) text = match[0];
      else {
        console.error("[NO JSON FOUND]", text.substring(0, 200));
        return res.status(502).json({ error: "AI returned invalid data. Please try again." });
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Try to repair truncated JSON
      try {
        let fixed = text.replace(/,\s*\}/g, "}").replace(/,\s*\]/g, "]");
        const opens  = (fixed.match(/\{/g) || []).length;
        const closes = (fixed.match(/\}/g) || []).length;
        if (opens > closes) fixed += "}".repeat(opens - closes);
        parsed = JSON.parse(fixed);
        console.warn("[JSON REPAIRED]");
      } catch (e2) {
        console.error("[JSON PARSE FAILED]", text.substring(0, 200));
        return res.status(502).json({ error: "AI returned invalid data. Please try again." });
      }
    }

    if (!parsed || typeof parsed.prices !== "object") {
      return res.status(502).json({ error: "AI returned unexpected format. Please try again." });
    }

    // Coerce all values to clean numbers
    const sanitizedPrices = {};
    for (const [key, val] of Object.entries(parsed.prices)) {
      if (val && typeof val === "object") {
        sanitizedPrices[key] = {
          labor:    parseFloat(String(val.labor    || "0").replace(/[^0-9.]/g, "")) || 0,
          material: parseFloat(String(val.material || "0").replace(/[^0-9.]/g, "")) || 0
        };
      }
    }

    console.log("[AI SUCCESS]", JSON.stringify({
      time: new Date().toISOString(), ip,
      itemsSent: cleanItems.length,
      pricesReturned: Object.keys(sanitizedPrices).length
    }));

    return res.status(200).json({ prices: sanitizedPrices });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("[TIMEOUT]", TIMEOUT_MS / 1000, "s exceeded");
      return res.status(504).json({ error: "Request timed out. Please try again." });
    }
    console.error("[PROXY ERROR]", err.message);
    return res.status(500).json({ error: "Internal server error." });
  }
}