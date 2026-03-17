// ============================================================
// Utah REIA – AI Pricing Proxy
// ARCHITECTURE: Static pre-computed price cache (Q1 2025, Salt Lake City / Utah County)
// Returns instantly — no OpenAI call at runtime = zero timeout risk.
// Prices are mid-range Utah contractor rates, locked to Q1 2025.
// To update prices, edit the PRICE_CACHE object below and redeploy.
// ============================================================

const PRICE_CACHE = {
  // ── GENERAL CONDITIONS ─────────────────────────────────────────────────
  "General Conditions|Project management":          { labor: 95,    material: 0    },
  "General Conditions|Site supervision":            { labor: 85,    material: 0    },
  "General Conditions|Temporary utilities":         { labor: 500,   material: 300  },
  "General Conditions|Storage container":           { labor: 0,     material: 250  },
  "General Conditions|Temporary toilet":            { labor: 0,     material: 175  },
  "General Conditions|Temporary water/power":       { labor: 200,   material: 150  },
  "General Conditions|Material delivery/handling":  { labor: 400,   material: 0    },
  "General Conditions|Labor supervision":           { labor: 85,    material: 0    },
  "General Conditions|Relay/Locksmith":             { labor: 75,    material: 50   },
  "General Conditions|Admin/Security":              { labor: 0,     material: 500  },
  "General Conditions|Misc tools & consumables":    { labor: 0,     material: 300  },
  // ── PROFESSIONAL & SOFT COSTS ──────────────────────────────────────────
  "Professional & Soft Costs|Permit fees":          { labor: 0,     material: 1200 },
  "Professional & Soft Costs|Engineering/Plans":    { labor: 0,     material: 1800 },
  "Professional & Soft Costs|Permit plans":         { labor: 0,     material: 800  },
  "Professional & Soft Costs|Legal/Title":          { labor: 0,     material: 1500 },
  "Professional & Soft Costs|Inspections":          { labor: 0,     material: 400  },
  // ── RISK & FINANCIAL CONTROLS ──────────────────────────────────────────
  "Risk & Financial Controls|Pre-listing allowance":{ labor: 0,     material: 2500 },
  "Risk & Financial Controls|Insurance/Risk":       { labor: 0,     material: 1200 },
  // ── A. DEMOLITION & SITE PREP ──────────────────────────────────────────
  "A. Demolition & Site Prep|Interior demo":                             { labor: 3500,  material: 0   },
  "A. Demolition & Site Prep|Exterior demo (if full tear-down/deconstruct)": { labor: 8000, material: 0 },
  "A. Demolition & Site Prep|Foundation site demolition":               { labor: 55,    material: 0   },
  "A. Demolition & Site Prep|Backfill":                                 { labor: 40,    material: 25  },
  "A. Demolition & Site Prep|Excavation":                               { labor: 65,    material: 0   },
  // ── B. ABATEMENT ───────────────────────────────────────────────────────
  "B. Abatement|Asbestos testing":           { labor: 0,    material: 450  },
  "B. Abatement|Asbestos abatement":         { labor: 8,    material: 4    },
  "B. Abatement|Mold testing":               { labor: 0,    material: 350  },
  "B. Abatement|Mold remediation":           { labor: 6,    material: 3    },
  "B. Abatement|Lead paint remediation":     { labor: 7,    material: 3    },
  // ── C. ROOFING ─────────────────────────────────────────────────────────
  "C. Roofing|Tear off":                     { labor: 75,   material: 0    },
  "C. Roofing|Asphalt shingles":             { labor: 120,  material: 180  },
  "C. Roofing|Roof decking/sheathing":       { labor: 2,    material: 3    },
  "C. Roofing|Flashing":                     { labor: 8,    material: 6    },
  "C. Roofing|Chimney repair":               { labor: 400,  material: 300  },
  "C. Roofing|Skylight":                     { labor: 350,  material: 650  },
  "C. Roofing|Gutters":                      { labor: 4,    material: 6    },
  "C. Roofing|Soffit/Fascia":                { labor: 5,    material: 7    },
  "C. Roofing|Roof vents":                   { labor: 80,   material: 45   },
  "C. Roofing|Eave trim":                    { labor: 3,    material: 4    },
  "C. Roofing|Chimney/roof repair":          { labor: 1200, material: 500  },
  // ── D. EXTERIOR CARPENTRY ──────────────────────────────────────────────
  "D. Exterior Carpentry & Developer|Siding":                        { labor: 3,    material: 5    },
  "D. Exterior Carpentry & Developer|Trim/Caulk":                    { labor: 4,    material: 2    },
  "D. Exterior Carpentry & Developer|Exterior door":                  { labor: 250,  material: 450  },
  "D. Exterior Carpentry & Developer|Window":                         { labor: 200,  material: 350  },
  "D. Exterior Carpentry & Developer|Deck/Porch":                     { labor: 12,   material: 18   },
  "D. Exterior Carpentry & Developer|Fence/Wall/Retaining-wall repair":{ labor: 15,  material: 20   },
  "D. Exterior Carpentry & Developer|Stucco repair":                  { labor: 5,    material: 4    },
  // ── E. FOUNDATION & STRUCTURAL ─────────────────────────────────────────
  "E. Foundation & Structural Repairs|Crack repair":          { labor: 15,   material: 8    },
  "E. Foundation & Structural Repairs|Foundation waterproofing":{ labor: 6,  material: 5    },
  "E. Foundation & Structural Repairs|Footing/Pier repair":   { labor: 450,  material: 300  },
  "E. Foundation & Structural Repairs|Crawl space repair":    { labor: 2500, material: 800  },
  "E. Foundation & Structural Repairs|Structural wall repair":{ labor: 18,   material: 12   },
  "E. Foundation & Structural Repairs|Structural beam install":{ labor: 45,  material: 65   },
  "E. Foundation & Structural Repairs|Leveling/Underpinning": { labor: 800,  material: 400  },
  // ── F. CONCRETE & FLATWORK ─────────────────────────────────────────────
  "F. Concrete & Flatwork|Driveway":    { labor: 4,    material: 6    },
  "F. Concrete & Flatwork|Sidewalk":    { labor: 5,    material: 6    },
  "F. Concrete & Flatwork|Steps":       { labor: 350,  material: 250  },
  "F. Concrete & Flatwork|Patio slab":  { labor: 5,    material: 6    },
  "F. Concrete & Flatwork|Curb/Gutter": { labor: 18,   material: 14   },
  "F. Concrete & Flatwork|Footing(s)":  { labor: 120,  material: 180  },
  // ── G. DRAINAGE SYSTEMS ────────────────────────────────────────────────
  "G. Drainage Systems|French drain":          { labor: 20,   material: 15   },
  "G. Drainage Systems|Storm drain system":    { labor: 3500, material: 2000 },
  "G. Drainage Systems|Catch basins":          { labor: 350,  material: 250  },
  "G. Drainage Systems|Downspout extensions":  { labor: 45,   material: 35   },
  "G. Drainage Systems|Grading/Re-grading":    { labor: 2000, material: 500  },
  // ── H. LANDSCAPING ─────────────────────────────────────────────────────
  "H. Landscaping|Grass":               { labor: 1,    material: 1    },
  "H. Landscaping|Rock":                { labor: 1,    material: 2    },
  "H. Landscaping|Back":                { labor: 1,    material: 1    },
  "H. Landscaping|Sprinkler install":   { labor: 1800, material: 1200 },
  "H. Landscaping|Sprinkler repair":    { labor: 150,  material: 75   },
  "H. Landscaping|Tree trimming":       { labor: 300,  material: 0    },
  "H. Landscaping|Save tree":           { labor: 500,  material: 0    },
  "H. Landscaping|Remove tree":         { labor: 800,  material: 0    },
  "H. Landscaping|Cleanup/Haul-away":   { labor: 600,  material: 0    },
  // ── I. EXTERIOR PAINT ──────────────────────────────────────────────────
  "I. Exterior Paint|Paint – siding":        { labor: 1.5,  material: 0.5  },
  "I. Exterior Paint|Paint – trim":          { labor: 3,    material: 1    },
  "I. Exterior Paint|Paint – doors":         { labor: 75,   material: 25   },
  "I. Exterior Paint|Paint – decks":         { labor: 2,    material: 1    },
  "I. Exterior Paint|Full exterior repaint": { labor: 2,    material: 0.75 },
  // ── J. EXTERIOR UTILITIES ──────────────────────────────────────────────
  "J. Exterior Utilities|Sewer line":    { labor: 45,   material: 35   },
  "J. Exterior Utilities|Water service": { labor: 40,   material: 30   },
  "J. Exterior Utilities|Septic pump":   { labor: 400,  material: 800  },
  "J. Exterior Utilities|Gas service":   { labor: 35,   material: 25   },
  "J. Exterior Utilities|Utility meter": { labor: 200,  material: 350  },
  // ── A. INTERIOR DEMOLITION ─────────────────────────────────────────────
  "A. Interior Demolition|Demo full":       { labor: 3,    material: 0    },
  "A. Interior Demolition|Demo gut floor":  { labor: 2,    material: 0    },
  "A. Interior Demolition|Kitchen demo":    { labor: 800,  material: 0    },
  "A. Interior Demolition|Bathroom demo":   { labor: 600,  material: 0    },
  "A. Interior Demolition|Room demo":       { labor: 500,  material: 0    },
  "A. Interior Demolition|Haul demo":       { labor: 800,  material: 0    },
  // ── B. STRUCTURAL / FRAMING ────────────────────────────────────────────
  "B. Structural / Framing|Interior framing":        { labor: 8,    material: 6    },
  "B. Structural / Framing|Load-bearing beam install":{ labor: 600,  material: 800  },
  "B. Structural / Framing|Subfloor repair":         { labor: 4,    material: 3    },
  "B. Structural / Framing|Structural repair":       { labor: 2500, material: 1000 },
  // ── C. INSULATION ──────────────────────────────────────────────────────
  "C. Insulation|Wall insulation":   { labor: 1.2,  material: 1.0  },
  "C. Insulation|Attic insulation":  { labor: 1.0,  material: 1.2  },
  "C. Insulation|Floor insulation":  { labor: 1.0,  material: 1.0  },
  "C. Insulation|Sound insulation":  { labor: 1.5,  material: 1.5  },
  // ── D. DRYWALL ─────────────────────────────────────────────────────────
  "D. Drywall|Hang drywall":    { labor: 1.5,  material: 0.6  },
  "D. Drywall|Tape & mud":      { labor: 1.0,  material: 0.3  },
  "D. Drywall|Skim coat":       { labor: 1.5,  material: 0.4  },
  "D. Drywall|Texture":         { labor: 0.8,  material: 0.2  },
  "D. Drywall|Ceiling drywall": { labor: 2.0,  material: 0.6  },
  // ── E. WATERPROOFING SYSTEMS ───────────────────────────────────────────
  "E. Waterproofing Systems|Basement waterproofing":      { labor: 8,    material: 6    },
  "E. Waterproofing Systems|Vapor barrier":               { labor: 1,    material: 0.5  },
  "E. Waterproofing Systems|Bathroom waterproof membrane":{ labor: 3,    material: 2    },
  "E. Waterproofing Systems|Crawl space encapsulation":   { labor: 3,    material: 2    },
  // ── F. INTERIOR PAINT ──────────────────────────────────────────────────
  "F. Interior Paint|Walls":        { labor: 1.2,  material: 0.4  },
  "F. Interior Paint|Ceilings":     { labor: 1.5,  material: 0.4  },
  "F. Interior Paint|Doors":        { labor: 60,   material: 20   },
  "F. Interior Paint|Stairs":       { labor: 8,    material: 3    },
  "F. Interior Paint|Hall repaint": { labor: 600,  material: 200  },
  // ── G. FLOORING ────────────────────────────────────────────────────────
  "G. Flooring|LVP":              { labor: 2.5,  material: 2.5  },
  "G. Flooring|Hardwood":         { labor: 4,    material: 6    },
  "G. Flooring|Tile":             { labor: 6,    material: 4    },
  "G. Flooring|Tile shower width":{ labor: 10,   material: 6    },
  "G. Flooring|Carpet":           { labor: 1.5,  material: 2    },
  "G. Flooring|Tile replacement": { labor: 8,    material: 5    },
  "G. Flooring|Baseboards":       { labor: 3,    material: 2    },
  "G. Flooring|Backerboard":      { labor: 1.5,  material: 1    },
  // ── H. KITCHEN ─────────────────────────────────────────────────────────
  "H. Kitchen|Base cabinets":         { labor: 80,   material: 200  },
  "H. Kitchen|Upper cabinets":        { labor: 60,   material: 150  },
  "H. Kitchen|Pantry":                { labor: 300,  material: 800  },
  "H. Kitchen|Island":                { labor: 400,  material: 1200 },
  "H. Kitchen|Cabinet allowance":     { labor: 0,    material: 4500 },
  "H. Kitchen|Cabinet package":       { labor: 0,    material: 8000 },
  "H. Kitchen|Countertops/Laminate":  { labor: 8,    material: 12   },
  "H. Kitchen|Countertops/Quartz finish":{ labor: 10, material: 55  },
  "H. Kitchen|Sink/Faucet":           { labor: 200,  material: 350  },
  "H. Kitchen|Disposal":              { labor: 120,  material: 180  },
  "H. Kitchen|Appliances":            { labor: 200,  material: 2500 },
  "H. Kitchen|Hardware":              { labor: 80,   material: 150  },
  "H. Kitchen|Specialty lighting":    { labor: 120,  material: 200  },
  "H. Kitchen|Hood fan":              { labor: 150,  material: 350  },
  "H. Kitchen|Steel hood":            { labor: 200,  material: 800  },
  "H. Kitchen|Box":                   { labor: 100,  material: 150  },
  // ── I. BATHROOMS ───────────────────────────────────────────────────────
  "I. Bathrooms|Toilet":           { labor: 150,  material: 250  },
  "I. Bathrooms|Vanity":           { labor: 200,  material: 450  },
  "I. Bathrooms|Mirror":           { labor: 60,   material: 120  },
  "I. Bathrooms|Sink":             { labor: 150,  material: 200  },
  "I. Bathrooms|Faucet":           { labor: 100,  material: 150  },
  "I. Bathrooms|Shower/Tub combo": { labor: 400,  material: 800  },
  "I. Bathrooms|Tile shower":      { labor: 10,   material: 6    },
  "I. Bathrooms|Tile floor":       { labor: 6,    material: 4    },
  "I. Bathrooms|Shower door":      { labor: 200,  material: 400  },
  "I. Bathrooms|Bath accessories": { labor: 150,  material: 200  },
  "I. Bathrooms|Glass shower door":{ labor: 250,  material: 600  },
  // ── J. HVAC ────────────────────────────────────────────────────────────
  "J. HVAC|Furnace":     { labor: 600,  material: 1800 },
  "J. HVAC|AC unit":     { labor: 600,  material: 2200 },
  "J. HVAC|Heat pump":   { labor: 800,  material: 3000 },
  "J. HVAC|Ductwork":    { labor: 2500, material: 1500 },
  "J. HVAC|Thermostat":  { labor: 80,   material: 150  },
  // ── K. PLUMBING ────────────────────────────────────────────────────────
  "K. Plumbing|Repipe":                   { labor: 4500, material: 2000 },
  "K. Plumbing|Water heater":             { labor: 300,  material: 900  },
  "K. Plumbing|Isolator valve replacement":{ labor: 120, material: 80   },
  "K. Plumbing|Fixture replacement":      { labor: 150,  material: 200  },
  "K. Plumbing|Drain repair":             { labor: 25,   material: 15   },
  // ── L. ELECTRICAL ──────────────────────────────────────────────────────
  "L. Electrical|Panel upgrade":    { labor: 800,  material: 1200 },
  "L. Electrical|Full rewire":      { labor: 6000, material: 3000 },
  "L. Electrical|Can light":        { labor: 80,   material: 60   },
  "L. Electrical|Switch/Outlet":    { labor: 45,   material: 15   },
  "L. Electrical|Smoke/CO2 upgrade":{ labor: 60,   material: 40   },
  "L. Electrical|GFCI upgrade":     { labor: 55,   material: 35   },
  "L. Electrical|Ceiling fan":      { labor: 120,  material: 180  },
  // ── M. INTERIOR FINISH & MISC ──────────────────────────────────────────
  "M. Interior Finish & Misc|Interior doors":  { labor: 150,  material: 250  },
  "M. Interior Finish & Misc|Door hardware":   { labor: 60,   material: 80   },
  "M. Interior Finish & Misc|Stair railing":   { labor: 25,   material: 35   },
  "M. Interior Finish & Misc|Closet shelving": { labor: 8,    material: 12   },
  "M. Interior Finish & Misc|Transition/Trim": { labor: 3,    material: 2    },
  "M. Interior Finish & Misc|Radiant refrigerator":{ labor: 150, material: 1200 },
};

