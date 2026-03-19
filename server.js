/* ═══════════════════════════════════════════════
   FETCH — server.js  (Backend Scraper API)
   by ayocodes  |  v1.0 — Production Ready
   Deploy: Render / Railway / Fly.io
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
  "https://fetch-v1.onrender.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

const BLOCKED_DOMAINS = [
  "fetch-liart-gamma.vercel.app",
  "fetch-v1.onrender.com",
  process.env.FRONTEND_DOMAIN,
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
  process.env.API_SECRET || crypto.randomBytes(32).toString("hex");
const PRIVATE_IP_REGEX =
  /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:)/i;

// Rotating user agents to avoid detection
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
];

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
  if (isNaN(ts) || Math.abs(now - ts) > 300000) return false; // 5 minutes
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
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: "50mb" }));

// CORS configuration - allow all for maximum compatibility
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

/* ── RATE LIMITS ── */
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment." },
});

const fetchLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: { error: "Fetch limit reached (30/min). Please wait." },
});

app.use("/api/", globalLimiter);
app.use("/api/fetch", fetchLimiter);

/* ══════════════════════════════════════════════
   HEALTH CHECK ENDPOINT
══════════════════════════════════════════════ */
app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    service: "FETCH API by ayocodes",
    version: "1.0.0",
    time: new Date().toISOString(),
    uptime: process.uptime(),
    endpoints: ["/api/token", "/api/fetch", "/health"],
  });
});

/* ══════════════════════════════════════════════
   TOKEN ENDPOINT
══════════════════════════════════════════════ */
app.get("/api/token", (req, res) => {
  try {
    const timestamp = Date.now().toString();
    const token = generateToken(timestamp);
    res.json({
      success: true,
      token,
      timestamp,
    });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate token",
    });
  }
});

/* ══════════════════════════════════════════════
   HELPER FUNCTIONS
══════════════════════════════════════════════ */

/** Get random user agent to avoid detection */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Get random browser headers */
function getRandomHeaders() {
  return {
    "User-Agent": getRandomUserAgent(),
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Ch-Ua":
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Connection: "keep-alive",
  };
}

/** Resolve a relative URL safely */
function resolveURL(base, relative) {
  if (!relative || typeof relative !== "string") return null;
  relative = relative.trim();
  if (
    !relative ||
    relative.startsWith("data:") ||
    relative.startsWith("javascript:")
  ) {
    return null;
  }
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

/** Advanced fetch with retry and bypass techniques */
async function advancedFetch(url, timeout = 20000, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[FETCH ATTEMPT ${attempt}] ${url}`);

      const headers = getRandomHeaders();

      const config = {
        timeout,
        responseType: "arraybuffer",
        maxRedirects: 8,
        maxContentLength: 50 * 1024 * 1024,
        headers,
        validateStatus: (s) => s < 500,
        decompress: true,
      };

      const res = await axios.get(url, config);

      if (res.status >= 400) {
        const err = new Error(`HTTP ${res.status}`);
        err.response = res;
        throw err;
      }

      // Detect charset
      const ct = res.headers["content-type"] || "";
      let charset = "utf-8";
      const m = ct.match(/charset=([^\s;]+)/i);
      if (m) charset = m[1].replace(/['"]/g, "");

      const buf = Buffer.from(res.data);

      // Try to detect charset from HTML meta tags
      const sniffed = buf.toString("latin1").slice(0, 5000);
      const metaM = sniffed.match(/<meta[^>]+charset=["']?([^"'\s;>]+)/i);
      if (metaM && metaM[1] && !charset.toLowerCase().startsWith("utf")) {
        charset = metaM[1];
      }

      try {
        return {
          html: iconv.decode(buf, charset),
          headers: res.headers,
          status: res.status,
        };
      } catch {
        return {
          html: buf.toString("utf-8"),
          headers: res.headers,
          status: res.status,
        };
      }
    } catch (error) {
      lastError = error;
      console.log(`[ATTEMPT ${attempt} FAILED]`, error.message);

      if (attempt < retries) {
        const delay = attempt * 2000;
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

/** Fetch a text asset (CSS/JS) with retry logic */
async function fetchAsset(url, timeout = 10000, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers = getRandomHeaders();

      const config = {
        timeout,
        responseType: "arraybuffer",
        headers,
        validateStatus: (s) => s < 500,
      };

      const res = await axios.get(url, config);

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`);
      }

      const ct = res.headers["content-type"] || "";
      let charset = "utf-8";
      const m = ct.match(/charset=([^\s;]+)/i);
      if (m) charset = m[1].replace(/['"]/g, "");

      const buf = Buffer.from(res.data);

      try {
        return iconv.decode(buf, charset);
      } catch {
        return buf.toString("utf-8");
      }
    } catch (error) {
      if (attempt === retries) {
        return `/* ── [FETCH ERROR: ${error.message}] ── */`;
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return `/* ── [FETCH FAILED] ── */`;
}

/** Extract inline scripts and styles */
function extractInlineCode($) {
  const inlineScripts = [];
  const inlineStyles = [];

  $("script:not([src])").each((_, el) => {
    const content = $(el).html();
    if (content && content.trim().length > 20) {
      inlineScripts.push(content.trim());
    }
  });

  $("style").each((_, el) => {
    const content = $(el).html();
    if (content && content.trim().length > 5) {
      inlineStyles.push(content.trim());
    }
  });

  return { inlineScripts, inlineStyles };
}

/** Extract all resources from HTML */
function extractResources($, baseUrl) {
  const resources = {
    scripts: [],
    stylesheets: [],
    images: [],
    fonts: [],
    meta: [],
  };

  // Scripts
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const abs = resolveURL(baseUrl, src);
      if (abs) resources.scripts.push(abs);
    }
  });

  // Stylesheets
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const abs = resolveURL(baseUrl, href);
      if (abs) resources.stylesheets.push(abs);
    }
  });

  // Images
  $("img").each((_, el) => {
    const src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src");
    if (src) {
      const abs = resolveURL(baseUrl, src);
      if (abs) {
        resources.images.push(abs);
      }
    }
  });

  // Meta tags
  $("title").each((_, el) => {
    resources.meta.push({ name: "title", content: $(el).text().trim() });
  });

  $("meta").each((_, el) => {
    const name =
      $(el).attr("name") || $(el).attr("property") || $(el).attr("http-equiv");
    const content = $(el).attr("content") || $(el).attr("charset");
    if (name && content) {
      resources.meta.push({ name, content });
    }
  });

  return resources;
}

