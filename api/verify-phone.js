// Vercel serverless function to verify phone number using Airtable

const axios = require('axios');

// CORS middleware for Vercel serverless function
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    setCors(res);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone } = req.body;
  if (!phone) {
    setCors(res);
    return res.status(400).json({ error: 'Phone number required' });
  }

  // Airtable credentials from Vercel environment variables
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
    setCors(res);
    return res.status(500).json({ error: 'Airtable environment variables missing' });
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  const filterByFormula = `filterByFormula=${encodeURIComponent(`{Phone} = '${phone}'`)}&maxRecords=1`;

  try {
    const response = await axios.get(`${url}?${filterByFormula}`, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });
    const found = response.data.records && response.data.records.length > 0;
    setCors(res);
    return res.status(200).json({ valid: found });
  } catch (error) {
    setCors(res);
    return res.status(500).json({ error: 'Airtable error', details: error.message });
  }
};
