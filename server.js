/* ══════════════════════════════════════════════════════════════════
   FETCH — server.js v2.0.1 (FIXED)
   by ayocodes
═══════════════════════════════════════════════════════════════════ */

"use strict";

require("dotenv").config();

// check if we have what we need
const REQUIRED_ENV = ["MONGODB_URI", "JWT_SECRET"];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`[FATAL] missing: ${missingEnv.join(", ")}`);
  process.exit(1);
}

if (!process.env.GOOGLE_CLIENT_ID) console.warn("[WARN] google auth disabled");
if (!process.env.GROQ_API_KEY) console.warn("[WARN] deobfuscator disabled");

/* ──────────────────────────────────────────────
   imports — all the things
────────────────────────────────────────────── */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const axios = require("axios");
const cheerio = require("cheerio");
const rateLimit = require("express-rate-limit");
const iconv = require("iconv-lite");
const crypto = require("crypto");
const UserAgent = require("user-agents");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");

// optional deps — might be there, might not
let OAuth2Client, googleClient;
try {
  ({ OAuth2Client } = require("google-auth-library"));
  if (process.env.GOOGLE_CLIENT_ID)
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
} catch {
  console.warn("[WARN] google-auth-library not installed");
}

let Groq, groq;
try {
  ({ Groq } = require("groq-sdk"));
  if (process.env.GROQ_API_KEY)
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch {
  console.warn("[WARN] groq-sdk not installed");
}

/* ──────────────────────────────────────────────
   mongoose schemas — basic stuff
────────────────────────────────────────────── */
const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, select: false },
    name: { type: String, trim: true, maxlength: 80 },
    googleId: { type: String, sparse: true },
    avatar: { type: String },
    provider: {
      type: String,
      enum: ["local", "google", "both"],
      default: "local",
    },
    lastLogin: { type: Date },
  },
  { timestamps: true },
);

const FetchLogSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, index: true },
    url: { type: String, required: true },
    success: { type: Boolean, default: false },
    tierUsed: { type: Number },
    durationMs: { type: Number },
  },
  { timestamps: true },
);

const DeobfLogSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, index: true },
    inputLength: { type: Number },
    outputLength: { type: Number },
    success: { type: Boolean, default: false },
    model: { type: String },
    error: { type: String },
  },
  { timestamps: true },
);

const User = mongoose.model("User", UserSchema);
const FetchLog = mongoose.model("FetchLog", FetchLogSchema);
const DeobfLog = mongoose.model("DeobfLog", DeobfLogSchema);

/* ──────────────────────────────────────────────
   mongodb connection — praying it works
────────────────────────────────────────────── */
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  })
  .then(() => console.log("✓ mongodb connected"))
  .catch((err) => {
    console.error("✗ mongodb failed:", err.message);
    process.exit(1);
  });

mongoose.connection.on("error", (e) => console.error("[MongoDB]", e.message));
mongoose.connection.on("disconnected", () =>
  console.warn("[MongoDB] disconnected — reconnecting…"),
);

/* ──────────────────────────────────────────────
   constants — nothing fancy
────────────────────────────────────────────── */
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "30d";
const API_SECRET =
  process.env.API_SECRET || crypto.randomBytes(32).toString("hex");

// admin creds — hash > plain, but both work
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "ayocodes").toLowerCase();
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;
const ADMIN_PLAIN_PASSWORD = process.env.ADMIN_PLAIN_PASSWORD || null;

if (!ADMIN_PASSWORD_HASH && !ADMIN_PLAIN_PASSWORD) {
  console.warn("[WARN] no admin password set");
}

const MAX_CODE_CHARS = 50_000;
const MAX_AI_TOKENS = 8_000;

/* ──────────────────────────────────────────────
   scraper tiers — if they're installed
────────────────────────────────────────────── */
let cloudflareScraper = null;
try {
  cloudflareScraper = require("cloudflare-scraper");
  console.log("✓ tier 2 ready");
} catch {
  console.warn("⚠ tier 2 disabled");
}

let puppeteerExtra = null;
try {
  puppeteerExtra = require("puppeteer-extra");
  puppeteerExtra.use(require("puppeteer-extra-plugin-stealth")());
  console.log("✓ tier 3 ready");
} catch {
  console.warn("⚠ tier 3 disabled");
}

/* ──────────────────────────────────────────────
   express setup — let's go
────────────────────────────────────────────── */
const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "https://fetch-liart-gamma.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (/\.onrender\.com$/.test(origin) || /\.vercel\.app$/.test(origin))
        return cb(null, true);
      return cb(new Error(`CORS: ${origin} not allowed`));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.set("trust proxy", 1);

