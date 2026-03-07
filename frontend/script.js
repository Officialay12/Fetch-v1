/* ═══════════════════════════════════════════════
   FETCH — script.js  v2.0
   by ayocodes
   Production-ready frontend logic
═══════════════════════════════════════════════ */
"use strict";

/* ──────────────────────────────────────────────
   CONFIG
────────────────────────────────────────────── */
const CONFIG_KEY = "fetch-backend-url";
const HIST_KEY = "fetch-history";
const DEFAULT_BACKEND = "http://localhost:3001";

function getBackendURL() {
  return (localStorage.getItem(CONFIG_KEY) || DEFAULT_BACKEND).replace(
    /\/$/,
    "",
  );
}

/* ──────────────────────────────────────────────
   UTILS
────────────────────────────────────────────── */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidURL(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeURL(str) {
  str = str.trim();
  if (!/^https?:\/\//i.test(str)) str = "https://" + str;
  return str;
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/* ──────────────────────────────────────────────
   PRELOADER
────────────────────────────────────────────── */
(function initPreloader() {
  const preloader = document.getElementById("preloader");
  const bar = document.querySelector(".pre-bar");
  const pct = document.querySelector(".pre-percent");

  document.body.style.overflow = "hidden";
  let progress = 0;

  const iv = setInterval(() => {
    progress += Math.random() * 18 + 4;
    if (progress >= 100) {
      progress = 100;
      clearInterval(iv);
      setTimeout(() => {
        preloader.classList.add("done");
        document.body.style.overflow = "";
        document
          .querySelectorAll(".reveal-word")
          .forEach((el) => el.classList.add("visible"));
        setTimeout(startCounters, 400);
        initScrollReveal();
      }, 300);
    }
    bar.style.width = progress + "%";
    pct.textContent = Math.floor(progress) + "%";
  }, 80);
})();

/* ──────────────────────────────────────────────
   CUSTOM CURSOR
────────────────────────────────────────────── */
(function initCursor() {
  if (window.matchMedia("(max-width:480px)").matches) return;
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  if (!dot || !ring) return;

  let mx = 0,
    my = 0,
    rx = 0,
    ry = 0;
  let rafId = null;

  document.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + "px";
    dot.style.top = my + "px";
    if (!rafId) {
      rafId = requestAnimationFrame(function loop() {
        rx += (mx - rx) * 0.14;
        ry += (my - ry) * 0.14;
        ring.style.left = rx + "px";
        ring.style.top = ry + "px";
        rafId = requestAnimationFrame(loop);
      });
    }
  });

  document.addEventListener("mousedown", () =>
    document.body.classList.add("cursor-click"),
  );
  document.addEventListener("mouseup", () =>
    document.body.classList.remove("cursor-click"),
  );

  const hoverSel =
    'a, button, input, [role="tab"], .step-card, .feature-card, .recent-item, .social-link, .toggle-wrap';
  document.querySelectorAll(hoverSel).forEach((el) => {
    el.addEventListener("mouseenter", () =>
      document.body.classList.add("cursor-hover"),
    );
    el.addEventListener("mouseleave", () =>
      document.body.classList.remove("cursor-hover"),
    );
  });
})();

/* ──────────────────────────────────────────────
   NAVBAR
────────────────────────────────────────────── */
(function initNavbar() {
  const navbar = document.getElementById("navbar");
  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobileMenu");

  mobileMenu.setAttribute("aria-hidden", "true");
  mobileMenu.style.display = "none";

  window.addEventListener(
    "scroll",
    () => {
      navbar.classList.toggle("scrolled", window.scrollY > 30);
    },
    { passive: true },
  );

  hamburger.addEventListener("click", () => {
    const isOpen = mobileMenu.classList.toggle("open");
    hamburger.classList.toggle("active", isOpen);
    hamburger.setAttribute("aria-expanded", String(isOpen));
    mobileMenu.setAttribute("aria-hidden", String(!isOpen));
    mobileMenu.style.display = isOpen ? "block" : "none";
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  document.querySelectorAll(".mob-link").forEach((l) => {
    l.addEventListener("click", () => {
      mobileMenu.classList.remove("open");
      hamburger.classList.remove("active");
      hamburger.setAttribute("aria-expanded", "false");
      mobileMenu.setAttribute("aria-hidden", "true");
      mobileMenu.style.display = "none";
      document.body.style.overflow = "";
    });
  });
})();

/* ──────────────────────────────────────────────
   THEME
────────────────────────────────────────────── */
(function initTheme() {
  const btn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");
  const html = document.documentElement;
  const saved = localStorage.getItem("fetch-theme") || "dark";

  html.setAttribute("data-theme", saved);
  icon.className = saved === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";

  btn.addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
    localStorage.setItem("fetch-theme", next);
    showToast(next === "dark" ? "🌙 Dark mode on" : "☀️ Light mode on", "info");
  });
})();

/* ──────────────────────────────────────────────
   API BANNER
────────────────────────────────────────────── */
(function initApiBanner() {
  const banner = document.getElementById("apiBanner");
  const input = document.getElementById("backendUrlInput");
  const saveBtn = document.getElementById("saveBackendBtn");
  const dismissBtn = document.getElementById("dismissBanner");
  const configBtn = document.getElementById("configBtn");

  input.value = localStorage.getItem(CONFIG_KEY) || "";
  if (localStorage.getItem(CONFIG_KEY)) banner.classList.add("hidden");

  saveBtn.addEventListener("click", () => {
    const val = input.value.trim();
    if (!val) {
      showToast("Enter a valid backend URL", "error");
      return;
    }
    try {
      new URL(val);
    } catch {
      showToast("Invalid URL format", "error");
      return;
    }
    localStorage.setItem(CONFIG_KEY, val.replace(/\/$/, ""));
    banner.classList.add("hidden");
    showToast("✅ Backend URL saved!", "success");
  });

  dismissBtn.addEventListener("click", () => banner.classList.add("hidden"));

  configBtn.addEventListener("click", () => {
    banner.classList.toggle("hidden");
    if (!banner.classList.contains("hidden")) input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
  });
})();

/* ──────────────────────────────────────────────
   PARTICLES
────────────────────────────────────────────── */
(function initParticles() {
  const canvas = document.getElementById("particleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W,
    H,
    particles = [];
  const mouse = { x: null, y: null };

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  const COLORS = ["rgba(0,229,255,", "rgba(170,255,0,", "rgba(255,183,0,"];

  class P {
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.r = Math.random() * 1.5 + 0.5;
      this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.alpha = Math.random() * 0.5 + 0.1;
      this.life = 0;
      this.maxLife = Math.random() * 200 + 100;
    }
    constructor() {
      this.reset();
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life++;
      if (mouse.x !== null) {
        const dx = mouse.x - this.x,
          dy = mouse.y - this.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 100) {
          this.vx -= (dx / d) * 0.03;
          this.vy -= (dy / d) * 0.03;
        }
      }
      if (
        this.life > this.maxLife ||
        this.x < 0 ||
        this.x > W ||
        this.y < 0 ||
        this.y > H
      )
        this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color + this.alpha + ")";
      ctx.fill();
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new P());

  function connect() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0,229,255,${(1 - d / 120) * 0.08})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });

  (function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.update();
      p.draw();
    });
    connect();
    requestAnimationFrame(loop);
  })();
})();

