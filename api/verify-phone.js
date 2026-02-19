export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ valid: false, error: 'No phone provided.' });
  }

  // Add your phone whitelist logic here, or connect to your CRM/database
  // Example: check against an environment variable list
  const allowedPhones = (process.env.ALLOWED_PHONES || '').split(',').map(p => p.trim().replace(/\D/g, ''));
  const cleanPhone = phone.replace(/\D/g, '');

  // If no list configured, allow all (open access) — add numbers to ALLOWED_PHONES env var
  if (allowedPhones.length === 0 || allowedPhones.includes('') || allowedPhones.includes(cleanPhone)) {
    return res.status(200).json({ valid: true });
  }

  return res.status(200).json({ valid: false });
}