/* ══════════════════════════════════════════════
   STATIC FILES — Serve frontend
══════════════════════════════════════════════ */

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, "frontend")));

// HTML Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.get("/auth.html", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "auth.html"));
});

app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "admin.html"));
});

/* ──────────────────────────────────────────────
   rate limiters — don't spam me
────────────────────────────────────────────── */
const mkLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: message },
  });

const globalLimiter = mkLimiter(60_000, 120, "slow down");
const authLimiter = mkLimiter(
  15 * 60_000,
  20,
  "too many attempts, wait 15 min",
);
const fetchLimiter = mkLimiter(60_000, 30, "30 fetches per minute max");
const deobfLimiter = mkLimiter(60_000, 20, "20 deobfuscations per minute max");
const adminLimiter = mkLimiter(15 * 60_000, 15, "too many admin attempts");

app.use("/api/", globalLimiter);

/* ──────────────────────────────────────────────
   helpers — utility functions
────────────────────────────────────────────── */
function generateToken(userId, email) {
  return jwt.sign({ userId: String(userId), email, role: "user" }, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    algorithm: "HS256",
  });
}

function generateAdminToken(username) {
  return jwt.sign({ role: "admin", username, userId: "admin" }, JWT_SECRET, {
    expiresIn: "8h",
    algorithm: "HS256",
  });
}

function safeUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name || "",
    avatar: user.avatar || null,
    provider: user.provider || "local",
  };
}

function validateEmail(email) {
  return (
    typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function validatePassword(pw) {
  return typeof pw === "string" && pw.length >= 6 && pw.length <= 128;
}

/* ──────────────────────────────────────────────
   auth middleware — protect the good stuff
────────────────────────────────────────────── */
function authenticateToken(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "no token provided" });
  }
  jwt.verify(
    auth.slice(7),
    JWT_SECRET,
    { algorithms: ["HS256"] },
    (err, decoded) => {
      if (err) {
        const msg =
          err.name === "TokenExpiredError" ? "token expired" : "invalid token";
        return res.status(401).json({ success: false, error: msg });
      }
      req.user = decoded;
      next();
    },
  );
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "admin only" });
  }
  next();
}

/* ══════════════════════════════════════════════
   PUBLIC ROUTES — no auth needed
══════════════════════════════════════════════ */

app.get("/api/config", (_req, res) => {
  res.json({
    success: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    version: "2.0.1",
    env: process.env.NODE_ENV || "development",
  });
});

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    version: "2.0.1",
    time: new Date().toISOString(),
    uptime: process.uptime(),
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    tiers: {
      tier1_axios: true,
      tier2_cloudflare_scraper: !!cloudflareScraper,
      tier3_puppeteer_stealth: !!puppeteerExtra,
    },
  }),
);

app.get("/api/token", (_req, res) => {
  const ts = Date.now().toString();
  const token = crypto
    .createHmac("sha256", API_SECRET)
    .update(`fetch:${ts}`)
    .digest("hex");
  res.json({ success: true, token, timestamp: ts });
});

app.get("/api/endpoints", (_req, res) => {
  res.json({
    success: true,
    endpoints: [
      "GET /",
      "GET /health",
      "GET /api/config",
      "GET /api/token",
      "GET /api/endpoints",
      "POST /api/auth/register",
      "POST /api/auth/login",
      "POST /api/auth/google",
      "GET /api/auth/verify",
      "POST /api/auth/logout",
      "GET /api/auth/profile",
      "PATCH /api/auth/profile",
      "POST /api/fetch",
      "POST /api/deobfuscate",
      "POST /api/admin/authenticate",
      "GET /api/admin/stats",
      "GET /api/admin/users",
      "GET /api/admin/fetches",
      "GET /api/admin/deobfuscations",
    ],
    version: "2.0.1",
  });
});