/* ──────────────────────────────────────────────
   SCROLL REVEAL
────────────────────────────────────────────── */
function initScrollReveal() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -50px 0px" },
  );

  document
    .querySelectorAll(".reveal-up, .reveal-left, .reveal-right")
    .forEach((t) => io.observe(t));
}
initScrollReveal();

/* ──────────────────────────────────────────────
   PARALLAX
────────────────────────────────────────────── */
(function () {
  const g1 = document.querySelector(".glow-1");
  const g2 = document.querySelector(".glow-2");
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      if (g1) g1.style.transform = `translateY(${y * 0.15}px)`;
      if (g2) g2.style.transform = `translateY(${-y * 0.1}px)`;
    },
    { passive: true },
  );
})();

/* ──────────────────────────────────────────────
   COUNTERS
────────────────────────────────────────────── */
function startCounters() {
  document.querySelectorAll(".stat-num[data-count]").forEach((el) => {
    const target = parseInt(el.getAttribute("data-count"), 10);
    let cur = 0;
    const step = target / 60;
    const iv = setInterval(() => {
      cur += step;
      if (cur >= target) {
        cur = target;
        clearInterval(iv);
      }
      el.textContent = Math.floor(cur).toLocaleString();
    }, 25);
  });
}

/* ──────────────────────────────────────────────
   TOAST
────────────────────────────────────────────── */
function showToast(msg, type = "info", duration = 3200) {
  const t = document.getElementById("toast");
  const icons = {
    success: "fa-check-circle",
    error: "fa-circle-xmark",
    info: "fa-circle-info",
  };
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i><span>${msg}</span>`;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), duration);
}

/* ──────────────────────────────────────────────
   SHAKE ANIMATION
────────────────────────────────────────────── */
const shakeStyle = document.createElement("style");
shakeStyle.textContent =
  "@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}";
document.head.appendChild(shakeStyle);

function shakeInput(groupId) {
  const el = document.getElementById(groupId);
  if (!el) return;
  el.style.animation = "shake 0.4s ease";
  el.addEventListener("animationend", () => (el.style.animation = ""), {
    once: true,
  });
}

/* ──────────────────────────────────────────────
   UI STATE HELPERS
────────────────────────────────────────────── */
const PANELS = ["emptyState", "loadingState", "errorState", "codeOutput"];

function showPanel(id) {
  PANELS.forEach((p) => {
    const el = document.getElementById(p);
    if (el) el.classList.toggle("hidden", p !== id);
  });
}

function setButtonLoading(id, isLoading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.toggle("loading", isLoading);
  btn.disabled = isLoading;
}

function setStatus(type, text) {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusText");
  const time = document.getElementById("statusTime");
  if (dot) dot.className = "status-dot " + type;
  if (label) label.textContent = text;
  if (time) time.textContent = new Date().toLocaleTimeString();
}

/* ──────────────────────────────────────────────
   HISTORY
────────────────────────────────────────────── */
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(url) {
  let h = getHistory().filter((u) => u !== url);
  h.unshift(url);
  h = h.slice(0, 10);
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById("recentList");
  const clearBtn = document.getElementById("clearHistoryBtn");
  const hist = getHistory();
  list.innerHTML = "";

  if (!hist.length) {
    clearBtn.classList.add("hidden");
    return;
  }
  clearBtn.classList.remove("hidden");

  hist.forEach((url) => {
    const domain = getDomain(url);
    const btn = document.createElement("button");
    btn.className = "recent-item";
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-label", "Re-fetch " + url);
    btn.innerHTML = `<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>${escapeHtml(domain)}</span>`;
    btn.addEventListener("click", () => {
      document.getElementById("appUrl").value = url;
      document.getElementById("heroUrl").value = url;
      document.getElementById("demo").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => startFetch("app"), 600);
    });
    list.appendChild(btn);
  });
}

document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  localStorage.removeItem(HIST_KEY);
  renderHistory();
  showToast("History cleared", "info");
});

renderHistory();

/* ──────────────────────────────────────────────
   LOADING STEP ANIMATION
────────────────────────────────────────────── */
let _stepsAborted = false;

async function animateLoadingSteps() {
  _stepsAborted = false;
  const steps = Array.from(document.querySelectorAll(".load-step"));
  steps.forEach((s) => s.classList.remove("active", "done"));

  for (let i = 0; i < steps.length; i++) {
    if (_stepsAborted) return;
    steps.forEach((s, si) => {
      s.classList.toggle("active", si === i);
      if (si < i) {
        s.classList.add("done");
        s.classList.remove("active");
      }
    });
    await delay(Math.random() * 450 + 320);
  }
  steps.forEach((s) => {
    s.classList.add("done");
    s.classList.remove("active");
  });
}

/* ──────────────────────────────────────────────
   LINE NUMBERS
────────────────────────────────────────────── */
function generateLineNumbers(containerId, code) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const n = (code || "").split("\n").length;
  el.innerHTML = Array.from(
    { length: n },
    (_, i) => `<div>${i + 1}</div>`,
  ).join("");
}

/* ──────────────────────────────────────────────
   RENDER OUTPUT
────────────────────────────────────────────── */
let currentData = null;

function renderOutput(data) {
  currentData = data;

  /* Code panels */
  const htmlEl = document.getElementById("htmlCode");
  const cssEl = document.getElementById("cssCode");
  const jsEl = document.getElementById("jsCode");

  htmlEl.textContent = data.html || "";
  cssEl.textContent = data.css || "";
  jsEl.textContent = data.js || "";

  if (window.hljs) {
    [htmlEl, cssEl, jsEl].forEach((el) => {
      try {
        window.hljs.highlightElement(el);
      } catch (_) {}
    });
  }

  generateLineNumbers("htmlLines", data.html || "");
  generateLineNumbers("cssLines", data.css || "");
  generateLineNumbers("jsLines", data.js || "");

  /* Tab badges */
  const s = data.stats || {};
  const countLines = (str) => (str || "").split("\n").length;
  document.getElementById("htmlBadge").textContent =
    (s.htmlLines || countLines(data.html)) + " ln";
  document.getElementById("cssBadge").textContent =
    (s.cssLines || countLines(data.css)) + " ln";
  document.getElementById("jsBadge").textContent =
    (s.jsLines || countLines(data.js)) + " ln";
  document.getElementById("metaBadge").textContent = (data.meta || []).length;
  document.getElementById("assetsBadge").textContent = (
    data.assets || []
  ).length;

  /* Footer info */
  document.getElementById("footerInfo").textContent =
    `HTML ${s.htmlLines || 0} ln  ·  CSS ${s.cssLines || 0} ln  ·  JS ${s.jsLines || 0} ln  ·  ${(data.assets || []).length} assets  ·  ${s.fetchTimeMs || 0}ms`;

  /* Framework badge */
  if (data.framework) {
    document.getElementById("frameworkBadge").classList.remove("hidden");
    document.getElementById("frameworkName").textContent =
      "Detected: " + data.framework;
  } else {
    document.getElementById("frameworkBadge").classList.add("hidden");
  }

  /* Asset counts */
  const assets = data.assets || [];
  document.getElementById("imgCount").textContent = assets.filter(
    (a) => a.type === "image",
  ).length;
  document.getElementById("fontCount").textContent = assets.filter(
    (a) => a.type === "font",
  ).length;
  document.getElementById("jsFileCount").textContent = assets.filter(
    (a) => a.type === "script",
  ).length;
  document.getElementById("cssFileCount").textContent = assets.filter(
    (a) => a.type === "stylesheet",
  ).length;
  document.getElementById("assetInfo").classList.remove("hidden");

  /* Page info */
  if (data.pageTitle) {
    document.getElementById("pageInfo").classList.remove("hidden");
    document.getElementById("pageTitle").textContent = data.pageTitle;
    const fav = document.getElementById("pageFavicon");
    if (data.favicon) {
      fav.src = data.favicon;
      fav.style.display = "inline";
      fav.onerror = () => (fav.style.display = "none");
    } else {
      fav.style.display = "none";
    }
  }

  /* Meta panel */
  const metaGrid = document.getElementById("metaGrid");
  if (data.meta && data.meta.length) {
    metaGrid.innerHTML = data.meta
      .map(
        (m) => `
      <div class="meta-item">
        <div class="meta-key">${escapeHtml(m.name || "")}</div>
        <div class="meta-value">${escapeHtml(m.content || "")}</div>
      </div>`,
      )
      .join("");
  } else {
    metaGrid.innerHTML =
      '<div class="meta-item"><div class="meta-key">info</div><div class="meta-value">No meta tags found</div></div>';
  }

  /* Assets panel */
  const assetsList = document.getElementById("assetsList");
  const typeIcon = {
    image: "fa-image",
    stylesheet: "fa-palette",
    script: "fa-code",
    font: "fa-font",
    icon: "fa-star",
    video: "fa-video",
    audio: "fa-music",
    other: "fa-paperclip",
  };

  if (assets.length) {
    assetsList.innerHTML = assets
      .map(
        (a) => `
      <div class="asset-item">
        <span class="asset-type-icon"><i class="fa-solid ${typeIcon[a.type] || "fa-paperclip"}" aria-hidden="true"></i></span>
        <span class="asset-url" title="${escapeHtml(a.url)}">${escapeHtml(a.url)}</span>
        <button class="asset-copy" onclick="copyText('${escapeHtml(a.url).replace(/'/g, "\\'")}')" aria-label="Copy URL" title="Copy URL">
          <i class="fa-regular fa-copy" aria-hidden="true"></i>
        </button>
      </div>`,
      )
      .join("");
  } else {
    assetsList.innerHTML =
      '<div style="padding:2rem;color:var(--text2);font-family:var(--font-mono);font-size:.875rem">No assets found.</div>';
  }

  /* Switch to HTML tab */
  switchTab("html");
  showPanel("codeOutput");
}

/* ──────────────────────────────────────────────
   MAIN FETCH FUNCTION
────────────────────────────────────────────── */
let _fetchAbortController = null;

async function startFetch(source) {
  const inputId = source === "hero" ? "heroUrl" : "appUrl";
  const raw = document.getElementById(inputId).value.trim();

  if (!raw) {
    showToast("Please enter a URL", "error");
    shakeInput(source === "hero" ? "heroInputGroup" : "appInputGroup");
    return;
  }

  const url = normalizeURL(raw);
  if (!isValidURL(url)) {
    showToast("Invalid URL format", "error");
    shakeInput(source === "hero" ? "heroInputGroup" : "appInputGroup");
    return;
  }

  /* Sync both inputs */
  document.getElementById("heroUrl").value = url;
  document.getElementById("appUrl").value = url;

  /* Scroll to demo section if triggered from hero */
  if (source === "hero") {
    document.getElementById("demo").scrollIntoView({ behavior: "smooth" });
    await delay(700);
  }

  /* Abort any in-flight request */
  if (_fetchAbortController) _fetchAbortController.abort();
  _fetchAbortController = new AbortController();
  _stepsAborted = false;

  /* Reset info UI */
  document.getElementById("frameworkBadge").classList.add("hidden");
  document.getElementById("assetInfo").classList.add("hidden");
  document.getElementById("pageInfo").classList.add("hidden");

  /* Loading state */
  setButtonLoading("heroFetchBtn", true);
  setButtonLoading("appFetchBtn", true);
  setStatus("running", "Fetching " + getDomain(url) + "...");
  showPanel("loadingState");

  const stepsPromise = animateLoadingSteps();

  try {
    const backendURL = getBackendURL();

    /* Step 1: Get signed token */
    let token = "",
      timestamp = "";
    try {
      const tokenResp = await fetch(`${backendURL}/api/token`, {
        signal: _fetchAbortController.signal,
      });
      const tokenData = await tokenResp.json();
      token = tokenData.token || "";
      timestamp = tokenData.timestamp || "";
    } catch (e) {
      if (e.name === "AbortError") throw e;
      /* Dev mode: continue without token */
    }

    /* Step 2: Scrape request */
    const timeoutId = setTimeout(() => _fetchAbortController.abort(), 35000);

    const resp = await fetch(`${backendURL}/api/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        includeAssets: document.getElementById("optAssets").checked,
        detectFramework: document.getElementById("optFramework").checked,
        token,
        timestamp,
      }),
      signal: _fetchAbortController.signal,
    });

    clearTimeout(timeoutId);
    _stepsAborted = false;
    await stepsPromise;

    if (!resp.ok) {
      const err = await resp
        .json()
        .catch(() => ({ error: `Server error ${resp.status}` }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.success) throw new Error(data.error || "Unknown server error");

    renderOutput(data);
    saveHistory(url);
    setStatus(
      "success",
      `✓ Done — ${getDomain(url)} extracted in ${data.stats?.fetchTimeMs || 0}ms`,
    );
    showToast(`✅ ${getDomain(url)} fetched!`, "success");
  } catch (err) {
    _stepsAborted = true;
    await stepsPromise.catch(() => {});

    if (err.name === "AbortError") {
      showPanel("emptyState");
      setStatus("idle", "Cancelled");
      setButtonLoading("heroFetchBtn", false);
      setButtonLoading("appFetchBtn", false);
      return;
    }

    let msg = err.message || "Unknown error";
    if (
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("Load failed")
    ) {
      msg =
        "Cannot reach the backend. Make sure your backend is running and the URL is configured correctly.";
    }
    if (msg.includes("AbortError") || msg.toLowerCase().includes("timed out")) {
      msg =
        "Request timed out (35s). The site may be too slow or blocking scrapers.";
    }

    document.getElementById("errorTitle").textContent = "Fetch Failed";
    document.getElementById("errorMsg").textContent = msg;
    showPanel("errorState");
    setStatus("error", "Error — " + msg.slice(0, 60));
    showToast("❌ " + msg, "error", 5000);
  } finally {
    setButtonLoading("heroFetchBtn", false);
    setButtonLoading("appFetchBtn", false);
    _fetchAbortController = null;
  }
}

