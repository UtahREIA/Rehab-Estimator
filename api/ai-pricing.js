// ============================================================
// Build Scope AI – Pricing Proxy
// State-based pricing: sends state + items to OpenAI, returns
// mid-range contractor prices for that specific market.
// Uses response_format:json_object + 50s timeout per request.
// Frontend fires 3 parallel requests (general/exterior/interior)
// so each is ~40-60 items — fast enough to complete in < 30s.
// ============================================================

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

  // ── RATE LIMITING — 30 req/hr per IP (3 parallel × 10 clicks) ─────────
  if (!global._aiRateMap) global._aiRateMap = new Map();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxCalls = 30;
  const record = global._aiRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._aiRateMap.set(ip, record);
  if (record.count > maxCalls) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Rate limit exceeded. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`
    });
  }

  // ── API KEY ───────────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server configuration error." });

  // ── INPUT VALIDATION ──────────────────────────────────────────────────────
  const { items, state: projectState } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid request body." });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: "Too many items per request. Max 50." });
  }

  // Validate state
  const US_STATES = [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
    "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
    "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
    "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
  ];

  const cleanState = typeof projectState === "string"
    ? projectState.trim().substring(0, 30)
    : "";

  if (!cleanState || !US_STATES.includes(cleanState)) {
    return res.status(400).json({ error: "Invalid or missing state." });
  }

  const cleanItems = items.map(it => ({
    cat:   String(it.cat   || "").substring(0, 60).replace(/[^a-zA-Z0-9 &/\-.()]/g, ""),
    label: String(it.label || "").substring(0, 100).replace(/[^a-zA-Z0-9 &/\-.()]/g, ""),
    unit:  String(it.unit  || "LS").substring(0, 20).replace(/[^a-zA-Z]/g, "")
  })).filter(it => it.cat && it.label);

  if (cleanItems.length === 0) {
    return res.status(400).json({ error: "No valid items after sanitization." });
  }

  console.log("[PRICE REQUEST]", JSON.stringify({
    time: new Date().toISOString(), ip,
    state: cleanState,
    itemCount: cleanItems.length,
    origin: origin || "unknown"
  }));

  // ── BUILD PROMPT ──────────────────────────────────────────────────────────
  const systemPrompt =
    `You are a construction cost database for ${cleanState}, United States. ` +
    `Return mid-range local contractor prices for Q1 2025 in ${cleanState}. ` +
    `Account for local labor markets, material costs, and regional pricing. ` +
    `Output ONLY valid JSON — no markdown, no explanation, no extra text. ` +
    `Start with { and end with }.`;

  const itemLines = cleanItems.map((it, idx) =>
    `${idx + 1}. "${it.cat}|${it.label}" [${it.unit}]`
  ).join("\n");

  const userPrompt =
    `Return ${cleanState} contractor prices for each item.\n` +
    `JSON: {"prices":{"<key>":{"labor":<number>,"material":<number>}}}\n\n` +
    `Rules:\n` +
    `- labor = labor cost per unit, material = material cost per unit\n` +
    `- Numbers only (no $ or commas). Reflect ${cleanState} local market rates.\n` +
    `- LS items: labor = full lump sum, material = 0\n` +
    `- Units: SF=sqft, LF=linear ft, EA=each, LS=lump sum, SQ=100sqft, CY=cubic yard, HR=hour\n` +
    `- Use exact key string with | separator\n\n` +
    `Items:\n${itemLines}`;

  // ── OPENAI CALL ───────────────────────────────────────────────────────────
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
        max_tokens: 2500,   // 40 items × ~35 tokens = ~1400, 2500 gives headroom
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
      // Repair truncated JSON
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

    console.log("[PRICE SUCCESS]", JSON.stringify({
      time: new Date().toISOString(), ip, state: cleanState,
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