/* ══════════════════════════════════════════════
   AUTH ROUTES — register, login, google, profile
══════════════════════════════════════════════ */

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    const name = (req.body.name || "").trim().slice(0, 80);

    if (!validateEmail(email))
      return res.status(400).json({ success: false, error: "invalid email" });
    if (!validatePassword(password))
      return res
        .status(400)
        .json({ success: false, error: "password must be 6-128 chars" });

    const existing = await User.findOne({ email });
    if (existing) {
      if (existing.provider === "google" && !existing.password) {
        existing.password = await bcrypt.hash(password, 12);
        existing.provider = "both";
        if (name && !existing.name) existing.name = name;
        existing.lastLogin = new Date();
        await existing.save();
        return res.json({
          success: true,
          token: generateToken(existing._id, existing.email),
          user: safeUser(existing),
        });
      }
      return res
        .status(409)
        .json({ success: false, error: "email already exists" });
    }

    const user = await User.create({
      email,
      password: await bcrypt.hash(password, 12),
      name: name || email.split("@")[0],
      provider: "local",
      lastLogin: new Date(),
    });

    res.status(201).json({
      success: true,
      token: generateToken(user._id, user.email),
      user: safeUser(user),
    });
  } catch (err) {
    console.error("[register]", err.message);
    res.status(500).json({ success: false, error: "registration failed" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";

    if (!validateEmail(email) || !password) {
      return res
        .status(400)
        .json({ success: false, error: "email and password required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      await bcrypt.compare(
        password,
        "$2b$12$invalidhashpaddinginvalidhashpadding00",
      );
      return res
        .status(401)
        .json({ success: false, error: "invalid credentials" });
    }

    if ((user.provider === "google" && !user.password) || !user.password) {
      return res.status(401).json({
        success: false,
        error: "this account uses google sign-in",
      });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res
        .status(401)
        .json({ success: false, error: "invalid credentials" });
    }

    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      token: generateToken(user._id, user.email),
      user: safeUser(user),
    });
  } catch (err) {
    console.error("[login]", err.message);
    res.status(500).json({ success: false, error: "login failed" });
  }
});

app.post("/api/auth/google", authLimiter, async (req, res) => {
  if (!googleClient) {
    return res
      .status(503)
      .json({ success: false, error: "google auth not configured" });
  }

  try {
    const { credential, access_token, profile } = req.body;

    let googleId, email, name, avatar;

    // Handle both Google One Tap and access token flow
    if (access_token && profile) {
      // Access token flow
      googleId = profile.sub;
      email = (profile.email || "").toLowerCase().trim();
      name = profile.name || "";
      avatar = profile.picture || null;
    } else if (credential) {
      // ID token flow (One Tap)
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = (payload.email || "").toLowerCase().trim();
      name = payload.name || "";
      avatar = payload.picture || null;
    } else {
      return res.status(400).json({
        success: false,
        error: "no valid credential provided",
      });
    }

    if (!email) {
      return res
        .status(400)
        .json({ success: false, error: "no email from google" });
    }
    if (!googleId) {
      return res.status(400).json({ success: false, error: "no google id" });
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      let changed = false;
      if (!user.googleId) {
        user.googleId = googleId;
        user.provider = user.password ? "both" : "google";
        changed = true;
      }
      if (!user.avatar && avatar) {
        user.avatar = avatar;
        changed = true;
      }
      if (!user.name && name) {
        user.name = name;
        changed = true;
      }
      user.lastLogin = new Date();
      if (changed) await user.save();
      else await User.updateOne({ _id: user._id }, { lastLogin: new Date() });
    } else {
      user = await User.create({
        email,
        name: name || email.split("@")[0],
        googleId,
        avatar,
        provider: "google",
        lastLogin: new Date(),
      });
      console.log(`[google-auth] new account: ${email}`);
    }

    res.json({
      success: true,
      token: generateToken(user._id, user.email),
      user: safeUser(user),
    });
  } catch (err) {
    console.error("[google-auth]", err.message);
    res
      .status(500)
      .json({ success: false, error: "google auth failed: " + err.message });
  }
});

app.get("/api/auth/verify", authenticateToken, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      return res.json({
        success: true,
        user: {
          id: "admin",
          email: `${req.user.username}@admin`,
          name: req.user.username,
          role: "admin",
        },
      });
    }
    const user = await User.findById(req.user.userId);
    if (!user)
      return res.status(404).json({ success: false, error: "user not found" });
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    console.error("[verify]", err.message);
    res.status(500).json({ success: false, error: "verification failed" });
  }
});

app.post("/api/auth/logout", authenticateToken, (_req, res) => {
  res.json({ success: true, message: "logged out" });
});

app.get("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      return res.json({
        success: true,
        user: {
          id: "admin",
          email: `${req.user.username}@admin`,
          name: req.user.username,
          role: "admin",
          provider: "local",
          avatar: null,
          stats: { fetches: 0, deobfuscations: 0 },
        },
      });
    }

    const user = await User.findById(req.user.userId).lean();
    if (!user)
      return res.status(404).json({ success: false, error: "user not found" });

    const [fetchCount, deobfCount] = await Promise.all([
      FetchLog.countDocuments({ userEmail: user.email }),
      DeobfLog.countDocuments({ userEmail: user.email }),
    ]);

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || "",
        avatar: user.avatar || null,
        provider: user.provider || "local",
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        stats: { fetches: fetchCount, deobfuscations: deobfCount },
      },
    });
  } catch (err) {
    console.error("[profile]", err.message);
    res.status(500).json({ success: false, error: "could not load profile" });
  }
});

