/**
 * /api/subscribe.js
 *
 * GHL Webhook — fires when a new Build Scope AI / Rehab Estimator subscription
 * is successfully purchased. Creates or updates a record in the
 * "Rehab Estimator Subscribers" Airtable table and sets status to Active.
 *
 * GHL Workflow Action → Webhook → POST https://<vercel-domain>/api/subscribe
 *
 * GHL Webhook Body (map these fields in GHL's webhook builder):
 *   {
 *     "phone":            "{{contact.phone}}",
 *     "name":             "{{contact.name}}",
 *     "email":            "{{contact.email}}",
 *     "date_subscribed":  "{{now}}",          ← or leave blank, server fills it
 *     "expiring_date":    "{{subscription.nextBillingDate}}"  ← optional
 *   }
 *
 * Required Vercel env vars:
 *   AIRTABLE_API_KEY_REHAB   — Airtable personal access token
 *   AIRTABLE_BASE_ID_REHAB   — Airtable base ID (starts with "app…")
 *   WEBHOOK_SECRET_REHAB     — Secret token GHL passes to authenticate the call
 *                              (add as header: x-webhook-secret: <secret>)
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-webhook-secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── WEBHOOK SECRET AUTH ──────────────────────────────────────────────────────
  const expectedSecret = process.env.WEBHOOK_SECRET_REHAB;
  if (expectedSecret) {
    const providedSecret = req.headers["x-webhook-secret"] || (req.body || {}).webhook_secret;
    if (providedSecret !== expectedSecret) {
      console.warn("[SUBSCRIBE] Unauthorized webhook call — bad secret");
      return res.status(401).json({ error: "Unauthorized." });
    }
  }

  // ── PARSE BODY ───────────────────────────────────────────────────────────────
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  // GHL may nest contact data or send it flat
  const phone         = body.phone         || body.Phone         || body.contact?.phone         || "";
  const name          = body.name          || body.Name          || body.contact?.name          || body.contact?.full_name || "";
  const email         = body.email         || body.Email         || body.contact?.email         || "";
  const expiringDate  = body.expiring_date || body.expiringDate  || body.next_billing_date      || "";
  const dateSubscribed = body.date_subscribed || body.dateSubscribed || "";

  if (!phone) {
    return res.status(400).json({ error: "No phone provided in webhook payload." });
  }

  const normalizedPhone = String(phone).replace(/\D/g, "").slice(-10);
  if (normalizedPhone.length < 10) {
    return res.status(400).json({ error: `Invalid phone number: "${phone}"` });
  }

  // ── AIRTABLE SETUP ───────────────────────────────────────────────────────────
  const AIRTABLE_KEY   = process.env.AIRTABLE_API_KEY_REHAB;
  const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID_REHAB;
  const AIRTABLE_TABLE = "Rehab Estimator Subscribers";

  if (!AIRTABLE_KEY || !AIRTABLE_BASE) {
    return res.status(500).json({ error: "Missing Airtable env vars." });
  }

  const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`;
  const headers  = {
    Authorization:  `Bearer ${AIRTABLE_KEY}`,
    "Content-Type": "application/json"
  };

  const today = new Date().toISOString().split("T")[0];

  const phoneFormula =
    `RIGHT(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Phone Number},'(',''),')',''),'-',''),' ',''),10)='${normalizedPhone}'`;

  try {
    // ── CHECK FOR EXISTING RECORD ──────────────────────────────────────────────
    const searchRes  = await fetch(
      `${BASE_URL}?filterByFormula=${encodeURIComponent(phoneFormula)}`,
      { headers }
    );
    const searchData = await searchRes.json();

    if (searchData.records && searchData.records.length > 0) {
      // ── UPDATE EXISTING SUBSCRIBER ───────────────────────────────────────────
      const recordId       = searchData.records[0].id;
      const existingFields = searchData.records[0].fields || {};

      const updateFields = {
        "Subscription Status":    "Active",
        "Subscription Cancelled": false,
        // Keep original Date Subscribed if already set; otherwise stamp today
        "Date Subscribed": existingFields["Date Subscribed"] || dateSubscribed || today,
      };
      if (name)          updateFields["Name"]          = name;
      if (email)         updateFields["Email"]         = email;
      if (expiringDate)  updateFields["Expiring Date"] = expiringDate;

      await fetch(`${BASE_URL}/${recordId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: updateFields })
      });

      console.log(`[SUBSCRIBE] Updated existing subscriber: ${normalizedPhone}`);
      return res.status(200).json({ success: true, action: "updated", phone: normalizedPhone });

    } else {
      // ── CREATE NEW SUBSCRIBER ────────────────────────────────────────────────
      const createFields = {
        "Phone Number":           normalizedPhone,
        "Name":                   name  || "",
        "Email":                  email || "",
        "Date Subscribed":        dateSubscribed || today,
        "Expiring Date":          expiringDate   || "",
        "Subscription Status":    "Active",
        "Subscription Cancelled": false,
      };

      await fetch(BASE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ fields: createFields })
      });

      console.log(`[SUBSCRIBE] Created new subscriber: ${normalizedPhone}`);
      return res.status(200).json({ success: true, action: "created", phone: normalizedPhone });
    }

  } catch (err) {
    console.error("[SUBSCRIBE] Airtable error:", err.message);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
