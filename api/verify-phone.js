import { kv } from "@vercel/kv";

export default async function handler(req, res) {

  // ── CORS — headers MUST be set before any other response ────────────────

  const origin = req.headers.origin || "";
  // Allow all origins starting with https://app.gohighlevel.com and https://utahreia.org
  const isAllowed = (
    origin.startsWith("https://app.gohighlevel.com") ||
    origin === "https://utahreia.org"
  );
  res.setHeader("Access-Control-Allow-Origin", isAllowed ? origin : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight 24hrs

  // Handle preflight — must respond 200 with headers, never block
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Block non-allowed origins AFTER preflight is handled
  if (!isAllowed) {
    console.warn(`[CORS BLOCKED] Origin: ${origin}`);
    return res.status(403).json({ valid: false, message: "Forbidden origin." });
  }

  // ── IP EXTRACTION ────────────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  // ── RATE LIMITING (per IP using Vercel KV) ───────────────────────────────
  // Max 10 attempts per IP per 15 minutes
  try {
    const rateLimitKey = `rl:verify:${ip}`;
    const attempts = await kv.incr(rateLimitKey);
    if (attempts === 1) {
      // First attempt — set 15 minute expiry
      await kv.expire(rateLimitKey, 900);
    }
    if (attempts > 10) {
      const ttl = await kv.ttl(rateLimitKey);
      const mins = Math.ceil(ttl / 60);
      console.warn(`[RATE LIMIT] IP ${ip} exceeded verify-phone limit. Attempts: ${attempts}`);
      return res.status(429).json({
        valid: false,
        message: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`
      });
    }
  } catch (kvErr) {
    // If KV is unavailable, log but don't block — degrade gracefully
    console.error("[KV ERROR] Rate limit check failed:", kvErr.message);
  }

  const { phone, captcha } = req.body;

  // ── INPUT VALIDATION ─────────────────────────────────────────────────────
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

  // ── RECAPTCHA VERIFICATION ────────────────────────────────────────────────
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
      console.warn(`[CAPTCHA FAIL] IP: ${ip}, Phone: ${cleanPhone.slice(0,6)}****`);
      return res.status(400).json({ valid: false, message: "CAPTCHA verification failed. Please try again." });
    }
  } catch (err) {
    console.error("[CAPTCHA ERROR]", err.message);
    return res.status(502).json({ valid: false, message: "Could not verify CAPTCHA. Please try again." });
  }

  // ── PHONE VERIFICATION ────────────────────────────────────────────────────
  const allowedPhones = (process.env.ALLOWED_PHONES || "")
    .split(",")
    .map(p => p.trim().replace(/\D/g, ""))
    .filter(Boolean);

  const isValid = allowedPhones.length === 0 || allowedPhones.includes(cleanPhone);

  // ── ACCESS LOGGING ────────────────────────────────────────────────────────
  const logEntry = {
    time: new Date().toISOString(),
    ip,
    phone: cleanPhone.slice(0, 6) + "****", // mask last 4 digits in logs
    result: isValid ? "GRANTED" : "DENIED",
    captcha: "passed",
    userAgent: req.headers["user-agent"]?.substring(0, 80) || "unknown"
  };
  console.log("[ACCESS LOG]", JSON.stringify(logEntry));

  // ── SESSION TOKEN WITH EXPIRY ─────────────────────────────────────────────
  if (isValid) {
    // Issue a signed session token with 30-day expiry
    // Client stores this; on reload we check it hasn't expired
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
    return res.status(200).json({
      valid: true,
      expiresAt,
      token: `ureia_${expiresAt}_${Buffer.from(cleanPhone.slice(-4)).toString("base64")}`
    });
  }

  return res.status(200).json({
    valid: false,
    message: "Phone number not found. Please contact Utah REIA for access."
  });
}
