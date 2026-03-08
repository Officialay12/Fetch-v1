# [FETCH] — Web Code Extractor
> Paste any URL. Get the real, accurate HTML, CSS & JavaScript. Instantly.

**Live demo → [fetch-liart-gamma.vercel.app](https://fetch-liart-gamma.vercel.app)**

---

## What is FETCH?

FETCH is a developer tool that reverse-engineers any public website — extracting its actual HTML, CSS, and JavaScript source code in seconds. No DevTools diving. No view-source hunting. Just paste a URL and go.

Built with a Node.js scraping backend and a clean static frontend. Zero frameworks, zero bloat.

---

## Features

- ⚡ **Real code extraction** — fetches live HTML, pulls every linked CSS file and JS bundle
- 🔍 **Framework detection** — identifies React, Vue, Next.js, Nuxt, Svelte, Angular, Astro and more
- 🗂️ **Asset mapper** — lists every image, font, video and external resource with resolved URLs
- 🏷️ **Full meta audit** — extracts all meta tags, Open Graph, Twitter cards and canonical URLs
- 📦 **ZIP download** — export all extracted files (HTML + CSS + JS + meta report + asset list)
- 🕐 **Fetch history** — last 10 fetched sites saved locally, re-run in one click
- 🔎 **In-code search** — search across extracted HTML, CSS or JS with highlighted results
- 🌙 **Dark / light mode** — theme preference saved locally

---

## Project Structure

```
Fetch-v1/
├── backend/
│   ├── server.js          ← Express API — scraping engine
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── index.html         ← Full single-page app
    ├── style.css          ← All styles
    └── script.js          ← All frontend logic
```

---

## Running Locally

**1. Start the backend**
```bash
cd backend
npm install
node server.js
# API running at http://localhost:3001
```

**2. Open the frontend**

Just open `frontend/index.html` in your browser. No build step needed.

---

## Deployment

### Backend → Render.com (live)

The backend is deployed at **`https://fetch-v1.onrender.com`**

To deploy your own:
1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo, select the `backend/` folder
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables:
   ```
   NODE_ENV=production
   API_SECRET=your-secret-here
   FRONTEND_URL=https://your-site.vercel.app
   ```

> **Note:** Render free tier spins down after inactivity. First request after sleep may take ~30 seconds (cold start).

### Frontend → Vercel (live)

The frontend is deployed at **[fetch-liart-gamma.vercel.app](https://fetch-liart-gamma.vercel.app)**

To deploy your own:
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import this GitHub repo
3. Set root directory to `frontend/`
4. Framework preset: **Other**
5. Deploy — no build step needed

---

## How It Works

```
User enters URL
      ↓
Frontend requests signed token from /api/token (HMAC, 90s expiry)
      ↓
Frontend sends POST /api/fetch  { url, token, timestamp }
      ↓
Backend (server.js):
  1. Validates token + rate limits request
  2. Fetches raw HTML of target URL via Axios
  3. Parses DOM with Cheerio
  4. Resolves + fetches all <link rel="stylesheet"> files
  5. Resolves + fetches all <script src="..."> files
  6. Extracts inline <style> and <script> blocks
  7. Collects all meta tags, images, fonts, videos, icons
  8. Detects framework from bundle signatures
      ↓
Returns { html, css, js, meta, assets, framework, stats }
      ↓
Frontend renders syntax-highlighted code with line numbers
User can copy, search, or download a ZIP
```

---

## API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check → `{ status: "ok" }` |
| `/api/token` | GET | Get a signed HMAC request token |
| `/api/fetch` | POST | Scrape a URL and return extracted code |

**POST /api/fetch — request body:**
```json
{
  "url": "https://example.com",
  "includeAssets": true,
  "detectFramework": true,
  "token": "<from /api/token>",
  "timestamp": "<from /api/token>"
}
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS |
| Backend | Node.js, Express |
| Parsing | Cheerio |
| HTTP | Axios |
| Security | Helmet, CORS, express-rate-limit, HMAC tokens |
| Syntax highlighting | Highlight.js |
| ZIP export | JSZip |
| Deploy — frontend | Vercel |
| Deploy — backend | Render |

---

## Limitations

- **Bot-protected sites** — sites behind Cloudflare or aggressive bot detection may block the scraper
- **SPAs / client-rendered apps** — React/Next apps that render entirely in the browser return minimal HTML (the JS bundle is captured, but not the rendered DOM)
- **Auth-gated pages** — private or login-required pages cannot be accessed
- **Rate limits** — 60 requests/min globally, 12 fetch requests/min per IP

---

## Creator

Built by **ayocodes** — [GitHub](https://github.com/Officialay12) · [X/Twitter](https://x.com/sung_tech)

---

*© 2026 FETCH. All rights reserved.*