app.patch("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      return res
        .status(403)
        .json({ success: false, error: "admin profile is read-only" });
    }
    const name = (req.body.name || "").trim().slice(0, 80);
    if (!name)
      return res
        .status(400)
        .json({ success: false, error: "name cannot be empty" });

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { name },
      { new: true },
    ).lean();
    if (!user)
      return res.status(404).json({ success: false, error: "user not found" });
    res.json({ success: true, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error("[profile-update]", err.message);
    res.status(500).json({ success: false, error: "update failed" });
  }
});

/* ══════════════════════════════════════════════
   ADMIN AUTH — hash or plain, both work
══════════════════════════════════════════════ */
app.post("/api/admin/authenticate", adminLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: "username and password required" });
    }

    const normalized = username.includes("@")
      ? username.split("@")[0].toLowerCase()
      : username.toLowerCase();

    if (normalized !== ADMIN_USERNAME) {
      await bcrypt.compare(
        password,
        "$2b$10$invalidsafetyhashpadding0000000000000",
      );
      return res
        .status(401)
        .json({ success: false, error: "invalid credentials" });
    }

    let isValid = false;
    if (ADMIN_PASSWORD_HASH) {
      isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    } else if (ADMIN_PLAIN_PASSWORD) {
      isValid = password === ADMIN_PLAIN_PASSWORD;
      if (isValid)
        console.warn(
          "[ADMIN] using plain-text password — set ADMIN_PASSWORD_HASH for prod",
        );
    } else {
      console.error("[ADMIN] no admin password configured");
      return res
        .status(503)
        .json({ success: false, error: "admin auth not configured" });
    }

    if (!isValid)
      return res
        .status(401)
        .json({ success: false, error: "invalid credentials" });

    console.log(`[ADMIN] ✓ ${normalized}`);
    res.json({ success: true, token: generateAdminToken(normalized) });
  } catch (err) {
    console.error("[admin-auth]", err.message);
    res.status(500).json({ success: false, error: "authentication failed" });
  }
});

