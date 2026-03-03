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
  const maxCalls = 10;
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

  // ── BUILD PROMPTS ─────────────────────────────────────────────────────────
  const systemPrompt =
    `You are a Utah construction cost estimator (Salt Lake City / Utah County, Q1 2025 rates). ` +
    `You ONLY output raw JSON — no markdown, no code fences, no explanation, no extra text of any kind. ` +
    `Your output must start with { and end with } and be valid JSON parseable by JSON.parse().`;

  const itemLines = cleanItems.map((it, idx) =>
    `${idx + 1}. key="${it.cat}|${it.label}" unit=${it.unit}`
  ).join("\n");

  const userPrompt =
    `Price each item below for a mid-range Utah contractor. ` +
    `Return EXACTLY this JSON structure, one entry per item:\n` +
    `{"prices":{"<key>":{"labor":<number>,"material":<number>,"qty":<number>}}}\n\n` +
    `Rules:\n` +
    `- labor: cost of labor per unit (number only, no $ or commas)\n` +
    `- material: cost of materials per unit (number only, no $ or commas)\n` +
    `- qty: typical default quantity (e.g. 1200 for SF paint, 1 for EA/LS, 40 for LF gutters)\n` +
    `- For LS items: labor = full contractor lump sum, material = 0, qty = 1\n` +
    `- Units: SF=per sqft, LF=per linear ft, EA=per item, LS=lump sum, SQ=per 100sqft, CY=per cubic yard, HR=per hour\n` +
    `- Use the EXACT key string shown (including the | separator)\n\n` +
    `Items:\n${itemLines}`;

  // ── OPENAI CALL ───────────────────────────────────────────────────────────
  const OPENAI_TIMEOUT_MS = 55000;
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
        max_tokens: 6000,
        temperature: 0,
        seed: 42,
        // response_format json_object forces the model to ONLY output valid JSON —
        // eliminates markdown fences, preamble text, and all other non-JSON output
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!openaiRes.ok) {
      const errData = await openaiRes.json().catch(() => ({}));
      console.error("[OPENAI ERROR]", JSON.stringify(errData));
      return res.status(502).json({ error: "AI service error. Please try again." });
    }

    const data = await openaiRes.json();
    let text = (data?.choices?.[0]?.message?.content || "").trim();

    // Strip any accidental markdown fences (safety net — json_object mode shouldn't produce these)
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    // If somehow the response doesn't start with {, extract the first JSON block
    if (!text.startsWith("{")) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        text = match[0];
      } else {
        console.error("[NO JSON FOUND] Raw:", text.substring(0, 300));
        return res.status(502).json({ error: "AI returned invalid data. Please try again." });
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Last resort: try to repair truncated JSON by closing unclosed braces
      try {
        let fixed = text.replace(/,\s*\}/g, "}").replace(/,\s*\]/g, "]");
        const opens  = (fixed.match(/\{/g) || []).length;
        const closes = (fixed.match(/\}/g) || []).length;
        if (opens > closes) fixed += "}".repeat(opens - closes);
        parsed = JSON.parse(fixed);
        console.warn("[JSON REPAIRED] Auto-fixed truncated response");
      } catch (e2) {
        console.error("[JSON PARSE FAILED] text:", text.substring(0, 300));
        return res.status(502).json({ error: "AI returned invalid data. Please try again." });
      }
    }

    if (!parsed || typeof parsed.prices !== "object") {
      console.error("[BAD FORMAT] Keys received:", Object.keys(parsed || {}));
      return res.status(502).json({ error: "AI returned unexpected format. Please try again." });
    }

    // Coerce all values to numbers (guard against AI returning string values like "$45.00")
    const sanitizedPrices = {};
    for (const [key, val] of Object.entries(parsed.prices)) {
      if (val && typeof val === "object") {
        sanitizedPrices[key] = {
          labor:    parseFloat(String(val.labor).replace(/[^0-9.]/g, ""))    || 0,
          material: parseFloat(String(val.material).replace(/[^0-9.]/g, "")) || 0,
          qty:      parseFloat(String(val.qty).replace(/[^0-9.]/g, ""))      || 1
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
      console.error("[TIMEOUT] AI request exceeded", OPENAI_TIMEOUT_MS / 1000, "s");
      return res.status(504).json({ error: "Request timed out. Please try again." });
    }
    console.error("[PROXY ERROR]", err.message);
    return res.status(500).json({ error: "Internal server error." });
  }
}
