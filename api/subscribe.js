/**
 * /api/subscribe.js
 *
 * GHL Webhook — fires when a new Build Scope AI / Rehab Estimator subscription
 * is successfully purchased. Creates or updates a record in the
 * "Rehab Estimator Subscribers" Airtable table, sets status to Active,
 * auto-calculates a 1-month expiry, and enrolls the contact in a GHL
 * reminder workflow that fires 5 days before expiration.
 *
 * GHL Workflow Action → Webhook → POST https://<vercel-domain>/api/subscribe
 *
 * GHL Webhook Body:
 *   {
 *     "phone": "{{contact.phone}}",
 *     "name":  "{{contact.name}}",
 *     "email": "{{contact.email}}"
 *   }
 *
 * Required Vercel env vars:
 *   AIRTABLE_API_KEY_REHAB       — Airtable personal access token
 *   AIRTABLE_BASE_ID_REHAB       — Airtable base ID (starts with "app…")
 *   WEBHOOK_SECRET_REHAB         — Secret header GHL passes (x-webhook-secret)
 *
 * Optional (for GHL reminder workflow enrollment):
 *   GHL_API_KEY                  — GoHighLevel API key
 *   GHL_LOCATION_ID              — GHL location/sub-account ID
 *   GHL_REMINDER_WORKFLOW_ID     — ID of the GHL workflow that sends the renewal reminder
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

  const phone = body.phone || body.Phone || body.contact?.phone || "";
  const name  = body.name  || body.Name  || body.contact?.name  || body.contact?.full_name || "";
  const email = body.email || body.Email || body.contact?.email || "";

  if (!phone) {
    return res.status(400).json({ error: "No phone provided in webhook payload." });
  }

  const normalizedPhone = String(phone).replace(/\D/g, "").slice(-10);
  if (normalizedPhone.length < 10) {
    return res.status(400).json({ error: `Invalid phone number: "${phone}"` });
  }

  // ── DATE CALCULATIONS ────────────────────────────────────────────────────────
  const now          = new Date();
  const today        = now.toISOString().split("T")[0];

  // Expiring date = exactly 1 month from today
  const expireDate   = new Date(now);
  expireDate.setMonth(expireDate.getMonth() + 1);
  const expiringDateStr = expireDate.toISOString().split("T")[0];

  // Reminder date = 5 days before expiration
  const reminderDate = new Date(expireDate);
  reminderDate.setDate(reminderDate.getDate() - 5);
  const reminderDateStr = reminderDate.toISOString().split("T")[0];

  // ── AIRTABLE SETUP ───────────────────────────────────────────────────────────
  const AIRTABLE_KEY   = process.env.AIRTABLE_API_KEY_REHAB;
  const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID_REHAB;
  const AIRTABLE_TABLE = "Rehab Estimator Subscribers";

  if (!AIRTABLE_KEY || !AIRTABLE_BASE) {
    return res.status(500).json({ error: "Missing Airtable env vars." });
  }

  const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`;
  const atHeaders = {
    Authorization:  `Bearer ${AIRTABLE_KEY}`,
    "Content-Type": "application/json"
  };

  const phoneFormula =
    `RIGHT(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Phone Number},'(',''),')',''),'-',''),' ',''),10)='${normalizedPhone}'`;

  try {
    // ── CHECK FOR EXISTING RECORD ──────────────────────────────────────────────
    const searchRes  = await fetch(
      `${BASE_URL}?filterByFormula=${encodeURIComponent(phoneFormula)}`,
      { headers: atHeaders }
    );
    const searchData = await searchRes.json();

    let action;

    if (searchData.records && searchData.records.length > 0) {
      // ── UPDATE EXISTING SUBSCRIBER ───────────────────────────────────────────
      const recordId       = searchData.records[0].id;
      const existingFields = searchData.records[0].fields || {};

      const updateFields = {
        "Subscription Status":    "Active",
        "Subscription Cancelled": false,
        "Date Subscribed": existingFields["Date Subscribed"] || today,
        "Expiring Date":   expiringDateStr,
        "Reminder Date":   reminderDateStr,
      };
      if (name)  updateFields["Name"]  = name;
      if (email) updateFields["Email"] = email;

      await fetch(`${BASE_URL}/${recordId}`, {
        method: "PATCH",
        headers: atHeaders,
        body: JSON.stringify({ fields: updateFields })
      });

      action = "updated";
      console.log(`[SUBSCRIBE] Updated existing subscriber: ${normalizedPhone} | expires: ${expiringDateStr} | reminder: ${reminderDateStr}`);

    } else {
      // ── CREATE NEW SUBSCRIBER ────────────────────────────────────────────────
      await fetch(BASE_URL, {
        method: "POST",
        headers: atHeaders,
        body: JSON.stringify({
          fields: {
            "Phone Number":           normalizedPhone,
            "Name":                   name  || "",
            "Email":                  email || "",
            "Date Subscribed":        today,
            "Expiring Date":          expiringDateStr,
            "Reminder Date":          reminderDateStr,
            "Subscription Status":    "Active",
            "Subscription Cancelled": false,
          }
        })
      });

      action = "created";
      console.log(`[SUBSCRIBE] Created new subscriber: ${normalizedPhone} | expires: ${expiringDateStr} | reminder: ${reminderDateStr}`);
    }

    // ── GHL REMINDER WORKFLOW ENROLLMENT ────────────────────────────────────────
    // Enrolls the contact in a GHL workflow set up to send a renewal reminder.
    // The workflow fires on the eventStartTime passed below (5 days before expiry).
    // Requires: GHL_API_KEY, GHL_LOCATION_ID, GHL_REMINDER_WORKFLOW_ID in Vercel env.
    const GHL_KEY         = process.env.GHL_BUILDSCOPE_API_KEY;
    const GHL_LOCATION    = process.env.GHL_LOCATION_ID;
    const GHL_WORKFLOW_ID = process.env.GHL_REMINDER_WORKFLOW_ID;

    if (GHL_KEY && GHL_LOCATION && GHL_WORKFLOW_ID) {
      try {
        const ghlHeaders = {
          Authorization:  `Bearer ${GHL_KEY}`,
          "Content-Type": "application/json",
          Version:        "2021-07-28"
        };

        // 1) Upsert contact in GHL to get contactId + set Rehab Subscription Status = Active
        const upsertRes  = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
          method: "POST",
          headers: ghlHeaders,
          body: JSON.stringify({
            locationId: GHL_LOCATION,
            phone: normalizedPhone,
            ...(name  ? { name  } : {}),
            ...(email ? { email } : {}),
            customFields: [
              { key: "rehab_subscription_status", field_value: "Active" }
            ]
          })
        });
        const upsertData = await upsertRes.json();
        const contactId  = upsertData?.contact?.id || upsertData?.contact?._id || upsertData?.id;

        if (contactId) {
          // 2) Enroll in reminder workflow, starting on the reminder date
          await fetch(
            `https://services.leadconnectorhq.com/contacts/${contactId}/workflow/${GHL_WORKFLOW_ID}`,
            {
              method: "POST",
              headers: ghlHeaders,
              body: JSON.stringify({ eventStartTime: reminderDate.toISOString() })
            }
          );
          console.log(`[SUBSCRIBE] Enrolled ${contactId} in GHL reminder workflow — fires ${reminderDateStr}`);
        } else {
          console.warn("[SUBSCRIBE] GHL upsert succeeded but no contactId returned.");
        }
      } catch (ghlErr) {
        // Non-fatal — Airtable record already saved; log and continue
        console.error("[SUBSCRIBE] GHL reminder enrollment failed:", ghlErr.message);
      }
    } else {
      console.log("[SUBSCRIBE] GHL reminder skipped — GHL_API_KEY / GHL_LOCATION_ID / GHL_REMINDER_WORKFLOW_ID not set.");
    }

    return res.status(200).json({
      success:      true,
      action,
      phone:        normalizedPhone,
      expiringDate: expiringDateStr,
      reminderDate: reminderDateStr,
    });

  } catch (err) {
    console.error("[SUBSCRIBE] Error:", err.message);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
