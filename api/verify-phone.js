/**
 * /api/verify-phone.js
 *
 * Phone gate for the Utah REIA Rehab Estimator (paid tool).
 * Looks up the caller's phone in the "Rehab Estimator Subscribers" Airtable table.
 *   - Subscription Status = "Active"   → access granted
 *   - Subscription Status = "Inactive" → access denied (cancelled)
 *   - Not found                        → access denied (not subscribed)
 *
 * Required Vercel env vars:
 *   AIRTABLE_API_KEY_REHAB   — Airtable personal access token
 *   AIRTABLE_BASE_ID_REHAB   — Airtable base ID (starts with "app…")
 *   RECAPTCHA_SECRET_KEY     — Google reCAPTCHA v2/v3 secret key
 */

export default async function handler(req, res) {

  // ── ALLOWED ORIGINS ──────────────────────────────────────────────────────────
  const ALLOWED_ORIGINS = [
    "https://utahreia.org",
    "https://www.utahreia.org",
    "https://app.gohighlevel.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000"
  ];

  function setCorsHeaders(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`[ORIGIN BLOCKED] ${origin}`);
    return res.status(403).json({ valid: false, message: "Access denied." });
  }

  // ── IP EXTRACTION ────────────────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  // ── IN-MEMORY RATE LIMITING ──────────────────────────────────────────────────
  // Max 10 attempts per IP per 15 minutes
  if (!global._verifyRateMap) global._verifyRateMap = new Map();
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;
  const record = global._verifyRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._verifyRateMap.set(ip, record);
  if (record.count > maxAttempts) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    console.warn(`[RATE LIMIT] IP ${ip} — attempts: ${record.count}`);
    return res.status(429).json({
      valid: false,
      message: `Too many attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`
    });
  }

  // ── PARSE BODY ───────────────────────────────────────────────────────────────
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { phone, captcha } = body;

  // ── INPUT VALIDATION ─────────────────────────────────────────────────────────
  if (!phone || typeof phone !== "string") {
    return res.status(400).json({ valid: false, message: "No phone number provided." });
  }
  if (!captcha || typeof captcha !== "string") {
    return res.status(400).json({ valid: false, message: "CAPTCHA token missing." });
  }
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return res.status(400).json({ valid: false, message: "Invalid phone number format." });
  }
  const last10 = cleanPhone.slice(-10);

  // ── RECAPTCHA VERIFICATION ───────────────────────────────────────────────────
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  if (!recaptchaSecret) {
    console.error("[CONFIG] RECAPTCHA_SECRET_KEY not set");
    return res.status(500).json({ valid: false, message: "Server configuration error." });
  }
  try {
    const recaptchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: recaptchaSecret, response: captcha })
    });
    const recaptchaData = await recaptchaRes.json();
    if (!recaptchaData.success) {
      console.warn(`[CAPTCHA FAIL] IP: ${ip}, Phone: ${last10.slice(0, 6)}****`);
      return res.status(400).json({ valid: false, message: "CAPTCHA verification failed. Please try again." });
    }
  } catch (err) {
    console.error("[CAPTCHA ERROR]", err.message);
    return res.status(502).json({ valid: false, message: "Could not verify CAPTCHA. Please try again." });
  }

  // ── AIRTABLE LOOKUP ──────────────────────────────────────────────────────────
  const AIRTABLE_KEY    = process.env.AIRTABLE_API_KEY_REHAB;
  const AIRTABLE_BASE   = process.env.AIRTABLE_BASE_ID_REHAB;
  const AIRTABLE_TABLE  = "Rehab Estimator Subscribers";

  if (!AIRTABLE_KEY || !AIRTABLE_BASE) {
    console.error("[CONFIG] Missing AIRTABLE_API_KEY_REHAB or AIRTABLE_BASE_ID_REHAB");
    return res.status(500).json({ valid: false, message: "Server configuration error." });
  }

  const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`;
  const atHeaders = {
    Authorization: `Bearer ${AIRTABLE_KEY}`,
    "Content-Type": "application/json"
  };

  // Normalize stored phone to last 10 digits for comparison
  const phoneFormula =
    `RIGHT(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Phone Number},'(',''),')',''),'-',''),' ',''),10)='${last10}'`;

  let subscriber = null;
  try {
    const searchRes  = await fetch(
      `${BASE_URL}?filterByFormula=${encodeURIComponent(phoneFormula)}`,
      { headers: atHeaders }
    );
    const searchData = await searchRes.json();
    if (searchData.records && searchData.records.length > 0) {
      subscriber = searchData.records[0].fields;
    }
  } catch (err) {
    console.error("[AIRTABLE ERROR]", err.message);
    return res.status(502).json({ valid: false, message: "Verification service unavailable. Please try again." });
  }

  // ── ACCESS DECISION ──────────────────────────────────────────────────────────
  let result, message;

  if (!subscriber) {
    result  = false;
    message = "No active subscription found for this number. Please subscribe at utahreia.org to access the Rehab Estimator.";
  } else if ((subscriber["Subscription Status"] || "").toLowerCase() === "active") {
    result  = true;
    message = "Access granted.";
  } else {
    // Inactive / cancelled
    result  = false;
    message = "Your subscription is inactive. Please renew at utahreia.org to regain access.";
  }

  // ── ACCESS LOG ───────────────────────────────────────────────────────────────
  console.log("[ACCESS LOG]", JSON.stringify({
    time: new Date().toISOString(),
    ip,
    origin,
    phone: last10.slice(0, 6) + "****",
    subscriptionStatus: subscriber ? (subscriber["Subscription Status"] || "unknown") : "not found",
    result: result ? "GRANTED" : "DENIED",
    userAgent: req.headers["user-agent"]?.substring(0, 80) || "unknown"
  }));

  if (result) {
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
    return res.status(200).json({
      valid: true,
      expiresAt,
      token: `ureia_${expiresAt}_${Buffer.from(last10.slice(-4)).toString("base64")}`,
      name: subscriber["Name"] || ""
    });
  }

  return res.status(200).json({ valid: false, message });
}
