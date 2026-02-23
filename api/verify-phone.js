export default async function handler(req, res) {

  // CORS is handled entirely by vercel.json — no manual headers needed here

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── IP EXTRACTION ────────────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  // ── IN-MEMORY RATE LIMITING ───────────────────────────────────────────────
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
    .split(",").map(p => p.trim().replace(/\D/g, "")).filter(Boolean);
  const isValid = allowedPhones.length === 0 || allowedPhones.includes(cleanPhone);

  // ── ACCESS LOG ────────────────────────────────────────────────────────────
  console.log("[ACCESS LOG]", JSON.stringify({
    time: new Date().toISOString(),
    ip,
    phone: cleanPhone.slice(0, 6) + "****",
    result: isValid ? "GRANTED" : "DENIED",
    userAgent: req.headers["user-agent"]?.substring(0, 80) || "unknown"
  }));

  if (isValid) {
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
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