/* Retry */
document
  .getElementById("retryBtn")
  .addEventListener("click", () => startFetch("app"));

/* ──────────────────────────────────────────────
   TAB SWITCHING
────────────────────────────────────────────── */
function switchTab(tabName) {
  document.querySelectorAll(".code-tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  const panel = document.getElementById("panel-" + tabName);
  if (panel) panel.classList.remove("hidden");
}

document.querySelectorAll(".code-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.tab);
    /* Re-run search highlight on tab change if search is active */
    const q = document.getElementById("searchInput")?.value;
    if (q && searchActive) setTimeout(() => doSearch(q), 50);
  });
});

/* ──────────────────────────────────────────────
   COPY
────────────────────────────────────────────── */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Copied!", "success"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Copied!", "success");
  } catch {
    showToast("Copy failed", "error");
  }
  document.body.removeChild(ta);
}

document.getElementById("copyBtn").addEventListener("click", () => {
  if (!currentData) {
    showToast("Nothing to copy yet", "error");
    return;
  }
  const tab = document.querySelector(".code-tab.active")?.dataset.tab;
  const map = {
    html: currentData.html,
    css: currentData.css,
    js: currentData.js,
  };
  if (map[tab]) copyText(map[tab]);
  else showToast("Copy not available for this tab", "info");
});

