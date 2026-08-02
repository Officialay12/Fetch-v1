<div align="center">

<img src="https://i.ibb.co/qLjTWkCJ/fetch-cover.jpg" alt="FETCH — Web Code Extractor & JS Deobfuscator" width="100%" />

<br /><br />

<img src="frontend/icons/icon-192.png" alt="FETCH icon" width="96" height="96" />

# [ FETCH ]
### Web Code Extractor & AI JavaScript Deobfuscator

**Paste any URL. Get its real HTML, CSS & JavaScript — instantly.**
**Paste minified or obfuscated JS. Get clean, readable code — powered by FETCH AI.**

<br />

[![Live App](https://img.shields.io/badge/Live%20App-fetch--liart--gamma.vercel.app-00e5ff?style=for-the-badge&logo=vercel&logoColor=black)](https://fetch-liart-gamma.vercel.app)
[![Version](https://img.shields.io/badge/version-2.0.0-ffb700?style=for-the-badge)](#)
[![Built by](https://img.shields.io/badge/Built%20by-ayocodes-181717?style=for-the-badge&logo=github)](https://github.com/Officialay12)

</div>

---

## Overview

**FETCH** is a developer utility for reverse-engineering the web. Give it a URL and it returns the site's actual HTML, CSS, and JavaScript — no DevTools diving, no view-source spelunking. Give it a chunk of minified or obfuscated JavaScript and its AI deobfuscator renames variables, restores structure, and hands back something you can actually read.

Version 2.0 turns FETCH from a single-page scraping tool into a full product: accounts and a persistent history synced to the cloud, plus an installable Progressive Web App — all still running on a lightweight Node.js backend with zero front-end frameworks.

---

## What's New in v2.0

|     | Addition               | Details                                                                       |
| --- | ---------------------- | ----------------------------------------------------------------------------- |
| 🧠   | **AI Deobfuscator**    | Paste obfuscated/minified JS and get a readable rewrite, powered by Groq      |
| 🔐   | **Accounts & Auth**    | Email/password sign-up plus one-tap Google Sign-In, backed by JWT sessions    |
| 🗄️   | **Persistent History** | Fetches and deobfuscations are saved to MongoDB and follow you across devices |
| 📲   | **Installable PWA**    | Add FETCH to your home screen with offline fallback and background updates    |

---

## Core Features

|     | Feature                  | Description                                                              |
| --- | ------------------------ | ------------------------------------------------------------------------ |
| ⚡   | **Real Code Extraction** | Fetches live HTML and pulls every linked CSS file and JS bundle          |
| 🧠   | **AI JS Deobfuscator**   | Cleans up minified/obfuscated JavaScript into readable code              |
| 🔍   | **Framework Detection**  | Identifies React, Vue, Next.js, Nuxt, Svelte, Angular, Astro & more      |
| 🗂️   | **Asset Mapper**         | Lists every image, font, video, and external resource with resolved URLs |
| 🏷️   | **Full Meta Audit**      | Extracts all meta tags, Open Graph, Twitter cards, and canonical URLs    |
| 📦   | **ZIP Download**         | Export extracted files — HTML, CSS, JS, meta report, and asset list      |
| 🕐   | **Synced History**       | Your last fetches and deobfuscations, saved to your account              |
| 🔎   | **In-Code Search**       | Search extracted HTML, CSS, or JS with highlighted results               |
| 📲   | **Installable App**      | Works offline-first as a PWA on desktop and mobile                       |
| 🌙   | **Dark / Light Mode**    | Theme preference saved locally                                           |

---

## Project Structure

```
Fetch-v1/
├── backend/
│   ├── server.js          ← Express API — scraping, auth, deobfuscation
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── index.html          ← Main app — scraper + deobfuscator
    ├── auth.html           ← Sign in / create account
    ├── style.css / auth.css
    ├── script.js / auth.js
    ├── manifest.json       ← PWA manifest
    ├── sw.js               ← Service worker
    ├── pwa.js               ← Install prompt + update handling
    └── offline.html         ← Offline fallback page
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

Open `frontend/index.html` in your browser. No build step required.

---

## Environment Variables

| Variable           | Required    | Purpose                                              |
| ------------------ | ----------- | ---------------------------------------------------- |
| `MONGODB_URI`      | ✅           | Database connection for users, history, and sessions |
| `JWT_SECRET`       | ✅           | Signs and verifies authentication tokens             |
| `GOOGLE_CLIENT_ID` | Optional    | Enables "Continue with Google" — disabled without it |
| `GROQ_API_KEY`     | Optional    | Powers the AI deobfuscator — disabled without it     |
| `FRONTEND_URL`     | Recommended | Used for CORS allow-listing in production            |
| `NODE_ENV`         | Recommended | Set to `production` on deploy                        |
| `API_SECRET`       | Recommended | Used to sign short-lived request tokens              |

The server fails fast on boot if `MONGODB_URI` or `JWT_SECRET` is missing, and logs a warning (without failing) if the Google or Groq keys aren't set — those features simply turn themselves off.

---

## Deployment

### Backend

To deploy your own:
1. Provision a Node.js host (e.g. Render, Railway, Fly.io)
2. Point it at the `backend/` folder
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add the environment variables listed above

### Frontend → Vercel

The frontend is live at **[fetch-liart-gamma.vercel.app](https://fetch-liart-gamma.vercel.app)**

To deploy your own:
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import this GitHub repo
3. Set the root directory to `frontend/`
4. Framework preset: **Other**
5. Deploy — no build step needed

---

## How It Works

**Scraping**
```
User enters a URL
      ↓
Frontend requests a signed token from /api/token  (HMAC, 90s expiry)
      ↓
Frontend sends an authenticated POST /api/fetch  { url, token, timestamp }
      ↓
Backend (server.js):
  1. Verifies the JWT session, validates the token, and enforces rate limits
  2. Fetches the raw HTML of the target URL via Axios
  3. Parses the DOM with Cheerio
  4. Resolves and fetches every <link rel="stylesheet"> file
  5. Resolves and fetches every <script src="..."> file
  6. Extracts inline <style> and <script> blocks
  7. Collects meta tags, images, fonts, videos, and icons
  8. Detects the framework from bundle signatures
  9. Saves the result to the user's history
      ↓
Returns { html, css, js, meta, assets, framework, stats }
      ↓
Frontend renders syntax-highlighted code with line numbers
User can copy, search, or download a ZIP
```

**Deobfuscation**
```
User pastes minified/obfuscated JavaScript
      ↓
Backend sends the code to Groq's LLM API with a deobfuscation prompt
      ↓
Model returns renamed variables, restored formatting, and readable structure
      ↓
Result is saved to history and returned to the frontend
```

---

## API Reference

| Endpoint             | Method | Auth | Description                                         |
| -------------------- | ------ | ---- | --------------------------------------------------- |
| `/health`            | `GET`  | —    | Health check → `{ status: "ok" }`                   |
| `/api/token`         | `GET`  | —    | Get a signed HMAC request token                     |
| `/api/config`        | `GET`  | —    | Public config (e.g. whether Google auth is enabled) |
| `/api/auth/register` | `POST` | —    | Create an account with email/password               |
| `/api/auth/login`    | `POST` | —    | Sign in with email/password                         |
| `/api/auth/google`   | `POST` | —    | Sign in / register via Google OAuth                 |
| `/api/auth/verify`   | `GET`  | ✅    | Verify the current session token                    |
| `/api/auth/logout`   | `POST` | ✅    | Invalidate the current session                      |
| `/api/auth/profile`  | `GET`  | ✅    | Get the signed-in user's profile                    |
| `/api/fetch`         | `POST` | ✅    | Scrape a URL and return extracted code              |

**POST `/api/fetch` — request body:**
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

| Layer               | Tech                                          |
| ------------------- | --------------------------------------------- |
| Frontend            | HTML5, CSS3, Vanilla JS, Service Worker (PWA) |
| Backend             | Node.js, Express                              |
| Database            | MongoDB (Mongoose)                            |
| Auth                | JWT, bcrypt, Google OAuth 2.0                 |
| AI                  | Groq (JavaScript deobfuscation)               |
| Parsing             | Cheerio                                       |
| HTTP                | Axios                                         |
| Security            | Helmet, CORS, express-rate-limit, HMAC tokens |
| Syntax Highlighting | Highlight.js                                  |
| ZIP Export          | JSZip                                         |
| Frontend Deploy     | Vercel                                        |

---

## Limitations

- **Bot-protected sites** — sites behind Cloudflare or aggressive bot detection may block the scraper
- **SPAs / client-rendered apps** — React apps that render entirely in the browser return minimal HTML (the JS bundle is captured, but not the rendered DOM)
- **Auth-gated pages** — private or login-required pages cannot be accessed
- **Rate limits** — requests are limited per authenticated user to keep the service fair for everyone


---

<div align="center">

Built with 🖤 by **ayocodes**

[![GitHub](https://img.shields.io/badge/GitHub-Officialay12-181717?style=flat-square&logo=github)](https://github.com/Officialay12)
[![Twitter](https://img.shields.io/badge/X-sung__tech-000000?style=flat-square&logo=x)](https://x.com/sung_tech)

*© 2026 FETCH. All rights reserved.*

</div>