/** Detect JS framework */
function detectFramework(html, scripts) {
  const combined = html + " " + scripts.join(" ");

  if (combined.includes("__NEXT_DATA__") || combined.includes("/_next/"))
    return "Next.js";
  if (combined.includes("__NUXT__") || combined.includes("/_nuxt/"))
    return "Nuxt.js";
  if (combined.includes("__remixContext") || combined.includes("@remix-run"))
    return "Remix";
  if (combined.includes("gatsby-") || combined.includes("___gatsby"))
    return "Gatsby";
  if (
    combined.includes("react") ||
    combined.includes("ReactDOM") ||
    combined.includes("useState")
  )
    return "React";
  if (
    combined.includes("vue") ||
    combined.includes("__VUE__") ||
    combined.includes("createApp")
  )
    return "Vue.js";
  if (combined.includes("angular") || combined.includes("ng-version"))
    return "Angular";
  if (combined.includes("svelte") || combined.includes("__SVELTE__"))
    return "Svelte";
  if (combined.includes("astro") || combined.includes("__ASTRO__"))
    return "Astro";
  if (combined.includes("jquery") || combined.includes("$.")) return "jQuery";
  if (combined.includes("tailwind") || combined.includes("@tailwind"))
    return "Tailwind CSS";
  if (combined.includes("bootstrap") || combined.includes("data-bs-"))
    return "Bootstrap";
  if (combined.includes("wp-content") || combined.includes("wp-includes"))
    return "WordPress";
  if (combined.includes("shopify") || combined.includes("cdn.shopify"))
    return "Shopify";

  return "Vanilla HTML/CSS/JS";
}

