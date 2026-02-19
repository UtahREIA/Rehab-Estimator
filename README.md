# Utah REIA Rehab Estimator – Secure API Proxy

This is the Vercel backend that keeps your OpenAI API key secure.
The HTML frontend calls this proxy — the key is never exposed in the browser.

---

## 🚀 Deploy to Vercel (Step-by-Step)

### 1. Install Vercel CLI (if you haven't already)
```bash
npm install -g vercel
```

### 2. Deploy
In this folder, run:
```bash
vercel
```
Follow the prompts:
- Set up and deploy → **Y**
- Which scope → select your account
- Link to existing project? → **N** (create new)
- Project name → `rehab-estimator-proxy` (or keep existing name)
- Directory → `.` (current folder)
- Override settings → **N**

### 3. Add your OpenAI API Key as an Environment Variable

**Option A – Vercel Dashboard (recommended):**
1. Go to https://vercel.com → your project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** `sk-proj-KrzQhJD43uJ3...` (your full key)
   - **Environments:** Production, Preview, Development ✓
3. Click **Save**
4. Redeploy: `vercel --prod`

**Option B – CLI:**
```bash
vercel env add OPENAI_API_KEY
# paste your key when prompted
vercel --prod
```

### 4. Update the HTML file
Once deployed, copy your Vercel URL (e.g. `https://rehab-estimator-proxy.vercel.app`)
and it's already set in the HTML file as the proxy URL.

---

## 📁 File Structure
```
/api
  ai-pricing.js      ← Secure OpenAI proxy endpoint
  verify-phone.js    ← Phone gate verification
vercel.json          ← Vercel config + CORS headers
package.json
```

## 🔒 How Security Works
- The HTML frontend sends line items to `/api/ai-pricing`
- The Vercel server reads `OPENAI_API_KEY` from environment (never visible to users)
- The server calls OpenAI and returns only the prices
- Your API key is **never** in the HTML or JavaScript the browser downloads

## 📞 Phone Whitelist (Optional)
To restrict access to specific phone numbers, add an environment variable:
- **Name:** `ALLOWED_PHONES`  
- **Value:** `8015551234,8015555678,8015559999` (comma-separated, digits only)

If `ALLOWED_PHONES` is empty, all phone numbers are accepted.
