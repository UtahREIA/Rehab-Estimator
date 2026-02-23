export default async function handler(req, res) {

  // ── CORS — headers MUST be set before any other response ────────────────
  const origin = req.headers.origin || "";
  const isAllowed = (
    !origin ||
    origin.startsWith("https://app.gohighlevel.com") ||
    origin.startsWith("https://utahreia.org") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  );
  res.setHeader("Access-Control-Allow-Origin", isAllowed ? (origin || "*") : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

  // ── IN-MEMORY RATE LIMITING (no external dependency needed) ──────────────
  // Max 10 attempts per IP per 15 minutes
  if (!global._verifyRateMap) global._verifyRateMap = new Map();
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 10;
  const record = global._verifyRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._verifyRateMap.set(ip, record);

  if (record.count > maxAttempts) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    console.warn(`[RATE LIMIT] IP ${ip} exceeded verify-phone limit. Attempts: ${record.count}`);
    return res.status(429).json({
      valid: false,
      message: `Too many attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`
    });
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
      console.warn(`[CAPTCHA FAIL] IP: ${ip}, Phone: ${cleanPhone.slice(0, 6)}****`);
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
  console.log("[ACCESS LOG]", JSON.stringify({
    time: new Date().toISOString(),
    ip,
    phone: cleanPhone.slice(0, 6) + "****",
    result: isValid ? "GRANTED" : "DENIED",
    userAgent: req.headers["user-agent"]?.substring(0, 80) || "unknown"
  }));

  // ── RESPOND ───────────────────────────────────────────────────────────────
  if (isValid) {
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