/* ══════════════════════════════════════════════
   POST /api/fetch  — main scrape endpoint
══════════════════════════════════════════════ */
app.post("/api/fetch", async (req, res) => {
  const startTime = Date.now();
  const { token, timestamp, includeAssets = true } = req.body;
  let { url } = req.body;

  console.log(`[FETCH REQUEST] ${url}`);

  /* ── URL validation ── */
  if (!url || typeof url !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid URL.",
    });
  }

  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  let parsedURL;
  try {
    parsedURL = new URL(url);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Cannot parse URL. Please include https://",
    });
  }

  const hostname = parsedURL.hostname.toLowerCase();

  /* ── Block private / local addresses ── */
  if (PRIVATE_IP_REGEX.test(hostname)) {
    return res.status(403).json({
      success: false,
      error: "Fetching private or local addresses is not allowed.",
    });
  }

  /* ── Block own domains ── */
  if (
    BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))
  ) {
    return res.status(403).json({
      success: false,
      error: "🔒 This domain is protected and cannot be scraped by FETCH.",
    });
  }

  /* ══════════════════════════════════════
     SCRAPE PIPELINE
  ══════════════════════════════════════ */
  try {
    /* 1. Fetch main HTML page with bypass */
    const result = await advancedFetch(url, 20000, 3);
    const rawHTML = result.html;

    const $ = cheerio.load(rawHTML, { decodeEntities: false });

    /* ── 2. Collect CSS links ── */
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

    /* ── 6. Fetch external CSS in parallel ── */
    const cssResults = await Promise.allSettled(
      cssLinks.slice(0, 20).map(async (u2) => {
        const text = await fetchAsset(u2, 8000, 2);
        return `/* SOURCE: ${u2} */\n${text}`;
      }),
    );

    const externalCSS = cssResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n\n");

    const combinedCSS = [
      externalCSS,
      inlineStyles.length
        ? `/* INLINE STYLES */\n${inlineStyles.join("\n\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    /* ── 7. Fetch external JS in parallel ── */
    const jsResults = await Promise.allSettled(
      scriptSrcs.slice(0, 20).map(async (u2) => {
        const text = await fetchAsset(u2, 8000, 2);
        return `/* SOURCE: ${u2} */\n${text}`;
      }),
    );

    const externalJS = jsResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n\n");

    const combinedJS = [
      externalJS,
      inlineScripts.length
        ? `/* INLINE SCRIPTS */\n${inlineScripts.join("\n\n")}`
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

    /* ── 9. Extract resources ── */
    const resources = extractResources($, url);

    const framework = detectFramework(rawHTML, scriptSrcs);
    const pageTitle =
      resources.meta.find((m) => m.name === "title")?.content || hostname;

    // Get favicon
    let favicon = null;
    $('link[rel~="icon"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href && !favicon) {
        favicon = resolveURL(url, href);
      }
    });

    /* ── 10. Build assets list ── */
    const assets = [
      ...resources.images.map((url) => ({ type: "image", url })),
      ...resources.stylesheets.map((url) => ({ type: "stylesheet", url })),
      ...resources.scripts.map((url) => ({ type: "script", url })),
    ];

    // Remove duplicates
    const seen = new Set();
    const uniqueAssets = assets.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    const stats = {
      htmlLines: cleanedHTML.split("\n").length,
      cssLines: combinedCSS ? combinedCSS.split("\n").length : 0,
      jsLines: combinedJS ? combinedJS.split("\n").length : 0,
      cssFiles: resources.stylesheets.length,
      jsFiles: resources.scripts.length,
      images: resources.images.length,
      totalAssets: uniqueAssets.length,
      fetchTimeMs: Date.now() - startTime,
    };

    console.log(`[FETCH SUCCESS] ${url} - ${stats.fetchTimeMs}ms`);

    return res.json({
      success: true,
      url,
      pageTitle,
      favicon,
      framework,
      html: cleanedHTML,
      css: combinedCSS || "/* No CSS found */",
      js: combinedJS || "/* No JS found */",
      meta: resources.meta,
      assets: uniqueAssets.slice(0, 200),
      stats,
    });
  } catch (err) {
    console.error("[FETCH ERROR]", err.code || "", err.message);

    let errorMessage = `Scrape failed: ${err.message}`;
    let statusCode = 500;

    if (err.code === "ECONNREFUSED") {
      errorMessage = "Could not connect to that site. It may be offline.";
      statusCode = 502;
    } else if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
      errorMessage = "Request timed out. The site took too long to respond.";
      statusCode = 504;
    } else if (err.code === "ENOTFOUND") {
      errorMessage = "Domain not found. Check the URL and try again.";
      statusCode = 502;
    } else if (err.code === "CERT_HAS_EXPIRED") {
      errorMessage = "SSL certificate error on target site.";
      statusCode = 502;
    } else if (err.response?.status === 403) {
      errorMessage =
        "The target site denied access (403). It may block scrapers.";
      statusCode = 403;
    } else if (err.response?.status === 404) {
      errorMessage = "Page not found on that site (404).";
      statusCode = 404;
    } else if (err.response?.status === 429) {
      errorMessage =
        "The target site is rate-limiting us. Try again in a moment.";
      statusCode = 429;
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
    });
  }
});

/* ── 404 ── */
app.use((_, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found.",
  });
});

/* ── Global error handler ── */
app.use((err, req, res, _next) => {
  console.error("[UNHANDLED]", err.message);
  res.status(500).json({
    success: false,
    error: "Internal server error.",
  });
});

/* ── START ── */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n⚡  FETCH BACKEND  →  http://0.0.0.0:${PORT}`);
  console.log(`    Health         →  http://0.0.0.0:${PORT}/health`);
  console.log(`    Token          →  http://0.0.0.0:${PORT}/api/token`);
  console.log(`    Fetch          →  http://0.0.0.0:${PORT}/api/fetch`);
  console.log(`    Mode           →  ${process.env.NODE_ENV || "development"}`);
  console.log(`    Protected      →  ${BLOCKED_DOMAINS.join(", ")}\n`);
});
