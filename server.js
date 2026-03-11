/* ═══════════════════════════════════════════════
   FETCH — server.js  (Backend Scraper API)
   by ayocodes  |  v1.0 — Production Ready
   Deploy: Railway / Render / Fly.io
═══════════════════════════════════════════════ */

"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const axios = require("axios");
const cheerio = require("cheerio");
const rateLimit = require("express-rate-limit");
const iconv = require("iconv-lite");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

/* ══════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════ */
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "https://fetch-liart-gamma.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

const BLOCKED_DOMAINS = [
  /* ── YOUR SITE — hardcoded protection ── */
  "fetch-liart-gamma.vercel.app", // your Vercel frontend — PROTECTED
  "fetch-v1.onrender.com", // your Render backend — prevent self-fetch
  /* ── env-based override (set FRONTEND_DOMAIN in Render dashboard) ── */
  process.env.FRONTEND_DOMAIN,
  /* ── always block local / private addresses ── */
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]
  .filter(Boolean)
  .map((d) =>
    d
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, ""),
  );

const API_SECRET =
  process.env.API_SECRET || "fetch-dev-secret-CHANGE-IN-PRODUCTION";

const PRIVATE_IP_REGEX =
  /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:)/i;

/* ══════════════════════════════════════════════
   TOKEN AUTH
══════════════════════════════════════════════ */
function generateToken(timestamp) {
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(`fetch:${timestamp}`)
    .digest("hex");
}

function validateToken(token, timestamp) {
  if (!token || !timestamp) return false;
  const ts = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(ts) || Math.abs(now - ts) > 90_000) return false;
  const expected = generateToken(ts.toString());
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token.padEnd(64, "0")),
      Buffer.from(expected.padEnd(64, "0")),
    );
  } catch {
    return false;
  }
}

/* ══════════════════════════════════════════════
   MIDDLEWARE
══════════════════════════════════════════════ */
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "10kb" }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o)))
        return cb(null, true);
      if (
        /\.vercel\.app$/.test(origin) ||
        /\.netlify\.app$/.test(origin) ||
        /\.railway\.app$/.test(origin) ||
        /\.onrender\.com$/.test(origin)
      )
        return cb(null, true);
      console.warn(`[CORS BLOCKED] origin: ${origin}`);
      cb(new Error("CORS: origin not allowed"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

/* ── RATE LIMITS ── */
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment." },
});
const fetchLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  message: { error: "Fetch limit reached (12/min). Please wait." },
});

app.use("/api/", globalLimiter);
app.use("/api/fetch", fetchLimiter);

/* ── ANTI-HOTLINK in production ── */
app.use("/api/", (req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  const ref = req.headers["referer"] || req.headers["origin"] || "";
  const ok =
    ALLOWED_ORIGINS.some((o) => ref.startsWith(o)) ||
    /\.vercel\.app/.test(ref) ||
    /\.netlify\.app/.test(ref) ||
    /\.railway\.app/.test(ref) ||
    /\.onrender\.com/.test(ref);
  if (!ok)
    return res
      .status(403)
      .json({ error: "Direct API access is not permitted." });
  next();
});

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */

/** Resolve a relative URL safely */
function resolveURL(base, relative) {
  if (!relative || typeof relative !== "string") return null;
  relative = relative.trim();
  if (
    !relative ||
    relative.startsWith("data:") ||
    relative.startsWith("javascript:")
  )
    return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

/** Fetch raw bytes + charset-decode */
async function fetchRaw(url, timeout = 12000) {
  const res = await axios.get(url, {
    timeout,
    responseType: "arraybuffer",
    maxRedirects: 6,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
    },
    validateStatus: (s) => s < 500,
  });

  if (res.status >= 400) {
    const err = new Error(`HTTP ${res.status}`);
    err.response = res;
    throw err;
  }

  const ct = res.headers["content-type"] || "";
  let charset = "utf-8";
  const m = ct.match(/charset=([^\s;]+)/i);
  if (m) charset = m[1].replace(/['"]/g, "");

  const buf = Buffer.from(res.data);

  const sniffed = buf.toString("latin1");
  const metaM = sniffed.match(/<meta[^>]+charset=["']?([^"'\s;>]+)/i);
  if (metaM && metaM[1] && !charset.toLowerCase().startsWith("utf")) {
    charset = metaM[1];
  }

  try {
    return iconv.decode(buf, charset);
  } catch {
    return buf.toString("utf-8");
  }
}

/** Fetch a text asset (CSS/JS) with a soft error */
async function fetchAsset(url, timeout = 8000) {
  try {
    const text = await fetchRaw(url, timeout);
    return text;
  } catch (e) {
    return `/* ── [FETCH ERROR: ${e.message}] ── */`;
  }
}

/** Detect JS framework from page source + script URLs */
function detectFramework(html, scriptSrcs) {
  const src = html + scriptSrcs.join(" ");
  if (/\/__next\//.test(src) || /__NEXT_DATA__/.test(src)) return "Next.js";
  if (/\/nuxt\//.test(src) || /__nuxt/.test(src)) return "Nuxt.js";
  if (/remix-run/.test(src) || /window\.__remixContext/.test(src))
    return "Remix";
  if (/gatsby/.test(src)) return "Gatsby";
  if (
    /react(-dom)?\.production/.test(src) ||
    /_reactFiber/.test(html) ||
    /\breact\b/.test(src)
  )
    return "React";
  if (/vue(\.runtime|\.esm|\.global)?\./.test(src) || /__vue__/.test(src))
    return "Vue.js";
  if (/angular(\.min)?\.js|ng-version/.test(src)) return "Angular";
  if (/svelte/.test(src)) return "Svelte";
  if (/astro/.test(src)) return "Astro";
  if (/jquery(\.min)?\.js/.test(src)) return "jQuery";
  if (/tailwind/.test(src)) return "Tailwind CSS";
  if (/bootstrap(\.min)?\.css|bootstrap(\.min)?\.js/.test(src))
    return "Bootstrap";
  if (/wp-content|wp-includes/.test(src)) return "WordPress";
  if (/shopify/.test(src)) return "Shopify";
  return "Vanilla HTML/CSS/JS";
}

/** Classify an asset URL by type */
function classifyAsset(url) {
  const u = url.toLowerCase();
  if (/\.(png|jpe?g|gif|svg|webp|avif|ico)(\?|$)/.test(u)) return "image";
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(u)) return "font";
  if (/\.(mp4|webm|ogg|mov|avi)(\?|$)/.test(u)) return "video";
  if (/fonts\.googleapis|fonts\.gstatic/.test(u)) return "font";
  if (/\.(mp3|wav|flac|aac)(\?|$)/.test(u)) return "audio";
  return "other";
}

/* ══════════════════════════════════════════════
   GET /api/token
══════════════════════════════════════════════ */
app.get("/api/token", (req, res) => {
  const timestamp = Date.now().toString();
  const token = generateToken(timestamp);
  res.json({ token, timestamp });
});

/* ══════════════════════════════════════════════
   POST /api/fetch  — main scrape endpoint
══════════════════════════════════════════════ */
app.post("/api/fetch", async (req, res) => {
  const startTime = Date.now();
  const { token, timestamp, includeAssets = true } = req.body;
  let { url } = req.body;

  /* ── Token validation (production only) ── */
  if (process.env.NODE_ENV === "production") {
    if (!validateToken(token, timestamp)) {
      return res.status(401).json({
        error: "Invalid or expired request token. Refresh and try again.",
      });
    }
  }

  /* ── URL validation ── */
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL." });
  }
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  let parsedURL;
  try {
    parsedURL = new URL(url);
  } catch {
    return res
      .status(400)
      .json({ error: "Cannot parse URL. Please include https://" });
  }

  const hostname = parsedURL.hostname.toLowerCase();

  /* ── Block private / local addresses ── */
  if (PRIVATE_IP_REGEX.test(hostname)) {
    return res
      .status(403)
      .json({ error: "Fetching private or local addresses is not allowed." });
  }

  /* ── Block own domains ── */
  if (
    BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))
  ) {
    return res.status(403).json({
      error: "🔒 This domain is protected and cannot be scraped by FETCH.",
    });
  }

  /* ══════════════════════════════════════
     SCRAPE PIPELINE
  ══════════════════════════════════════ */
  try {
    /* 1. Fetch main HTML page */
    const rawHTML = await fetchRaw(url, 15000);
    const $ = cheerio.load(rawHTML, { decodeEntities: false });

    /* ── 2. Collect CSS links (external) ── */
    const cssLinks = [];
    $('link[rel="stylesheet"], link[type="text/css"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const abs = resolveURL(url, href);
        if (abs) cssLinks.push(abs);
      }
    });

    /* ── 3. Inline <style> blocks ── */
    const inlineStyles = [];
    $("style").each((_, el) => {
      const c = $(el).html();
      if (c && c.trim().length > 5) inlineStyles.push(c.trim());
    });

    /* ── 4. Collect JS script src links ── */
    const scriptSrcs = [];
    $("script[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const abs = resolveURL(url, src);
        if (abs) scriptSrcs.push(abs);
      }
    });

    /* ── 5. Inline <script> blocks ── */
    const inlineScripts = [];
    $("script:not([src])").each((_, el) => {
      const c = $(el).html();
      if (c && c.trim().length > 20) inlineScripts.push(c.trim());
    });

    /* ── 6. Fetch external CSS in parallel (up to 15 files) ── */
    const cssResults = await Promise.allSettled(
      cssLinks.slice(0, 15).map(async (u2) => {
        const text = await fetchAsset(u2, 8000);
        return `/* ════════════════════════════════════\n   SOURCE: ${u2}\n════════════════════════════════════ */\n${text}`;
      }),
    );

    const externalCSS = cssResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n\n");

    const combinedCSS = [
      externalCSS,
      inlineStyles.length
        ? `/* ════ INLINE STYLES ════ */\n${inlineStyles.join("\n\n/* ── next inline block ── */\n\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    /* ── 7. Fetch external JS in parallel (up to 15 files) ── */
    const jsResults = await Promise.allSettled(
      scriptSrcs.slice(0, 15).map(async (u2) => {
        const text = await fetchAsset(u2, 8000);
        return `/* ════════════════════════════════════\n   SOURCE: ${u2}\n════════════════════════════════════ */\n${text}`;
      }),
    );

    const externalJS = jsResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n\n");

    const combinedJS = [
      externalJS,
      inlineScripts.length
        ? `/* ════ INLINE SCRIPTS ════ */\n${inlineScripts.join("\n\n/* ── next inline block ── */\n\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    /* ── 8. Clean HTML ── */
    $("script:not([src])").each((_, el) =>
      $(el).html("/* extracted — see JS tab */"),
    );
    $("style").each((_, el) => $(el).html("/* extracted — see CSS tab */"));
    const cleanedHTML = $.html();

    /* ── 9. Meta tags ── */
    const metaTags = [];
    $("title").each((_, el) =>
      metaTags.push({ name: "title", content: $(el).text().trim() }),
    );
    $("meta").each((_, el) => {
      const name =
        $(el).attr("name") ||
        $(el).attr("property") ||
        $(el).attr("http-equiv");
      const content = $(el).attr("content") || $(el).attr("charset");
      if (name && content) metaTags.push({ name, content });
    });
    $('link[rel="canonical"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) metaTags.push({ name: "canonical", content: href });
    });

    /* ── 10. Asset discovery ── */
    const assets = [];
    if (includeAssets) {
      $("img").each((_, el) => {
        const src =
          $(el).attr("src") ||
          $(el).attr("data-src") ||
          $(el).attr("data-lazy-src");
        if (src) {
          const abs = resolveURL(url, src);
          if (abs)
            assets.push({
              type: "image",
              tag: "img",
              url: abs,
              alt: $(el).attr("alt") || "",
            });
        }
        const ss = $(el).attr("srcset");
        if (ss) {
          ss.split(",").forEach((entry) => {
            const [s] = entry.trim().split(/\s+/);
            if (s) {
              const abs2 = resolveURL(url, s);
              if (abs2 && !assets.find((a) => a.url === abs2))
                assets.push({ type: "image", tag: "img-srcset", url: abs2 });
            }
          });
        }
      });
      cssLinks.forEach((u2) =>
        assets.push({ type: "stylesheet", tag: "link", url: u2 }),
      );
      scriptSrcs.forEach((u2) =>
        assets.push({ type: "script", tag: "script", url: u2 }),
      );
      $("link").each((_, el) => {
        const rel = $(el).attr("rel") || "";
        const href = $(el).attr("href");
        if (!href) return;
        if (rel.includes("icon") || rel.includes("apple-touch")) {
          const abs = resolveURL(url, href);
          if (abs) assets.push({ type: "icon", tag: "link", url: abs });
        }
      });
      $("video source, audio source").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          const abs = resolveURL(url, src);
          if (abs)
            assets.push({ type: classifyAsset(abs), tag: "source", url: abs });
        }
      });
      const fontRegex =
        /url\(['"]?([^'")\s]+\.(?:woff2?|ttf|otf|eot)[^'")\s]*)['"]?\)/gi;
      let fm;
      while ((fm = fontRegex.exec(combinedCSS)) !== null) {
        const abs = resolveURL(url, fm[1]);
        if (abs && !assets.find((a) => a.url === abs))
          assets.push({ type: "font", tag: "css-url", url: abs });
      }
    }

    const seenUrls = new Set();
    const dedupedAssets = assets.filter((a) => {
      if (seenUrls.has(a.url)) return false;
      seenUrls.add(a.url);
      return true;
    });

    const framework = detectFramework(rawHTML, scriptSrcs);
    const pageTitle = $("title").first().text().trim() || parsedURL.hostname;
    const pageDesc =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";
    const faviconHref =
      $('link[rel~="icon"]').first().attr("href") ||
      $('link[rel="shortcut icon"]').attr("href");
    const favicon = faviconHref ? resolveURL(url, faviconHref) : null;

    const stats = {
      htmlLines: cleanedHTML.split("\n").length,
      cssLines: combinedCSS ? combinedCSS.split("\n").length : 0,
      jsLines: combinedJS ? combinedJS.split("\n").length : 0,
      cssFiles: cssLinks.length,
      jsFiles: scriptSrcs.length,
      images: dedupedAssets.filter((a) => a.type === "image").length,
      totalAssets: dedupedAssets.length,
      fetchTimeMs: Date.now() - startTime,
    };

    return res.json({
      success: true,
      url,
      pageTitle,
      pageDescription: pageDesc,
      favicon,
      framework,
      html: cleanedHTML,
      css: combinedCSS || "/* No external CSS found */",
      js: combinedJS || "/* No external JS found */",
      meta: metaTags,
      assets: dedupedAssets.slice(0, 120),
      stats,
    });
  } catch (err) {
    console.error("[FETCH ERROR]", err.code || "", err.message);

    if (err.code === "ECONNREFUSED")
      return res
        .status(502)
        .json({ error: "Could not connect to that site. It may be offline." });
    if (
      err.code === "ETIMEDOUT" ||
      err.code === "ECONNABORTED" ||
      err.name === "AbortError"
    )
      return res.status(504).json({
        error: "Request timed out. The site took too long to respond.",
      });
    if (err.code === "ENOTFOUND")
      return res
        .status(502)
        .json({ error: "Domain not found. Check the URL and try again." });
    if (
      err.code === "CERT_HAS_EXPIRED" ||
      err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    )
      return res
        .status(502)
        .json({ error: "SSL certificate error on target site." });
    if (err.response?.status === 403)
      return res.status(403).json({
        error: "The target site denied access (403). It may block scrapers.",
      });
    if (err.response?.status === 404)
      return res
        .status(404)
        .json({ error: "Page not found on that site (404)." });
    if (err.response?.status === 429)
      return res.status(429).json({
        error: "The target site is rate-limiting us. Try again in a moment.",
      });

    return res.status(500).json({ error: `Scrape failed: ${err.message}` });
  }
});

/* ══════════════════════════════════════════════
   GET /health
══════════════════════════════════════════════ */
app.get("/health", (_, res) =>
  res.json({
    status: "ok",
    service: "FETCH API by ayocodes",
    version: "1.0.0",
    time: new Date().toISOString(),
    uptime: process.uptime(),
  }),
);

/* ── 404 ── */
app.use((_, res) => res.status(404).json({ error: "Endpoint not found." }));

/* ── Global error handler ── */
app.use((err, req, res, _next) => {
  console.error("[UNHANDLED]", err.message);
  res.status(500).json({ error: "Internal server error." });
});

/* ── START ── */
app.listen(PORT, () => {
  console.log(`\n⚡  FETCH backend  →  http://localhost:${PORT}`);
  console.log(`    Health         →  http://localhost:${PORT}/health`);
  console.log(`    Mode           →  ${process.env.NODE_ENV || "development"}`);
  console.log(`    Protected      →  ${BLOCKED_DOMAINS.join(", ")}\n`);
});
