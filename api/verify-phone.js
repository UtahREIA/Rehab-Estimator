// Vercel serverless function to verify phone number using Airtable

const Airtable = require('airtable');

// CORS middleware for Vercel serverless function
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { phone } = req.body;
  if (!phone) {
    res.status(400).json({ error: 'Phone number required' });
    return;
  }

  // Airtable credentials from Vercel environment variables
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
    res.status(500).json({ error: 'Airtable environment variables missing' });
    return;
  }

  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

  try {
    let found = false;
    await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{Phone} = '${phone}'`,
        maxRecords: 1
      })
      .eachPage((records, fetchNextPage) => {
        if (records.length > 0) {
          found = true;
        }
        fetchNextPage();
      });
    res.status(200).json({ valid: found });
  } catch (error) {
    res.status(500).json({ error: 'Airtable error', details: error.message });
  }
};