/* ──────────────────────────────────────────────
   DOWNLOAD ZIP
────────────────────────────────────────────── */
document.getElementById("downloadBtn").addEventListener("click", async () => {
  if (!currentData) {
    showToast("Fetch a site first!", "error");
    return;
  }
  if (!window.JSZip) {
    showToast("JSZip not loaded", "error");
    return;
  }

  const zip = new window.JSZip();
  zip.file("index.html", currentData.html || "");
  zip.file("styles.css", currentData.css || "");
  zip.file("main.js", currentData.js || "");

  if (currentData.meta?.length) {
    zip.file(
      "meta.txt",
      currentData.meta.map((m) => `${m.name}: ${m.content}`).join("\n"),
    );
  }
  if (currentData.assets?.length) {
    zip.file(
      "assets.txt",
      currentData.assets.map((a) => `[${a.type}] ${a.url}`).join("\n"),
    );
  }

  const domain = getDomain(currentData.url);
  zip.file(
    "README.md",
    `# ${currentData.pageTitle || domain}\n\n` +
      `Extracted by FETCH — ayocodes\n` +
      `Source: ${currentData.url}\n` +
      `Date: ${new Date().toISOString()}\n` +
      `Framework: ${currentData.framework || "Unknown"}\n\n` +
      `## Files\n` +
      `- index.html — page HTML\n` +
      `- styles.css  — all stylesheets\n` +
      `- main.js     — all scripts\n` +
      `- meta.txt    — meta tags\n` +
      `- assets.txt  — asset URLs\n`,
  );

  try {
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fetch-${domain.replace(/\./g, "-")}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showToast("ZIP downloaded!", "success");
  } catch (e) {
    showToast("ZIP failed: " + e.message, "error");
  }
});

