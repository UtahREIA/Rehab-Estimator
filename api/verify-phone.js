export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, captcha } = req.body;

  // ── 1. Validate inputs ────────────────────────────────────────────────────
  if (!phone) {
    return res.status(400).json({ valid: false, message: 'No phone number provided.' });
  }

  if (!captcha) {
    return res.status(400).json({ valid: false, message: 'CAPTCHA token missing. Please complete the verification.' });
  }

  // ── 2. Verify reCAPTCHA token with Google ─────────────────────────────────
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  if (!recaptchaSecret) {
    console.error('RECAPTCHA_SECRET_KEY environment variable is not set.');
    return res.status(500).json({ valid: false, message: 'Server configuration error.' });
  }

  try {
    const recaptchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: recaptchaSecret,
        response: captcha,
      }),
    });

    const recaptchaData = await recaptchaRes.json();

    if (!recaptchaData.success) {
      console.warn('reCAPTCHA failed:', recaptchaData['error-codes']);
      return res.status(400).json({
        valid: false,
        message: 'CAPTCHA verification failed. Please try again.',
      });
    }
  } catch (err) {
    console.error('reCAPTCHA verification error:', err);
    return res.status(502).json({
      valid: false,
      message: 'Could not verify CAPTCHA. Please check your connection and try again.',
    });
  }

  // ── 3. Verify phone number ────────────────────────────────────────────────
  const cleanPhone = phone.replace(/\D/g, '');

  const allowedPhones = (process.env.ALLOWED_PHONES || '')
    .split(',')
    .map(p => p.trim().replace(/\D/g, ''))
    .filter(Boolean); // remove empty strings

  // If ALLOWED_PHONES is not configured, allow all verified users
  if (allowedPhones.length === 0 || allowedPhones.includes(cleanPhone)) {
    return res.status(200).json({ valid: true });
  }

  return res.status(200).json({
    valid: false,
    message: 'Phone number not found. Please contact Utah REIA for access.',
  });
}
