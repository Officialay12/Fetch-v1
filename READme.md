# FETCH — Real Web Code Extractor
### by ayocodes

> Paste any URL → get the real, accurate HTML, CSS & JavaScript from that website.

---

## Project Structure

```
fetch-v2/
├── backend/          ← Node.js scraper API (deploy to Railway/Render)
│   ├── server.js
│   ├── package.json
│   ├── railway.json
│   └── .env.example
└── frontend/         ← Static site (deploy to Vercel/Netlify)
    ├── index.html
    ├── style.css
    └── script.js
```

---

## Step 1 — Run Backend Locally (Dev)

```bash
cd backend
npm install
node server.js
# Server starts at http://localhost:3001
```

Then open `frontend/index.html` in a browser.
Click the ⚙️ gear icon and set your backend URL to `http://localhost:3001`.

---

## Step 2 — Deploy Backend to Railway (Free)

1. Go to **https://railway.app** → New Project → Deploy from GitHub
2. Push your `backend/` folder to a GitHub repo
3. Railway auto-detects Node.js and runs `node server.js`
4. Add environment variable in Railway dashboard:
   ```
   FRONTEND_URL = https://your-site.vercel.app
   ```
5. Copy your Railway public URL (e.g. `https://fetch-backend.up.railway.app`)

**Alternative: Render.com (also free)**
1. Go to https://render.com → New Web Service
2. Connect your GitHub repo (backend folder)
3. Build command: `npm install`
4. Start command: `node server.js`
5. Set env var: `FRONTEND_URL=https://your-site.vercel.app`

---

## Step 3 — Deploy Frontend to Vercel

1. Go to **https://vercel.com** → New Project
2. Import your GitHub repo (frontend folder)
3. No build step needed — it's static HTML/CSS/JS
4. Deploy!

**Alternative: Netlify**
1. Drag and drop the `frontend/` folder to https://app.netlify.com/drop

---

## Step 4 — Connect Frontend to Backend

After deploying:
1. Open your Vercel/Netlify URL
2. Click the **⚙️ gear icon** in the app bar
3. Enter your Railway/Render backend URL
4. Click **Save**
5. Start fetching! 🚀

---

## How It Works

```
User enters URL
    ↓
Frontend sends POST /api/fetch to your backend
    ↓
Node.js backend (server.js):
  1. Fetches the raw HTML of the target URL
  2. Parses DOM with Cheerio
  3. Finds all <link rel="stylesheet"> → fetches each CSS file
  4. Finds all <script src="..."> → fetches each JS file
  5. Extracts inline <style> and <script> blocks
  6. Collects all meta tags, images, fonts, assets
  7. Detects framework (React/Vue/Next.js etc.)
    ↓
Returns real HTML + CSS + JS + meta + assets to frontend
    ↓
Frontend renders syntax-highlighted code with line numbers
User can copy / download ZIP
```

---

## Notes

- **CORS**: The backend handles all cross-origin fetching — browsers can't do this directly
- **Rate limit**: 30 requests/min per IP (adjustable in server.js)
- **Some sites block scrapers**: Sites with aggressive bot protection (Cloudflare, etc.) may return errors
- **JS-rendered content**: Server-side rendered and static sites work best. SPAs may return minimal HTML (their content is rendered by JS in the browser, which our server-side scraper can't execute)

---

## Tech Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Frontend | HTML5, CSS3, Vanilla JS       |
| Backend  | Node.js, Express              |
| Parsing  | Cheerio (server-side jQuery)  |
| HTTP     | Axios                         |
| Security | Helmet, CORS, Rate limiting   |
| Deploy   | Vercel (frontend) + Railway (backend) |

---

*Built by ayocodes*