/* ──────────────────────────────────────────────
   SHARE
────────────────────────────────────────────── */
document.getElementById("shareBtn").addEventListener("click", () => {
  if (!currentData) {
    showToast("Fetch a site first!", "error");
    return;
  }
  if (navigator.share) {
    navigator.share({
      title: "FETCH Result",
      text: `Extracted code from ${currentData.url}`,
      url: window.location.href,
    });
  } else {
    copyText(currentData.url);
    showToast("Source URL copied!", "info");
  }
});

/* ──────────────────────────────────────────────
   WORD WRAP
────────────────────────────────────────────── */
let wordWrap = false;
document.getElementById("wrapBtn").addEventListener("click", () => {
  wordWrap = !wordWrap;
  document
    .querySelectorAll(".panel pre")
    .forEach((p) => (p.style.whiteSpace = wordWrap ? "pre-wrap" : "pre"));
  showToast(wordWrap ? "Word wrap on" : "Word wrap off", "info");
});

/* ──────────────────────────────────────────────
   IN-CODE SEARCH
────────────────────────────────────────────── */
let searchActive = false;
let searchTimeout = null;

document.getElementById("searchBtn").addEventListener("click", () => {
  const bar = document.getElementById("searchBar");
  searchActive = !searchActive;
  bar.classList.toggle("hidden", !searchActive);
  if (searchActive) document.getElementById("searchInput").focus();
  else clearSearch();
});

