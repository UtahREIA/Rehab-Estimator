// ============================================================
// Build Scope AI – Pricing Proxy
// Static pre-computed price cache (Q1 2025, Salt Lake City / Utah County)
// Returns instantly — no OpenAI call at runtime.
// To update prices, edit PRICE_CACHE below and redeploy.
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

  // ── PROFESSIONAL & SOFT COSTS (REHAB) ──────────────────────────────────
  "Professional & Soft Costs|Permit fees":          { labor: 0,     material: 1200 },
  "Professional & Soft Costs|Engineering/Plans":    { labor: 0,     material: 1800 },
  "Professional & Soft Costs|Permit plans":         { labor: 0,     material: 800  },
  "Professional & Soft Costs|Legal/Title":          { labor: 0,     material: 1500 },
  "Professional & Soft Costs|Inspections":          { labor: 0,     material: 400  },
  "Professional & Soft Costs|Contingency/Reserves": { labor: 0,     material: 2000 },

  // ── PROFESSIONAL & SOFT COSTS (NEW BUILD) ──────────────────────────────
  "Professional & Soft Costs|Architectural plans":     { labor: 0,  material: 4500 },
  "Professional & Soft Costs|Structural engineering":  { labor: 0,  material: 3500 },
  "Professional & Soft Costs|Building permit":         { labor: 0,  material: 2500 },
  "Professional & Soft Costs|Utility connection fees": { labor: 0,  material: 3000 },
  "Professional & Soft Costs|Soil/Geo report":         { labor: 0,  material: 1800 },
  "Professional & Soft Costs|Survey":                  { labor: 0,  material: 1200 },

  // ── RISK & FINANCIAL CONTROLS ──────────────────────────────────────────
  "Risk & Financial Controls|Pre-listing allowance":   { labor: 0,  material: 2500 },
  "Risk & Financial Controls|Insurance/Risk":          { labor: 0,  material: 1200 },
  "Risk & Financial Controls|Builder's risk insurance":{ labor: 0,  material: 2500 },

  // ══════════════════════════════════════════════════════════════════════
  // REHAB — EXTERIOR
  // ══════════════════════════════════════════════════════════════════════

  // ── A. DEMOLITION & SITE PREP ──────────────────────────────────────────
  "A. Demolition & Site Prep|Interior demo":                              { labor: 3500, material: 0   },
  "A. Demolition & Site Prep|Exterior demo (if full tear-down/deconstruct)":{ labor: 8000, material: 0 },
  "A. Demolition & Site Prep|Foundation site demolition":                 { labor: 55,   material: 0   },
  "A. Demolition & Site Prep|Backfill":                                   { labor: 40,   material: 25  },
  "A. Demolition & Site Prep|Excavation":                                 { labor: 65,   material: 0   },

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
  "D. Exterior Carpentry & Developer|Siding":                         { labor: 3,    material: 5    },
  "D. Exterior Carpentry & Developer|Trim/Caulk":                     { labor: 4,    material: 2    },
  "D. Exterior Carpentry & Developer|Exterior door":                   { labor: 250,  material: 450  },
  "D. Exterior Carpentry & Developer|Window":                          { labor: 200,  material: 350  },
  "D. Exterior Carpentry & Developer|Deck/Porch":                      { labor: 12,   material: 18   },
  "D. Exterior Carpentry & Developer|Fence/Wall/Retaining-wall repair":{ labor: 15,   material: 20   },
  "D. Exterior Carpentry & Developer|Stucco repair":                   { labor: 5,    material: 4    },

  // ── E. FOUNDATION & STRUCTURAL ─────────────────────────────────────────
  "E. Foundation & Structural Repairs|Crack repair":           { labor: 15,   material: 8    },
  "E. Foundation & Structural Repairs|Foundation waterproofing":{ labor: 6,   material: 5    },
  "E. Foundation & Structural Repairs|Footing/Pier repair":    { labor: 450,  material: 300  },
  "E. Foundation & Structural Repairs|Crawl space repair":     { labor: 2500, material: 800  },
  "E. Foundation & Structural Repairs|Structural wall repair": { labor: 18,   material: 12   },
  "E. Foundation & Structural Repairs|Structural beam install":{ labor: 45,   material: 65   },
  "E. Foundation & Structural Repairs|Leveling/Underpinning":  { labor: 800,  material: 400  },

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

  // ══════════════════════════════════════════════════════════════════════
  // REHAB — INTERIOR
  // ══════════════════════════════════════════════════════════════════════

  "A. Interior Demolition|Demo full":       { labor: 3,    material: 0    },
  "A. Interior Demolition|Demo gut floor":  { labor: 2,    material: 0    },
  "A. Interior Demolition|Kitchen demo":    { labor: 800,  material: 0    },
  "A. Interior Demolition|Bathroom demo":   { labor: 600,  material: 0    },
  "A. Interior Demolition|Room demo":       { labor: 500,  material: 0    },
  "A. Interior Demolition|Haul demo":       { labor: 800,  material: 0    },

  "B. Structural / Framing|Interior framing":         { labor: 8,    material: 6    },
  "B. Structural / Framing|Load-bearing beam install":{ labor: 600,  material: 800  },
  "B. Structural / Framing|Subfloor repair":          { labor: 4,    material: 3    },
  "B. Structural / Framing|Structural repair":        { labor: 2500, material: 1000 },

  "C. Insulation|Wall insulation":   { labor: 1.2,  material: 1.0  },
  "C. Insulation|Attic insulation":  { labor: 1.0,  material: 1.2  },
  "C. Insulation|Floor insulation":  { labor: 1.0,  material: 1.0  },
  "C. Insulation|Sound insulation":  { labor: 1.5,  material: 1.5  },

  "D. Drywall|Hang drywall":    { labor: 1.5,  material: 0.6  },
  "D. Drywall|Tape & mud":      { labor: 1.0,  material: 0.3  },
  "D. Drywall|Skim coat":       { labor: 1.5,  material: 0.4  },
  "D. Drywall|Texture":         { labor: 0.8,  material: 0.2  },
  "D. Drywall|Ceiling drywall": { labor: 2.0,  material: 0.6  },

  "E. Waterproofing Systems|Basement waterproofing":       { labor: 8,    material: 6    },
  "E. Waterproofing Systems|Vapor barrier":                { labor: 1,    material: 0.5  },
  "E. Waterproofing Systems|Bathroom waterproof membrane": { labor: 3,    material: 2    },
  "E. Waterproofing Systems|Crawl space encapsulation":    { labor: 3,    material: 2    },

  "F. Interior Paint|Walls":        { labor: 1.2,  material: 0.4  },
  "F. Interior Paint|Ceilings":     { labor: 1.5,  material: 0.4  },
  "F. Interior Paint|Doors":        { labor: 60,   material: 20   },
  "F. Interior Paint|Stairs":       { labor: 8,    material: 3    },
  "F. Interior Paint|Hall repaint": { labor: 600,  material: 200  },

  "G. Flooring|LVP":               { labor: 2.5,  material: 2.5  },
  "G. Flooring|Hardwood":          { labor: 4,    material: 6    },
  "G. Flooring|Tile":              { labor: 6,    material: 4    },
  "G. Flooring|Tile shower width": { labor: 10,   material: 6    },
  "G. Flooring|Carpet":            { labor: 1.5,  material: 2    },
  "G. Flooring|Tile replacement":  { labor: 8,    material: 5    },
  "G. Flooring|Baseboards":        { labor: 3,    material: 2    },
  "G. Flooring|Backerboard":       { labor: 1.5,  material: 1    },

  "H. Kitchen|Base cabinets":            { labor: 80,   material: 200  },
  "H. Kitchen|Upper cabinets":           { labor: 60,   material: 150  },
  "H. Kitchen|Pantry":                   { labor: 300,  material: 800  },
  "H. Kitchen|Island":                   { labor: 400,  material: 1200 },
  "H. Kitchen|Cabinet allowance":        { labor: 0,    material: 4500 },
  "H. Kitchen|Cabinet package":          { labor: 0,    material: 8000 },
  "H. Kitchen|Countertops/Laminate":     { labor: 8,    material: 12   },
  "H. Kitchen|Countertops/Quartz finish":{ labor: 10,   material: 55   },
  "H. Kitchen|Sink/Faucet":             { labor: 200,  material: 350  },
  "H. Kitchen|Disposal":                { labor: 120,  material: 180  },
  "H. Kitchen|Appliances":              { labor: 200,  material: 2500 },
  "H. Kitchen|Hardware":                { labor: 80,   material: 150  },
  "H. Kitchen|Specialty lighting":      { labor: 120,  material: 200  },
  "H. Kitchen|Hood fan":                { labor: 150,  material: 350  },
  "H. Kitchen|Steel hood":              { labor: 200,  material: 800  },
  "H. Kitchen|Box":                     { labor: 100,  material: 150  },

  "I. Bathrooms|Toilet":            { labor: 150,  material: 250  },
  "I. Bathrooms|Vanity":            { labor: 200,  material: 450  },
  "I. Bathrooms|Mirror":            { labor: 60,   material: 120  },
  "I. Bathrooms|Sink":              { labor: 150,  material: 200  },
  "I. Bathrooms|Faucet":            { labor: 100,  material: 150  },
  "I. Bathrooms|Shower/Tub combo":  { labor: 400,  material: 800  },
  "I. Bathrooms|Tile shower":       { labor: 10,   material: 6    },
  "I. Bathrooms|Tile floor":        { labor: 6,    material: 4    },
  "I. Bathrooms|Shower door":       { labor: 200,  material: 400  },
  "I. Bathrooms|Bath accessories":  { labor: 150,  material: 200  },
  "I. Bathrooms|Glass shower door": { labor: 250,  material: 600  },

  "J. HVAC|Furnace":     { labor: 600,  material: 1800 },
  "J. HVAC|AC unit":     { labor: 600,  material: 2200 },
  "J. HVAC|Heat pump":   { labor: 800,  material: 3000 },
  "J. HVAC|Ductwork":    { labor: 2500, material: 1500 },
  "J. HVAC|Thermostat":  { labor: 80,   material: 150  },

  "K. Plumbing|Repipe":                    { labor: 4500, material: 2000 },
  "K. Plumbing|Water heater":              { labor: 300,  material: 900  },
  "K. Plumbing|Isolator valve replacement":{ labor: 120,  material: 80   },
  "K. Plumbing|Fixture replacement":       { labor: 150,  material: 200  },
  "K. Plumbing|Drain repair":              { labor: 25,   material: 15   },

  "L. Electrical|Panel upgrade":     { labor: 800,  material: 1200 },
  "L. Electrical|Full rewire":       { labor: 6000, material: 3000 },
  "L. Electrical|Can light":         { labor: 80,   material: 60   },
  "L. Electrical|Switch/Outlet":     { labor: 45,   material: 15   },
  "L. Electrical|Smoke/CO2 upgrade": { labor: 60,   material: 40   },
  "L. Electrical|GFCI upgrade":      { labor: 55,   material: 35   },
  "L. Electrical|Ceiling fan":       { labor: 120,  material: 180  },

  "M. Interior Finish & Misc|Interior doors":       { labor: 150,  material: 250  },
  "M. Interior Finish & Misc|Door hardware":        { labor: 60,   material: 80   },
  "M. Interior Finish & Misc|Stair railing":        { labor: 25,   material: 35   },
  "M. Interior Finish & Misc|Closet shelving":      { labor: 8,    material: 12   },
  "M. Interior Finish & Misc|Transition/Trim":      { labor: 3,    material: 2    },
  "M. Interior Finish & Misc|Radiant refrigerator": { labor: 150,  material: 1200 },

  // ══════════════════════════════════════════════════════════════════════
  // NEW CONSTRUCTION — SITE & STRUCTURE
  // ══════════════════════════════════════════════════════════════════════

  "A. Site Work & Prep|Demolition/clearing":    { labor: 3500, material: 500  },
  "A. Site Work & Prep|Tree removal":           { labor: 800,  material: 0    },
  "A. Site Work & Prep|Grading":                { labor: 2500, material: 500  },
  "A. Site Work & Prep|Excavation":             { labor: 65,   material: 0    },
  "A. Site Work & Prep|Backfill & compaction":  { labor: 45,   material: 20   },
  "A. Site Work & Prep|Erosion control":        { labor: 500,  material: 300  },
  "A. Site Work & Prep|Temporary road/access":  { labor: 800,  material: 600  },

  "B. Foundation|Footings":                  { labor: 25,   material: 20   },
  "B. Foundation|Foundation walls":          { labor: 12,   material: 18   },
  "B. Foundation|Slab on grade":             { labor: 4,    material: 6    },
  "B. Foundation|Basement slab":             { labor: 5,    material: 6    },
  "B. Foundation|Foundation waterproofing":  { labor: 5,    material: 4    },
  "B. Foundation|Drainage board":            { labor: 1,    material: 1.5  },
  "B. Foundation|Radon mitigation rough-in": { labor: 400,  material: 200  },
  "B. Foundation|Foundation anchor bolts":   { labor: 300,  material: 200  },

  "C. Framing|Floor framing":           { labor: 4,    material: 5    },
  "C. Framing|Wall framing":            { labor: 4,    material: 5    },
  "C. Framing|Roof framing":            { labor: 5,    material: 6    },
  "C. Framing|Engineered lumber/beams": { labor: 20,   material: 45   },
  "C. Framing|Sheathing – walls":       { labor: 1.5,  material: 2    },
  "C. Framing|Sheathing – roof":        { labor: 1.5,  material: 2    },
  "C. Framing|House wrap":              { labor: 0.5,  material: 0.5  },
  "C. Framing|Exterior windows":        { labor: 200,  material: 450  },
  "C. Framing|Exterior doors":          { labor: 250,  material: 500  },
  "C. Framing|Garage door rough-in":    { labor: 300,  material: 1200 },

  "D. Roofing & Exterior Skin|Asphalt shingles":  { labor: 120,  material: 180  },
  "D. Roofing & Exterior Skin|Roof underlayment": { labor: 15,   material: 20   },
  "D. Roofing & Exterior Skin|Flashing":          { labor: 8,    material: 6    },
  "D. Roofing & Exterior Skin|Gutters":           { labor: 4,    material: 6    },
  "D. Roofing & Exterior Skin|Soffit/Fascia":     { labor: 5,    material: 7    },
  "D. Roofing & Exterior Skin|Roof vents":        { labor: 80,   material: 45   },
  "D. Roofing & Exterior Skin|Siding":            { labor: 3,    material: 5    },
  "D. Roofing & Exterior Skin|Trim/Caulk":        { labor: 4,    material: 2    },
  "D. Roofing & Exterior Skin|Stucco/EIFS":       { labor: 6,    material: 5    },

  "E. Flatwork & Hardscape|Driveway":          { labor: 4,    material: 6    },
  "E. Flatwork & Hardscape|Walkways/Sidewalk": { labor: 5,    material: 6    },
  "E. Flatwork & Hardscape|Patio/Porch slab":  { labor: 5,    material: 6    },
  "E. Flatwork & Hardscape|Garage slab":       { labor: 4,    material: 5    },
  "E. Flatwork & Hardscape|Steps":             { labor: 350,  material: 250  },
  "E. Flatwork & Hardscape|Retaining walls":   { labor: 30,   material: 25   },

  "F. Exterior Utilities|Sewer lateral":           { labor: 50,   material: 40   },
  "F. Exterior Utilities|Water service line":      { labor: 45,   material: 35   },
  "F. Exterior Utilities|Gas service line":        { labor: 40,   material: 30   },
  "F. Exterior Utilities|Electric service trench": { labor: 35,   material: 20   },
  "F. Exterior Utilities|Utility meter & panel":   { labor: 400,  material: 800  },
  "F. Exterior Utilities|Septic system":           { labor: 4000, material: 6000 },

  "G. Landscaping|Topsoil":          { labor: 25,   material: 35   },
  "G. Landscaping|Sod/Grass seed":   { labor: 0.5,  material: 0.8  },
  "G. Landscaping|Irrigation system":{ labor: 1800, material: 1500 },
  "G. Landscaping|Trees & shrubs":   { labor: 80,   material: 150  },
  "G. Landscaping|Rock/Mulch":       { labor: 1,    material: 2    },
  "G. Landscaping|Fencing":          { labor: 15,   material: 20   },

  // ══════════════════════════════════════════════════════════════════════
  // NEW CONSTRUCTION — INTERIOR & SYSTEMS
  // ══════════════════════════════════════════════════════════════════════

  "A. MEP Rough-Ins|Plumbing rough-in":       { labor: 4500, material: 2000 },
  "A. MEP Rough-Ins|Electrical rough-in":     { labor: 4000, material: 2500 },
  "A. MEP Rough-Ins|HVAC rough-in/ductwork":  { labor: 3500, material: 2000 },
  "A. MEP Rough-Ins|Gas rough-in":            { labor: 1200, material: 600  },
  "A. MEP Rough-Ins|Low voltage rough-in":    { labor: 800,  material: 400  },
  "A. MEP Rough-Ins|Fire sprinkler rough-in": { labor: 2500, material: 1500 },

  "B. Insulation|Wall insulation – batts":    { labor: 1.0,  material: 1.0  },
  "B. Insulation|Attic insulation – blown":   { labor: 0.8,  material: 1.2  },
  "B. Insulation|Rim joist insulation":       { labor: 3,    material: 2    },
  "B. Insulation|Spray foam – crawl/rim":     { labor: 2,    material: 2    },
  "B. Insulation|Sound insulation":           { labor: 1.5,  material: 1.5  },

  "C. Drywall|Hang drywall":                  { labor: 1.5,  material: 0.6  },
  "C. Drywall|Tape & mud":                    { labor: 1.0,  material: 0.3  },
  "C. Drywall|Texture":                       { labor: 0.8,  material: 0.2  },
  "C. Drywall|Ceiling drywall":               { labor: 2.0,  material: 0.6  },
  "C. Drywall|Fire-rated drywall (garage)":   { labor: 2.0,  material: 1.0  },

  "D. Interior Paint|Walls":        { labor: 1.2,  material: 0.4  },
  "D. Interior Paint|Ceilings":     { labor: 1.5,  material: 0.4  },
  "D. Interior Paint|Doors":        { labor: 60,   material: 20   },
  "D. Interior Paint|Trim/Baseboard":{ labor: 3,   material: 1    },

  "E. Flooring|LVP":          { labor: 2.5,  material: 2.5  },
  "E. Flooring|Hardwood":     { labor: 4,    material: 6    },
  "E. Flooring|Tile":         { labor: 6,    material: 4    },
  "E. Flooring|Carpet":       { labor: 1.5,  material: 2    },
  "E. Flooring|Baseboards":   { labor: 3,    material: 2    },
  "E. Flooring|Transitions":  { labor: 4,    material: 3    },

  "F. Kitchen|Cabinets – base":       { labor: 80,   material: 200  },
  "F. Kitchen|Cabinets – upper":      { labor: 60,   material: 150  },
  "F. Kitchen|Island":                { labor: 400,  material: 1200 },
  "F. Kitchen|Countertops – quartz":  { labor: 10,   material: 55   },
  "F. Kitchen|Countertops – laminate":{ labor: 8,    material: 12   },
  "F. Kitchen|Sink/Faucet":           { labor: 200,  material: 350  },
  "F. Kitchen|Disposal":              { labor: 120,  material: 180  },
  "F. Kitchen|Appliances":            { labor: 200,  material: 2500 },
  "F. Kitchen|Hood fan/Range hood":   { labor: 150,  material: 450  },
  "F. Kitchen|Hardware":              { labor: 80,   material: 150  },

  "G. Bathrooms|Toilet":          { labor: 150,  material: 250  },
  "G. Bathrooms|Vanity":          { labor: 200,  material: 450  },
  "G. Bathrooms|Tile shower":     { labor: 10,   material: 6    },
  "G. Bathrooms|Tile floor":      { labor: 6,    material: 4    },
  "G. Bathrooms|Shower door":     { labor: 200,  material: 400  },
  "G. Bathrooms|Faucet/Fixtures": { labor: 120,  material: 200  },
  "G. Bathrooms|Bath accessories":{ labor: 150,  material: 200  },

  "H. MEP Finish|Plumbing trim-out":      { labor: 2500, material: 1000 },
  "H. MEP Finish|Electrical trim-out":    { labor: 2000, material: 800  },
  "H. MEP Finish|HVAC equipment & trim":  { labor: 1500, material: 2000 },
  "H. MEP Finish|Furnace":                { labor: 600,  material: 1800 },
  "H. MEP Finish|AC unit":                { labor: 600,  material: 2200 },
  "H. MEP Finish|Water heater":           { labor: 300,  material: 900  },
  "H. MEP Finish|Panel & breakers":       { labor: 600,  material: 1000 },
  "H. MEP Finish|Thermostat":             { labor: 80,   material: 150  },

  "I. Interior Finish|Interior doors":       { labor: 150,  material: 250  },
  "I. Interior Finish|Door hardware":        { labor: 60,   material: 80   },
  "I. Interior Finish|Stair system":         { labor: 800,  material: 1800 },
  "I. Interior Finish|Closet shelving":      { labor: 200,  material: 400  },
  "I. Interior Finish|Window trim":          { labor: 60,   material: 40   },
  "I. Interior Finish|Crown/Base molding":   { labor: 4,    material: 3    },
  "I. Interior Finish|Mirrors":              { labor: 60,   material: 120  },
  "I. Interior Finish|Bathroom accessories": { labor: 150,  material: 200  },
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

  // ── IP & rate limiting ────────────────────────────────────────────────────
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";

  if (!global._aiRateMap) global._aiRateMap = new Map();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxCalls = 20;
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