/* ══════════════════════════════════════════════
   ADMIN DATA ROUTES — stats, users, fetches, deobf
══════════════════════════════════════════════ */
app.get(
  "/api/admin/stats",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const ago30 = new Date(Date.now() - 30 * 86_400_000);

      const [
        totalUsers,
        googleUsers,
        active30,
        newToday,
        recentUsers,
        providerLocal,
        providerGoogle,
        providerBoth,
        totalFetches,
        successFetches,
        totalDeobf,
        successDeobf,
        avgDurResult,
        uniqueDeobfEmails,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ provider: { $in: ["google", "both"] } }),
        User.countDocuments({ lastLogin: { $gte: ago30 } }),
        User.countDocuments({ createdAt: { $gte: todayStart } }),
        User.find().sort({ createdAt: -1 }).limit(10).lean(),
        User.countDocuments({ provider: "local" }),
        User.countDocuments({ provider: "google" }),
        User.countDocuments({ provider: "both" }),
        FetchLog.countDocuments(),
        FetchLog.countDocuments({ success: true }),
        DeobfLog.countDocuments(),
        DeobfLog.countDocuments({ success: true }),
        FetchLog.aggregate([
          { $group: { _id: null, avg: { $avg: "$durationMs" } } },
        ]),
        DeobfLog.distinct("userEmail"),
      ]);

      const fetchesByDay = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const nd = new Date(d);
        nd.setDate(nd.getDate() + 1);
        const count = await FetchLog.countDocuments({
          createdAt: { $gte: d, $lt: nd },
        });
        fetchesByDay.push({
          label: d.toLocaleDateString("en-US", { weekday: "short" }),
          count,
        });
      }

      res.json({
        success: true,
        totalUsers,
        googleUsers,
        active30,
        newToday,
        recentUsers,
        providerCounts: {
          local: providerLocal,
          google: providerGoogle,
          both: providerBoth,
        },
        totalFetches,
        failedFetches: totalFetches - successFetches,
        totalDeobf,
        failedDeobf: totalDeobf - successDeobf,
        uniqueDeobfUsers: uniqueDeobfEmails.length,
        avgFetchMs: Math.round(avgDurResult[0]?.avg || 0),
        fetchesByDay,
      });
    } catch (err) {
      console.error("[admin-stats]", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

app.get(
  "/api/admin/users",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      res.json({ success: true, users });
    } catch (err) {
      console.error("[admin-users]", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

app.get(
  "/api/admin/fetches",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [fetches, total, success, avgResult] = await Promise.all([
        FetchLog.find().sort({ createdAt: -1 }).limit(200).lean(),
        FetchLog.countDocuments(),
        FetchLog.countDocuments({ success: true }),
        FetchLog.aggregate([
          { $group: { _id: null, avg: { $avg: "$durationMs" } } },
        ]),
      ]);
      res.json({
        success: true,
        fetches,
        stats: {
          total,
          success,
          failed: total - success,
          avgDuration: Math.round(avgResult[0]?.avg || 0),
        },
      });
    } catch (err) {
      console.error("[admin-fetches]", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

app.get(
  "/api/admin/deobfuscations",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [deobfuscations, total, success, uniqueArr] = await Promise.all([
        DeobfLog.find().sort({ createdAt: -1 }).limit(200).lean(),
        DeobfLog.countDocuments(),
        DeobfLog.countDocuments({ success: true }),
        DeobfLog.distinct("userEmail"),
      ]);
      res.json({
        success: true,
        deobfuscations,
        stats: {
          total,
          success,
          failed: total - success,
          uniqueUsers: uniqueArr.length,
        },
      });
    } catch (err) {
      console.error("[admin-deobf]", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

/* ══════════════════════════════════════════════
   DEOBFUSCATOR — groq ai does the work
══════════════════════════════════════════════ */
app.post(
  "/api/deobfuscate",
  authenticateToken,
  deobfLimiter,
  async (req, res) => {
    if (!groq) {
      return res
        .status(503)
        .json({ success: false, error: "deobfuscator not configured" });
    }

    const userEmail = req.user.email;
    const jsCode = req.body.jsCode || "";
    const inputLength = jsCode.length;
    const model = "llama-3.3-70b-versatile";

    const logFail = async (error) => {
      await DeobfLog.create({
        userEmail,
        inputLength,
        success: false,
        model,
        error,
      }).catch(() => {});
    };

    if (!jsCode || typeof jsCode !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "no code provided" });
    }
    if (jsCode.trim().length < 20) {
      await logFail("code too short");
      return res
        .status(400)
        .json({ success: false, error: "code too short (min 20 chars)" });
    }
    if (jsCode.length > MAX_CODE_CHARS) {
      await logFail(`code too large: ${jsCode.length}`);
      return res.status(413).json({
        success: false,
        error: `code too large (max ${MAX_CODE_CHARS.toLocaleString()} chars)`,
      });
    }

    try {
      console.log(`[DEOBF] ${inputLength} chars — ${userEmail}`);

      const prompt = `deobfuscate this javascript. rename variables, unpack strings, add comments. keep the logic exactly the same. return only the deobfuscated code with "@fetch by ayocodes" at top and bottom. no markdown.

code:
${jsCode}`;

      const completion = await groq.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: MAX_AI_TOKENS,
        messages: [{ role: "user", content: prompt }],
      });

      let deobfuscated = (completion.choices[0]?.message?.content || "").trim();
      deobfuscated = deobfuscated
        .replace(/^```(?:javascript|js)?\s*/im, "")
        .replace(/\s*```$/m, "")
        .trim();

      await DeobfLog.create({
        userEmail,
        inputLength,
        outputLength: deobfuscated.length,
        success: true,
        model,
      }).catch(() => {});
      console.log(
        `[DEOBF OK] ${userEmail} — output ${deobfuscated.length} chars`,
      );

      res.json({ success: true, deobfuscated });
    } catch (err) {
      console.error("[DEOBF ERROR]", err.message);
      await logFail(err.message);

      if (err.status === 429 || err.message?.includes("rate_limit")) {
        return res
          .status(429)
          .json({ success: false, error: "rate limit reached, wait a bit" });
      }
      if (err.status === 413 || err.message?.includes("token")) {
        return res
          .status(413)
          .json({ success: false, error: "code too large for ai" });
      }
      res.status(500).json({ success: false, error: "deobfuscation failed" });
    }
  },
);

/* ══════════════════════════════════════════════
   SCRAPING HELPERS — the messy part
══════════════════════════════════════════════ */
const PRIVATE_IP_RE =
  /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:)/i;

const BLOCKED_DOMAINS = [
  "fetch-liart-gamma.vercel.app",
  "fetch-v1.onrender.com",
  process.env.BLOCKED_DOMAIN,
]
  .filter(Boolean)
  .map((d) =>
    d
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, ""),
  );

function getRandomUA() {
  try {
    return new UserAgent({ deviceCategory: "desktop" }).toString();
  } catch {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
  }
}

function browserHeaders(ua) {
  return {
    "User-Agent": ua || getRandomUA(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Upgrade-Insecure-Requests": "1",
  };
}

function resolveURL(base, relative) {
  if (!relative || typeof relative !== "string") return null;
  relative = relative.trim();
  if (!relative || /^(data:|javascript:|blob:)/i.test(relative)) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

function decodeBuffer(buf, contentType = "") {
  let charset = "utf-8";
  const ctMatch = contentType.match(/charset=([^\s;]+)/i);
  if (ctMatch) charset = ctMatch[1].replace(/['"]/g, "");
  const sniff = buf.toString("latin1").slice(0, 5000);
  const metaM = sniff.match(/<meta[^>]+charset=["']?([^"'\s;>]+)/i);
  if (metaM?.[1] && !charset.toLowerCase().startsWith("utf"))
    charset = metaM[1];
  try {
    return iconv.decode(buf, charset);
  } catch {
    return buf.toString("utf-8");
  }
}

function detectFramework(html, scriptSrcs) {
  const s = (html + " " + scriptSrcs.join(" ")).toLowerCase();
  if (s.includes("__next_data__") || s.includes("/_next/")) return "Next.js";
  if (s.includes("__nuxt__") || s.includes("/_nuxt/")) return "Nuxt.js";
  if (s.includes("__remixcontext") || s.includes("@remix-run")) return "Remix";
  if (s.includes("gatsby-") || s.includes("___gatsby")) return "Gatsby";
  if (s.includes("__vue__") || s.includes("createapp")) return "Vue.js";
  if (s.includes("ng-version") || s.includes("angular")) return "Angular";
  if (s.includes("react") || s.includes("reactdom")) return "React";
  if (s.includes("wp-content") || s.includes("wp-includes")) return "WordPress";
  return "Vanilla";
}

async function fetchTier1(url, timeout = 20_000) {
  const res = await axios.get(url, {
    timeout,
    responseType: "arraybuffer",
    maxRedirects: 8,
    maxContentLength: 15 * 1024 * 1024,
    headers: browserHeaders(),
    validateStatus: (s) => s < 500,
    decompress: true,
  });
  if (res.status >= 400) {
    const err = new Error(`HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return {
    html: decodeBuffer(
      Buffer.from(res.data),
      res.headers["content-type"] || "",
    ),
    status: res.status,
    tier: 1,
  };
}

async function fetchTier2(url, timeout = 25_000) {
  if (!cloudflareScraper) throw new Error("cloudflare-scraper unavailable");
  const fn =
    typeof cloudflareScraper === "function"
      ? cloudflareScraper
      : (u, o, cb) => cloudflareScraper.get(u, o, cb);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Tier 2 timeout")),
      timeout,
    );
    fn(url, { headers: browserHeaders() }, (err, response, body) => {
      clearTimeout(timer);
      if (err || !body) return reject(err || new Error("Empty T2 body"));
      const html =
        typeof body === "string"
          ? body
          : decodeBuffer(Buffer.isBuffer(body) ? body : Buffer.from(body));
      resolve({ html, status: response?.statusCode || 200, tier: 2 });
    });
  });
}

async function fetchTier3(url, timeout = 40_000) {
  if (!puppeteerExtra) throw new Error("puppeteer-extra unavailable");
  let browser;
  try {
    browser = await puppeteerExtra.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      defaultViewport: { width: 1920, height: 1080 },
    });
    const page = await browser.newPage();
    await page.setUserAgent(getRandomUA());
    await page.setExtraHTTPHeaders(browserHeaders());
    await page.setRequestInterception(true);
    page.on("request", (r) =>
      ["font", "media", "image"].includes(r.resourceType())
        ? r.abort()
        : r.continue(),
    );
    const resp = await page.goto(url, { waitUntil: "networkidle2", timeout });
    const status = resp?.status() ?? 200;
    await new Promise((r) => setTimeout(r, 1500));
    const html = await page.content();
    if (!html) throw new Error("Puppeteer: empty page");
    return { html, status, tier: 3 };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function advancedFetch(url) {
  const errors = [];

  for (let i = 1; i <= 3; i++) {
    try {
      return await fetchTier1(url, 20_000);
    } catch (err) {
      errors.push(`T1[${i}]: ${err.message}`);
      if ([403, 404, 451].includes(err.httpStatus)) break;
      if (i < 3) await new Promise((r) => setTimeout(r, i * 1500));
    }
  }

  try {
    return await fetchTier2(url, 25_000);
  } catch (err) {
    errors.push(`T2: ${err.message}`);
  }

  try {
    return await fetchTier3(url, 40_000);
  } catch (err) {
    errors.push(`T3: ${err.message}`);
  }

  throw new Error("all tiers failed: " + errors.join(" | "));
}

async function fetchAsset(assetUrl, timeout = 10_000, retries = 2) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await axios.get(assetUrl, {
        timeout,
        responseType: "arraybuffer",
        maxContentLength: 5 * 1024 * 1024,
        headers: browserHeaders(),
        validateStatus: (s) => s < 500,
      });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      return decodeBuffer(
        Buffer.from(res.data),
        res.headers["content-type"] || "",
      );
    } catch (err) {
      if (i === retries) return `/* [ASSET ERROR: ${err.message}] */`;
      await new Promise((r) => setTimeout(r, i * 800));
    }
  }
  return "/* [ASSET FETCH FAILED] */";
}

function extractResources($, baseUrl) {
  const scripts = [],
    stylesheets = [],
    images = [],
    meta = [];

  $("script[src]").each((_, el) => {
    const u = resolveURL(baseUrl, $(el).attr("src"));
    if (u) scripts.push(u);
  });
  $('link[rel="stylesheet"], link[type="text/css"]').each((_, el) => {
    const u = resolveURL(baseUrl, $(el).attr("href"));
    if (u) stylesheets.push(u);
  });
  $("img").each((_, el) => {
    const src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src");
    const u = resolveURL(baseUrl, src);
    if (u) images.push(u);
  });
  $("title").each((_, el) =>
    meta.push({ name: "title", content: $(el).text().trim() }),
  );
  $("meta").each((_, el) => {
    const name =
      $(el).attr("name") || $(el).attr("property") || $(el).attr("http-equiv");
    const content = $(el).attr("content") || $(el).attr("charset");
    if (name && content) meta.push({ name, content });
  });

  return { scripts, stylesheets, images, meta };
}

/* ══════════════════════════════════════════════
   POST /api/fetch — the main thing
══════════════════════════════════════════════ */
app.post("/api/fetch", authenticateToken, fetchLimiter, async (req, res) => {
  const t0 = Date.now();
  let { url } = req.body;
  const userEmail = req.user.email;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "missing url" });
  }

  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  if (url.length > 2048)
    return res.status(400).json({ success: false, error: "url too long" });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ success: false, error: "invalid url" });
  }

  const hostname = parsed.hostname.toLowerCase();

  if (PRIVATE_IP_RE.test(hostname)) {
    return res.status(403).json({ success: false, error: "no private ips" });
  }
  if (
    BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))
  ) {
    return res.status(403).json({ success: false, error: "domain blocked" });
  }

  console.log(`[FETCH] ${url} — ${userEmail}`);

  try {
    const { html: rawHTML, tier: tierUsed } = await advancedFetch(url);
    const $ = cheerio.load(rawHTML, { decodeEntities: false });

    const cssLinks = [];
    const scriptSrcs = [];
    $('link[rel="stylesheet"], link[type="text/css"]').each((_, el) => {
      const u = resolveURL(url, $(el).attr("href"));
      if (u) cssLinks.push(u);
    });
    $("script[src]").each((_, el) => {
      const u = resolveURL(url, $(el).attr("src"));
      if (u) scriptSrcs.push(u);
    });

    const inlineStyles = [];
    const inlineScripts = [];
    $("style").each((_, el) => {
      const c = $(el).html()?.trim();
      if (c?.length > 5) inlineStyles.push(c);
    });
    $("script:not([src])").each((_, el) => {
      const c = $(el).html()?.trim();
      if (c?.length > 20) inlineScripts.push(c);
    });

    const [cssSettled, jsSettled] = await Promise.all([
      Promise.allSettled(
        cssLinks
          .slice(0, 15)
          .map(async (u) => `/* SOURCE: ${u} */\n${await fetchAsset(u)}`),
      ),
      Promise.allSettled(
        scriptSrcs
          .slice(0, 15)
          .map(async (u) => `/* SOURCE: ${u} */\n${await fetchAsset(u)}`),
      ),
    ]);

    const externalCSS = cssSettled
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .join("\n\n");
    const externalJS = jsSettled
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
    const combinedJS = [
      externalJS,
      inlineScripts.length
        ? `/* INLINE SCRIPTS */\n${inlineScripts.join("\n\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    $("script:not([src])").each((_, el) =>
      $(el).html("/* extracted — see JS tab */"),
    );
    $("style").each((_, el) => $(el).html("/* extracted — see CSS tab */"));
    const cleanedHTML = $.html();

    const resources = extractResources($, url);
    const framework = detectFramework(rawHTML, scriptSrcs);
    const pageTitle =
      resources.meta.find((m) => m.name === "title")?.content || hostname;

    let favicon = null;
    $('link[rel~="icon"]').each((_, el) => {
      if (!favicon) favicon = resolveURL(url, $(el).attr("href"));
    });

    const seen = new Set();
    const assets = [
      ...resources.images.map((u) => ({ type: "image", url: u })),
      ...resources.stylesheets.map((u) => ({ type: "stylesheet", url: u })),
      ...resources.scripts.map((u) => ({ type: "script", url: u })),
    ].filter((a) => (seen.has(a.url) ? false : seen.add(a.url)));

    const fetchTimeMs = Date.now() - t0;
    const stats = {
      htmlLines: cleanedHTML.split("\n").length,
      cssLines: combinedCSS ? combinedCSS.split("\n").length : 0,
      jsLines: combinedJS ? combinedJS.split("\n").length : 0,
      cssFiles: cssLinks.length,
      jsFiles: scriptSrcs.length,
      images: resources.images.length,
      totalAssets: assets.length,
      fetchTimeMs,
      tierUsed,
    };

    await FetchLog.create({
      userEmail,
      url,
      success: true,
      tierUsed,
      durationMs: fetchTimeMs,
    }).catch(() => {});
    console.log(`[FETCH OK] ${url} — ${fetchTimeMs}ms tier${tierUsed}`);

    res.json({
      success: true,
      url,
      pageTitle,
      favicon,
      framework,
      tierUsed,
      html: cleanedHTML,
      css: combinedCSS || "/* No CSS found */",
      js: combinedJS || "/* No JS found */",
      meta: resources.meta,
      assets: assets.slice(0, 200),
      stats,
    });
  } catch (err) {
    console.error("[FETCH ERROR]", err.code || "", err.message);
    await FetchLog.create({
      userEmail,
      url,
      success: false,
      durationMs: Date.now() - t0,
    }).catch(() => {});

    let errorMsg = "scrape failed";
    let httpCode = 500;

    const c = err.code || "";
    if (c === "ECONNREFUSED") {
      errorMsg = "connection refused";
      httpCode = 502;
    } else if (c === "ETIMEDOUT" || c === "ECONNABORTED") {
      errorMsg = "request timed out";
      httpCode = 504;
    } else if (c === "ENOTFOUND") {
      errorMsg = "domain not found";
      httpCode = 502;
    } else if (err.httpStatus === 403) {
      errorMsg = "site blocked (403)";
      httpCode = 403;
    } else if (err.httpStatus === 404) {
      errorMsg = "page not found";
      httpCode = 404;
    } else if (err.message?.includes("all tiers failed")) {
      errorMsg = "all bypass methods failed";
      httpCode = 502;
    }

    res.status(httpCode).json({ success: false, error: errorMsg });
  }
});

/* ══════════════════════════════════════════════
   404 & ERROR HANDLERS
══════════════════════════════════════════════ */
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "endpoint not found",
    path: req.originalUrl,
    hint: "GET /api/endpoints for the list",
  });
});

app.use((err, _req, res, _next) => {
  if (err.message?.startsWith("CORS"))
    return res.status(403).json({ success: false, error: err.message });
  console.error("[UNHANDLED]", err.message);
  res.status(500).json({ success: false, error: "internal server error" });
});

/* ══════════════════════════════════════════════
   START + GRACEFUL SHUTDOWN
══════════════════════════════════════════════ */
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n⚡ FETCH BACKEND v2.0.0 → http://0.0.0.0:${PORT}`);
  console.log(`    mode: ${process.env.NODE_ENV || "development"}`);
  console.log(`    tier 2: ${cloudflareScraper ? "✓" : "✗"}`);
  console.log(`    tier 3: ${puppeteerExtra ? "✓" : "✗"}`);
  console.log(`    google: ${googleClient ? "✓" : "✗"}`);
  console.log(`    groq: ${groq ? "✓" : "✗"}`);
  console.log(
    `    admin: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD_HASH ? "hash" : ADMIN_PLAIN_PASSWORD ? "plain" : "⚠ not set"}`,
  );
  console.log(
    `    mongodb: ${mongoose.connection.readyState === 1 ? "✓" : "connecting…"}\n`,
  );
});

function gracefulShutdown(sig) {
  console.log(`\n[${sig}] shutting down...`);
  server.close(async () => {
    await mongoose.connection.close(false);
    console.log("✓ server and db closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("uncaughtException", (e) => {
  console.error("[uncaughtException]", e);
  gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (e) =>
  console.error("[unhandledRejection]", e),
);