document.getElementById("closeSearch").addEventListener("click", () => {
  document.getElementById("searchBar").classList.add("hidden");
  searchActive = false;
  clearSearch();
  document.getElementById("searchInput").value = "";
  document.getElementById("searchCount").textContent = "";
});

document.getElementById("searchInput").addEventListener("input", function () {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => doSearch(this.value), 300);
});

function doSearch(query) {
  const countEl = document.getElementById("searchCount");
  if (!currentData || !query.trim()) {
    clearSearch();
    countEl.textContent = "";
    return;
  }
  const activeTab = document.querySelector(".code-tab.active")?.dataset.tab;
  if (!["html", "css", "js"].includes(activeTab)) {
    countEl.textContent = "Search works on code tabs";
    return;
  }

  const codeEl = document.getElementById(activeTab + "Code");
  if (!codeEl) return;

  const raw =
    activeTab === "html"
      ? currentData.html
      : activeTab === "css"
        ? currentData.css
        : currentData.js;

  const escaped = escapeHtml(raw);
  const regex = new RegExp(escapeRegex(query), "gi");
  let count = 0;
  const hilit = escaped.replace(regex, (m) => {
    count++;
    return `<mark class="search-highlight">${m}</mark>`;
  });

  codeEl.innerHTML = hilit;
  countEl.textContent = count
    ? `${count} result${count !== 1 ? "s" : ""}`
    : "0 results";

  if (count) {
    const first = codeEl.querySelector("mark");
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function clearSearch() {
  if (!currentData) return;
  const activeTab = document.querySelector(".code-tab.active")?.dataset.tab;
  if (!["html", "css", "js"].includes(activeTab)) return;
  const raw =
    activeTab === "html"
      ? currentData.html
      : activeTab === "css"
        ? currentData.css
        : currentData.js;
  const el = document.getElementById(activeTab + "Code");
  if (el) {
    el.textContent = raw;
    if (window.hljs)
      try {
        window.hljs.highlightElement(el);
      } catch (_) {}
    generateLineNumbers(activeTab + "Lines", raw);
  }
}

/* ──────────────────────────────────────────────
   FULLSCREEN
────────────────────────────────────────────── */
document.getElementById("fullscreenBtn").addEventListener("click", () => {
  const shell = document.querySelector(".app-shell");
  if (!document.fullscreenElement) {
    shell.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
});

/* ──────────────────────────────────────────────
   HERO & APP TRIGGERS
────────────────────────────────────────────── */
document
  .getElementById("heroFetchBtn")
  .addEventListener("click", () => startFetch("hero"));
document.getElementById("heroUrl").addEventListener("keydown", (e) => {
  if (e.key === "Enter") startFetch("hero");
});
document
  .getElementById("appFetchBtn")
  .addEventListener("click", () => startFetch("app"));
document.getElementById("appUrl").addEventListener("keydown", (e) => {
  if (e.key === "Enter") startFetch("app");
});

/* Sync inputs */
document.getElementById("heroUrl").addEventListener("input", function () {
  document.getElementById("appUrl").value = this.value;
});
document.getElementById("appUrl").addEventListener("input", function () {
  document.getElementById("heroUrl").value = this.value;
});

/* ──────────────────────────────────────────────
   MAGNETIC BUTTONS
────────────────────────────────────────────── */
document
  .querySelectorAll(".btn-primary, .fetch-btn, .app-fetch-btn")
  .forEach((btn) => {
    btn.addEventListener("mousemove", function (e) {
      const r = this.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.2;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.2;
      this.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    btn.addEventListener("mouseleave", function () {
      this.style.transform = "";
      this.style.transition = "transform .4s cubic-bezier(.16,1,.3,1)";
    });
    btn.addEventListener("mouseenter", function () {
      this.style.transition = "transform .1s ease";
    });
  });

/* ──────────────────────────────────────────────
   ACTIVE NAV ON SCROLL
────────────────────────────────────────────── */
(function () {
  const sections = document.querySelectorAll("section[id]");
  const links = document.querySelectorAll(".nav-link");
  window.addEventListener(
    "scroll",
    () => {
      let cur = "";
      sections.forEach((s) => {
        if (window.scrollY >= s.offsetTop - 120) cur = s.id;
      });
      links.forEach((l) => {
        l.style.color =
          l.getAttribute("href") === "#" + cur ? "var(--cyan)" : "";
      });
    },
    { passive: true },
  );
})();

/* ──────────────────────────────────────────────
   KEYBOARD SHORTCUTS
────────────────────────────────────────────── */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    document.getElementById("appUrl").focus();
    document.getElementById("demo").scrollIntoView({ behavior: "smooth" });
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    startFetch("app");
  }
  if (e.key === "Escape") {
    /* Close mobile menu */
    const mm = document.getElementById("mobileMenu");
    if (mm.classList.contains("open")) {
      mm.classList.remove("open");
      document.getElementById("hamburger").classList.remove("active");
      mm.setAttribute("aria-hidden", "true");
      mm.style.display = "none";
      document.body.style.overflow = "";
    }
    /* Close search */
    if (searchActive) {
      document.getElementById("closeSearch").click();
    }
  }
});

/* ──────────────────────────────────────────────
   TERMINAL TYPEWRITER
────────────────────────────────────────────── */
(function initTerminal() {
  const cmd = document.getElementById("termCmd");
  const out = document.getElementById("termOutput");
  if (!cmd || !out) return;

  const seqs = [
    {
      command: "node server.js",
      lines: [
        { text: "⚡ FETCH backend running on :3001", cls: "t-green", d: 500 },
        { text: "   Health: /health ✓", cls: "t-muted", d: 800 },
        { text: "", cls: "", d: 1100 },
        { text: "POST /api/fetch  200  1247ms", cls: "t-cyan", d: 1600 },
        { text: "→ github.com — React 18 detected", cls: "t-muted", d: 1900 },
        { text: "→ 412 ln HTML · 891 ln CSS", cls: "t-muted", d: 2200 },
        { text: "✓ Extraction complete", cls: "t-green", d: 2600 },
      ],
    },
    {
      command: 'curl /api/fetch -d \'{"url":"stripe.com"}\'',
      lines: [
        { text: "→ Connecting to stripe.com...", cls: "t-muted", d: 400 },
        { text: "→ Parsing 2,891 DOM elements...", cls: "t-muted", d: 800 },
        { text: "→ Fetching 4 stylesheets...", cls: "t-muted", d: 1200 },
        { text: "→ Fetching 7 JS bundles...", cls: "t-muted", d: 1600 },
        { text: "✓ Framework: Next.js 14", cls: "t-cyan", d: 2000 },
        { text: "✓ 1,247 ln CSS · 892 ln JS", cls: "t-green", d: 2300 },
        { text: "✓ Done in 1.87s ⚡", cls: "t-amber", d: 2600 },
      ],
    },
  ];

  let si = 0;
  async function run() {
    const s = seqs[si % seqs.length];
    cmd.textContent = "";
    out.innerHTML = "";

    for (let i = 0; i <= s.command.length; i++) {
      cmd.textContent = s.command.slice(0, i);
      await delay(35 + Math.random() * 20);
    }

    for (let i = 0; i < s.lines.length; i++) {
      const l = s.lines[i];
      const prev = s.lines[i - 1];
      const wait = l.d - (prev?.d || 0);
      await delay(wait);
      if (!l.text) {
        out.appendChild(document.createElement("br"));
        continue;
      }
      const d = document.createElement("div");
      d.className = "t-line " + l.cls;
      d.textContent = l.text;
      out.appendChild(d);
      requestAnimationFrame(() => d.classList.add("show"));
    }

    await delay(4000);
    si++;
    out.style.opacity = "0";
    out.style.transition = "opacity .5s";
    await delay(500);
    out.style.opacity = "1";
    run();
  }

  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        run();
        io.disconnect();
      }
    },
    { threshold: 0.3 },
  );

  const tc = document.querySelector(".terminal-card");
  if (tc) io.observe(tc);
})();

/* ──────────────────────────────────────────────
   CONSOLE SIGNATURE
────────────────────────────────────────────── */
console.log(
  "%c[FETCH] by ayocodes ⚡%c  v2.0\nBackend: " +
    getBackendURL() +
    "\nCtrl+K = focus input  |  Ctrl+Enter = fetch",
  "background:#00e5ff;color:#030507;font-weight:900;font-size:13px;padding:5px 10px;border-radius:5px;",
  "color:#7aa3b5;font-size:11px;",
);