export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || "";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(o => o.trim()).filter(Boolean);

  const isAllowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", isAllowed ? (origin || "*") : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  if (!isAllowed) {
    console.warn(`[CORS BLOCKED] Origin: ${origin}`);
    return res.status(403).json({ error: "Forbidden origin." });
  }

  // ── IP & rate limiting (light — no AI cost now) ───────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  if (!global._aiRateMap) global._aiRateMap = new Map();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxCalls = 20; // generous — instant responses cost nothing
  const record = global._aiRateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  global._aiRateMap.set(ip, record);
  if (record.count > maxCalls) {
    const minsLeft = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({ error: `Too many requests. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.` });
  }

  // ── INPUT VALIDATION ──────────────────────────────────────────────────────
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const cleanItems = items.map(it => ({
    cat:   String(it.cat   || "").substring(0, 60).replace(/[^a-zA-Z0-9 &/\-.()]/g, ""),
    label: String(it.label || "").substring(0, 100).replace(/[^a-zA-Z0-9 &/\-.()]/g, ""),
  })).filter(it => it.cat && it.label);

  console.log("[PRICE REQUEST]", JSON.stringify({
    time: new Date().toISOString(), ip,
    itemCount: cleanItems.length,
    origin: origin || "unknown"
  }));

  // ── LOOK UP PRICES FROM CACHE ─────────────────────────────────────────────
  const prices = {};
  let hits = 0, misses = 0;

  for (const it of cleanItems) {
    const key = `${it.cat}|${it.label}`;
    if (PRICE_CACHE[key]) {
      prices[key] = PRICE_CACHE[key];
      hits++;
    } else {
      // Return zeros for unknown items — user fills manually
      prices[key] = { labor: 0, material: 0 };
      misses++;
    }
  }

  console.log("[PRICE RESPONSE]", JSON.stringify({
    time: new Date().toISOString(), ip,
    hits, misses,
    total: cleanItems.length
  }));

  return res.status(200).json({ prices });
}