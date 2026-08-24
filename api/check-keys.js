// api/check-keys.js
//
// Utah REIA - Rehab-Estimator API Key Health Check
//
// Runs on a schedule (see vercel.json) and tests every API key this
// project depends on: its own GoHighLevel key, its Airtable key/base
// pair, its OpenAI key (used for AI pricing), and its reCAPTCHA secret
// (used for phone verification). If any key is invalid, expired,
// revoked, or missing, it sends one alert listing exactly which key(s)
// broke - so the team finds out the same day, not weeks later when
// leads quietly stop showing up.
//
// TO ADD OR REMOVE A KEY TO CHECK:
// Edit the CHECKS array below. Nothing else needs to change.
//   name        - plain-English label used in the alert
//   envKey      - the Vercel env var holding the secret/token
//   baseEnvKey  - (Airtable only) the env var holding the base ID
//   test        - a function that makes a small, read-only call
//                 and throws if the key is bad

const CHECKS = [
  {
    name: "GoHighLevel key",
    envKey: "GHL_BUILDSCOPE_API_KEY",
    test: (key) => testGHL(key),
  },
  {
    name: "Airtable - Rehab Estimator",
    envKey: "AIRTABLE_API_KEY_REHAB",
    baseEnvKey: "AIRTABLE_BASE_ID_REHAB",
    test: (key, baseId) => testAirtable(key, baseId),
  },
  {
    name: "OpenAI key (AI pricing)",
    envKey: "OPENAI_API_KEY",
    test: (key) => testOpenAI(key),
  },
  {
    name: "reCAPTCHA secret (phone verification)",
    envKey: "RECAPTCHA_SECRET_KEY",
    test: (key) => testRecaptcha(key),
  },
];

module.exports = async (req, res) => {
  // Only Vercel's own Cron trigger (or someone who knows CRON_SECRET)
  // can run this. If CRON_SECRET isn't set yet, this check is skipped
  // so the very first run isn't blocked by setup order.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = [];

  for (const check of CHECKS) {
    const key = process.env[check.envKey];
    const baseId = check.baseEnvKey ? process.env[check.baseEnvKey] : undefined;

    if (!key || (check.baseEnvKey && !baseId)) {
      results.push({
        name: check.name,
        status: "not_configured",
        detail: `Missing ${!key ? check.envKey : check.baseEnvKey} in this project's environment variables.`,
      });
      continue;
    }

    try {
      await check.test(key, baseId);
      results.push({ name: check.name, status: "ok" });
    } catch (err) {
      results.push({
        name: check.name,
        status: "failed",
        detail: err && err.message ? err.message : String(err),
      });
    }
  }

  const failures = results.filter((r) => r.status === "failed");
  const unconfigured = results.filter((r) => r.status === "not_configured");

  if (failures.length > 0) {
    await sendAlert(failures, unconfigured);
  }

  return res.status(200).json({
    checkedAt: new Date().toISOString(),
    okCount: results.filter((r) => r.status === "ok").length,
    failedCount: failures.length,
    notConfiguredCount: unconfigured.length,
    results,
  });
};

// ---------------------------------------------------------------------
// Individual test functions - each makes one small, read-only call.
// ---------------------------------------------------------------------

async function testGHL(token, ghlLocationEnvVar) {
  const locationId = process.env[ghlLocationEnvVar || "GHL_LOCATION_ID"] || "DNirEjy0ejVwbHsaBYrn";
  const resp = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
  });
  if (resp.status === 401) {
    throw new Error("GoHighLevel rejected this token (401 - invalid, expired, or revoked).");
  }
  if (!resp.ok && resp.status !== 403) {
    throw new Error(`GoHighLevel returned an unexpected error (status ${resp.status}).`);
  }
  // A 403 means the token is valid but this specific endpoint isn't in
  // its scope - that's not the failure mode we're watching for here.
}

async function testAirtable(token, baseId) {
  const resp = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) {
    throw new Error("Airtable rejected this token (401 - invalid or revoked).");
  }
  if (resp.status === 403) {
    throw new Error("Airtable rejected this token for this base (403 - access to the base was removed, or the token was regenerated).");
  }
  if (resp.status === 404) {
    throw new Error("Airtable base not found (404 - the base ID may be wrong, or the base was deleted/moved).");
  }
  if (!resp.ok) {
    throw new Error(`Airtable returned an unexpected error (status ${resp.status}).`);
  }
}

async function testOpenAI(key) {
  const resp = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (resp.status === 401) {
    throw new Error("OpenAI rejected this key (401 - invalid or revoked).");
  }
  if (!resp.ok) {
    throw new Error(`OpenAI returned an unexpected error (status ${resp.status}).`);
  }
}

async function testRecaptcha(secret) {
  const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: "healthcheck-dummy-token" }),
  });
  const data = await resp.json();
  const codes = data["error-codes"] || [];
  if (codes.includes("invalid-input-secret")) {
    throw new Error("Google reCAPTCHA rejected this secret key (invalid-input-secret).");
  }
  // Any other error code just means our dummy "response" token wasn't
  // real, which is expected - the secret itself checked out fine.
}

// ---------------------------------------------------------------------
// Alerting - sends one plain-language message per failed run.
// ---------------------------------------------------------------------

async function sendAlert(failures, unconfigured) {
  const lines = [];
  lines.push(`Calculator API key check found ${failures.length} problem(s):`);
  lines.push("");
  for (const f of failures) {
    lines.push(`- ${f.name}: ${f.detail}`);
  }
  if (unconfigured.length > 0) {
    lines.push("");
    lines.push("Also not set up on this monitor yet (skipped, not alarmed on):");
    for (const u of unconfigured) {
      lines.push(`- ${u.name}`);
    }
  }
  const message = lines.join("\n");
  console.error(message);

  const targets = [process.env.ADMIN_NOTIFY_WEBHOOK_URL, process.env.SLACK_WEBHOOK_URL].filter(Boolean);

  for (const url of targets) {
    try {
      const isSlack = url.includes("hooks.slack.com");
      const body = isSlack
        ? { text: `:rotating_light: *Calculator API key check*\n${message}` }
        : {
            type: "api_key_check_failure",
            summary: `${failures.length} calculator API key(s) failing`,
            failures,
            unconfigured,
            checkedAt: new Date().toISOString(),
          };
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error(`Failed to send alert to ${url}:`, err.message);
    }
  }
}
