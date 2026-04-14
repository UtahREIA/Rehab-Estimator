/**
 * /api/cancel-subscription.js
 *
 * GHL Webhook — fires when a Build Scope AI / Rehab Estimator subscription
 * is cancelled. Finds the subscriber by phone and sets their status to Inactive,
 * records the cancellation date, and marks Subscription Cancelled = true.
 *
 * GHL Workflow Action → Webhook → POST https://<vercel-domain>/api/cancel-subscription
 *
 * GHL Webhook Body (map these fields in GHL's webhook builder):
 *   {
 *     "phone": "{{contact.phone}}",
 *     "name":  "{{contact.name}}",       ← optional
 *     "email": "{{contact.email}}"       ← optional
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
      console.warn("[CANCEL] Unauthorized webhook call — bad secret");
      return res.status(401).json({ error: "Unauthorized." });
    }
  }

  // ── PARSE BODY ───────────────────────────────────────────────────────────────
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  const phone = body.phone || body.Phone || body.contact?.phone || "";
  const name  = body.name  || body.Name  || body.contact?.name  || "";
  const email = body.email || body.Email || body.contact?.email || "";

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
    // ── FIND SUBSCRIBER ──────────────────────────────────────────────────────
    const searchRes  = await fetch(
      `${BASE_URL}?filterByFormula=${encodeURIComponent(phoneFormula)}`,
      { headers }
    );
    const searchData = await searchRes.json();

    if (!searchData.records || searchData.records.length === 0) {
      // Subscriber not found — log and return a soft warning (don't hard-fail,
      // as GHL may fire the cancel webhook for contacts not yet in Airtable)
      console.warn(`[CANCEL] Subscriber not found in Airtable: ${normalizedPhone}`);
      return res.status(200).json({
        success: false,
        warning: "Subscriber not found in Airtable. No record updated.",
        phone: normalizedPhone
      });
    }

    // ── UPDATE TO INACTIVE ───────────────────────────────────────────────────
    const recordId = searchData.records[0].id;

    const updateFields = {
      "Subscription Status":    "Inactive",
      "Subscription Cancelled": true,
      "Expiring Date":          today,  // treat cancellation date as effective expiry
    };
    if (name)  updateFields["Name"]  = name;
    if (email) updateFields["Email"] = email;

    await fetch(`${BASE_URL}/${recordId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: updateFields })
    });

    console.log(`[CANCEL] Marked inactive: ${normalizedPhone} on ${today}`);

    // ── UPDATE GHL CUSTOM FIELD ──────────────────────────────────────────────
    const GHL_KEY      = process.env.GHL_API_KEY;
    const GHL_LOCATION = process.env.GHL_LOCATION_ID;

    if (GHL_KEY && GHL_LOCATION) {
      try {
        const ghlHeaders = {
          Authorization:  `Bearer ${GHL_KEY}`,
          "Content-Type": "application/json",
          Version:        "2021-07-28"
        };

        const upsertRes  = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
          method: "POST",
          headers: ghlHeaders,
          body: JSON.stringify({
            locationId: GHL_LOCATION,
            phone: normalizedPhone,
            customFields: [
              { key: "rehab_subscription_status", field_value: "Inactive" }
            ]
          })
        });
        const upsertData = await upsertRes.json();
        const contactId  = upsertData?.contact?.id || upsertData?.contact?._id || upsertData?.id;
        if (contactId) {
          console.log(`[CANCEL] GHL custom field set to Inactive for contact ${contactId}`);
        }
      } catch (ghlErr) {
        console.error("[CANCEL] GHL update failed (non-fatal):", ghlErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      action:  "cancelled",
      phone:   normalizedPhone,
      cancelledOn: today
    });

  } catch (err) {
    console.error("[CANCEL] Airtable error:", err.message);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
