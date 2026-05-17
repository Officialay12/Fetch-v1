/* ═══════════════════════════════════════════════
   FETCH — script.js  v2.0.0
   by ayocodes

   frontend logic. does what it says on the tin.
   - google auth (when google doesn't break it)
   - fetch websites (hopefully)
   - deobfuscate js (ai does the hard work)
   - profile panel, history, search, all that.
═══════════════════════════════════════════════ */

"use strict";

const BACKEND_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "https://fetch-v1.onrender.com";

let GOOGLE_CLIENT_ID = null;
const HIST_KEY = "fetch-history";

/* ──────────────────────────────────────────────
   auth guard — redirect if not logged in
────────────────────────────────────────────── */
(function authGuard() {
  const token = localStorage.getItem("fetch_token");
  if (!token && !window.location.pathname.includes("auth.html")) {
    window.location.replace("auth.html");
  }
})();

/* ──────────────────────────────────────────────
   config — get google client id from backend
────────────────────────────────────────────── */
(function loadAppConfig() {
  fetch(`${BACKEND_URL}/api/config`)
    .then((r) => r.json())
    .then((data) => {
      if (data.googleClientId) GOOGLE_CLIENT_ID = data.googleClientId;
    })
    .catch((e) => console.warn("[config]", e.message));
})();

/* ──────────────────────────────────────────────
   utils — boring but necessary
────────────────────────────────────────────── */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(s) {
  if (!s) return "";
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

function $(id) {
  return document.getElementById(id);
}

/* ──────────────────────────────────────────────
   preloader — fake progress bar, looks cool
────────────────────────────────────────────── */
(function initPreloader() {
  const preloader = $("preloader");
  const bar = document.querySelector(".pre-bar");
  const pct = document.querySelector(".pre-percent");
  if (!preloader) return;

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
    if (bar) bar.style.width = progress + "%";
    if (pct) pct.textContent = Math.floor(progress) + "%";
  }, 80);
})();

/* ──────────────────────────────────────────────
   custom cursor — only on desktop, cleanup on exit
────────────────────────────────────────────── */
(function initCursor() {
  if (window.matchMedia("(max-width:640px)").matches) return;
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  if (!dot || !ring) return;

  let mx = 0,
    my = 0,
    rx = 0,
    ry = 0;
  let rafId = null;
  let isActive = true;

  function loop() {
    if (!isActive) return;
    rx += (mx - rx) * 0.14;
    ry += (my - ry) * 0.14;
    ring.style.left = rx + "px";
    ring.style.top = ry + "px";
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + "px";
    dot.style.top = my + "px";
  });

  rafId = requestAnimationFrame(loop);

  document.addEventListener("mousedown", () =>
    document.body.classList.add("cursor-click"),
  );
  document.addEventListener("mouseup", () =>
    document.body.classList.remove("cursor-click"),
  );

  document.addEventListener("mouseover", (e) => {
    if (
      e.target.closest(
        "a, button, input, [role='tab'], .step-card, .feature-card, .recent-item, .social-link, .toggle-wrap",
      )
    ) {
      document.body.classList.add("cursor-hover");
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (
      e.target.closest(
        "a, button, input, [role='tab'], .step-card, .feature-card, .recent-item, .social-link, .toggle-wrap",
      )
    ) {
      document.body.classList.remove("cursor-hover");
    }
  });

  window.addEventListener("beforeunload", () => {
    isActive = false;
    if (rafId) cancelAnimationFrame(rafId);
  });
})();

/* ──────────────────────────────────────────────
   navbar — mobile menu, scroll effects
────────────────────────────────────────────── */
(function initNavbar() {
  const navbar = $("navbar");
  const hamburger = $("hamburger");
  const mobileMenu = $("mobileMenu");
  if (!mobileMenu) return;

  mobileMenu.setAttribute("aria-hidden", "true");
  mobileMenu.style.display = "none";

  window.addEventListener(
    "scroll",
    () => {
      if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 30);
    },
    { passive: true },
  );

  if (hamburger) {
    hamburger.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("open");
      hamburger.classList.toggle("active", isOpen);
      hamburger.setAttribute("aria-expanded", String(isOpen));
      mobileMenu.setAttribute("aria-hidden", String(!isOpen));
      mobileMenu.style.display = isOpen ? "block" : "none";
      document.body.style.overflow = isOpen ? "hidden" : "";
    });
  }

  document.querySelectorAll(".mob-link").forEach((l) => {
    l.addEventListener("click", () => {
      mobileMenu.classList.remove("open");
      hamburger?.classList.remove("active");
      mobileMenu.setAttribute("aria-hidden", "true");
      mobileMenu.style.display = "none";
      document.body.style.overflow = "";
    });
  });
})();

/* ──────────────────────────────────────────────
   theme — dark/light mode, saves to localstorage
────────────────────────────────────────────── */
(function initTheme() {
  const btn = $("themeToggle");
  const icon = $("themeIcon");
  const html = document.documentElement;
  const saved = localStorage.getItem("fetch-theme") || "dark";

  html.setAttribute("data-theme", saved);
  if (icon)
    icon.className = saved === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";

  btn?.addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    if (icon)
      icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
    localStorage.setItem("fetch-theme", next);
    showToast(next === "dark" ? "dark mode on" : "light mode on", "info");
  });
})();

/* ──────────────────────────────────────────────
   logout — clear token, back to auth page
────────────────────────────────────────────── */
(function initLogout() {
  $("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("fetch_token");
    localStorage.removeItem("fetch_user");
    window.location.replace("/auth.html");
  });
})();

/* ──────────────────────────────────────────────
   canvas particles — floating dots, cleans up after itself
────────────────────────────────────────────── */
(function initParticles() {
  const canvas = $("particleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H;
  let animationId = null;
  let isActive = true;
  const mouse = { x: null, y: null };
  const particles = [];
  const COLORS = ["rgba(0,229,255,", "rgba(170,255,0,", "rgba(255,183,0,"];

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || document.body);
  resize();

  class Particle {
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
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const d = Math.hypot(dx, dy);
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
      ) {
        this.reset();
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color + this.alpha + ")";
      ctx.fill();
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new Particle());

  function connect() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.hypot(dx, dy);
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
  canvas.addEventListener("mouseleave", () => {
    mouse.x = null;
    mouse.y = null;
  });

  function loop() {
    if (!isActive || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.update();
      p.draw();
    });
    connect();
    animationId = requestAnimationFrame(loop);
  }

  loop();

  window.addEventListener("beforeunload", () => {
    isActive = false;
    if (animationId) cancelAnimationFrame(animationId);
    ro.disconnect();
  });
})();

/* ──────────────────────────────────────────────
   scroll reveal — fade in elements when they appear
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
   parallax — slow moving background glows
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
   counters — animate numbers on stats
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
   toast — small notification popup
────────────────────────────────────────────── */
function showToast(msg, type = "info", duration = 3200) {
  const t = $("toast");
  if (!t) return;
  const icons = {
    success: "fa-check-circle",
    error: "fa-circle-xmark",
    info: "fa-circle-info",
  };
  const icon = document.createElement("i");
  icon.className = `fa-solid ${icons[type] || icons.info}`;
  icon.setAttribute("aria-hidden", "true");
  const span = document.createElement("span");
  span.textContent = msg;
  t.innerHTML = "";
  t.appendChild(icon);
  t.appendChild(span);
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), duration);
}

/* ──────────────────────────────────────────────
   shake — error animation for inputs
────────────────────────────────────────────── */
const shakeStyle = document.createElement("style");
shakeStyle.textContent =
  "@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}";
document.head.appendChild(shakeStyle);

function shakeElement(el) {
  if (!el) return;
  el.style.animation = "shake 0.4s ease";
  el.addEventListener("animationend", () => (el.style.animation = ""), {
    once: true,
  });
}

/* ──────────────────────────────────────────────
   ui state — loading, error, empty, output panels
────────────────────────────────────────────── */
const PANELS = ["emptyState", "loadingState", "errorState", "codeOutput"];

function showPanel(id) {
  PANELS.forEach((p) => {
    const el = $(p);
    if (el) el.classList.toggle("hidden", p !== id);
  });
}

function setButtonLoading(id, isLoading) {
  const btn = $(id);
  if (!btn) return;
  btn.classList.toggle("loading", isLoading);
  btn.disabled = isLoading;
}

function setStatus(type, text) {
  const dot = $("statusDot");
  const label = $("statusText");
  const time = $("statusTime");
  if (dot) dot.className = "status-dot " + type;
  if (label) label.textContent = text;
  if (time) time.textContent = new Date().toLocaleTimeString();
}

/* ──────────────────────────────────────────────
   history — last 10 urls, stored locally
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
  localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 10)));
  renderHistory();
}

function renderHistory() {
  const list = $("recentList");
  const clearBtn = $("clearHistoryBtn");
  const hist = getHistory();
  if (!list) return;
  list.innerHTML = "";

  if (!hist.length) {
    clearBtn?.classList.add("hidden");
    return;
  }
  clearBtn?.classList.remove("hidden");

  hist.forEach((url) => {
    const btn = document.createElement("button");
    btn.className = "recent-item";
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-label", "re-fetch " + url);

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-clock-rotate-left";
    icon.setAttribute("aria-hidden", "true");

    const span = document.createElement("span");
    span.textContent = getDomain(url);

    btn.appendChild(icon);
    btn.appendChild(span);

    btn.addEventListener("click", () => {
      const appUrlEl = $("appUrl");
      if (appUrlEl) appUrlEl.value = url;
      $("demo")?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => startFetch("app"), 600);
    });

    list.appendChild(btn);
  });
}

$("clearHistoryBtn")?.addEventListener("click", () => {
  localStorage.removeItem(HIST_KEY);
  renderHistory();
  showToast("history cleared", "info");
});

renderHistory();

/* ──────────────────────────────────────────────
   loading steps — animated steps during fetch
────────────────────────────────────────────── */
let _stepsAborted = false;

async function animateLoadingSteps() {
  _stepsAborted = false;
  const steps = Array.from(document.querySelectorAll(".load-step"));
  steps.forEach((s) => s.classList.remove("active", "done"));

  for (let i = 0; i < steps.length; i++) {
    if (_stepsAborted) return;
    steps.forEach((s, si) => {
      if (si === i) {
        s.classList.add("active");
        s.classList.remove("done");
      } else if (si < i) {
        s.classList.remove("active");
        s.classList.add("done");
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
   line numbers — for code blocks
────────────────────────────────────────────── */
function generateLineNumbers(containerId, code) {
  const el = $(containerId);
  if (!el) return;
  const n = (code || "").split("\n").length;
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= n; i++) {
    const div = document.createElement("div");
    div.textContent = i;
    frag.appendChild(div);
  }
  el.innerHTML = "";
  el.appendChild(frag);
}

/* ──────────────────────────────────────────────
   render output — takes fetch response, fills all tabs
────────────────────────────────────────────── */
let currentData = null;

function renderOutput(data) {
  currentData = data;

  const htmlEl = $("htmlCode");
  const cssEl = $("cssCode");
  const jsEl = $("jsCode");

  if (htmlEl) htmlEl.textContent = data.html || "";
  if (cssEl) cssEl.textContent = data.css || "";
  if (jsEl) jsEl.textContent = data.js || "";

  if (window.hljs) {
    [htmlEl, cssEl, jsEl].forEach((el) => {
      if (el)
        try {
          window.hljs.highlightElement(el);
        } catch (_) {}
    });
  }

  generateLineNumbers("htmlLines", data.html || "");
  generateLineNumbers("cssLines", data.css || "");
  generateLineNumbers("jsLines", data.js || "");

  const s = data.stats || {};
  const countLines = (str) => (str || "").split("\n").length;

  const badges = {
    htmlBadge: (s.htmlLines || countLines(data.html)) + " ln",
    cssBadge: (s.cssLines || countLines(data.css)) + " ln",
    jsBadge: (s.jsLines || countLines(data.js)) + " ln",
    metaBadge: (data.meta || []).length,
    assetsBadge: (data.assets || []).length,
  };
  Object.entries(badges).forEach(([id, val]) => {
    const el = $(id);
    if (el) el.textContent = val;
  });

  const footerInfo = $("footerInfo");
  if (footerInfo) {
    footerInfo.textContent = `HTML ${s.htmlLines || 0} ln · CSS ${s.cssLines || 0} ln · JS ${s.jsLines || 0} ln · ${(data.assets || []).length} assets · ${s.fetchTimeMs || 0}ms`;
  }

  const frameworkBadge = $("frameworkBadge");
  const frameworkName = $("frameworkName");
  if (frameworkBadge) {
    frameworkBadge.classList.toggle("hidden", !data.framework);
    if (data.framework && frameworkName)
      frameworkName.textContent = "detected: " + data.framework;
  }

  const assets = data.assets || [];
  [
    ["imgCount", assets.filter((a) => a.type === "image").length],
    ["fontCount", assets.filter((a) => a.type === "font").length],
    ["jsFileCount", assets.filter((a) => a.type === "script").length],
    ["cssFileCount", assets.filter((a) => a.type === "stylesheet").length],
  ].forEach(([id, val]) => {
    const el = $(id);
    if (el) el.textContent = val;
  });

  $("assetInfo")?.classList.remove("hidden");

  if (data.pageTitle) {
    const pageInfo = $("pageInfo");
    const pageTitle = $("pageTitle");
    const fav = $("pageFavicon");
    pageInfo?.classList.remove("hidden");
    if (pageTitle) pageTitle.textContent = data.pageTitle;
    if (fav) {
      if (data.favicon) {
        fav.src = data.favicon;
        fav.style.display = "inline";
        fav.onerror = () => (fav.style.display = "none");
      } else {
        fav.style.display = "none";
      }
    }
  }

  const metaGrid = $("metaGrid");
  if (metaGrid) {
    metaGrid.innerHTML = "";
    const metas = data.meta?.length
      ? data.meta
      : [{ name: "info", content: "no meta tags found" }];
    metas.forEach(({ name, content }) => {
      const item = document.createElement("div");
      item.className = "meta-item";
      const key = document.createElement("div");
      key.className = "meta-key";
      key.textContent = name || "";
      const val = document.createElement("div");
      val.className = "meta-value";
      val.textContent = content || "";
      item.appendChild(key);
      item.appendChild(val);
      metaGrid.appendChild(item);
    });
  }

  const assetsList = $("assetsList");
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

  if (assetsList) {
    assetsList.innerHTML = "";
    if (assets.length) {
      assets.forEach((a) => {
        const item = document.createElement("div");
        item.className = "asset-item";

        const iconEl = document.createElement("span");
        iconEl.className = "asset-type-icon";
        const i = document.createElement("i");
        i.className = `fa-solid ${typeIcon[a.type] || "fa-paperclip"}`;
        i.setAttribute("aria-hidden", "true");
        iconEl.appendChild(i);

        const urlEl = document.createElement("span");
        urlEl.className = "asset-url";
        urlEl.title = a.url;
        urlEl.textContent = a.url;

        const copyBtn = document.createElement("button");
        copyBtn.className = "asset-copy";
        copyBtn.title = "copy url";
        copyBtn.setAttribute("aria-label", "copy url");
        copyBtn.innerHTML =
          '<i class="fa-regular fa-copy" aria-hidden="true"></i>';
        copyBtn.addEventListener("click", () => copyText(a.url));

        item.appendChild(iconEl);
        item.appendChild(urlEl);
        item.appendChild(copyBtn);
        assetsList.appendChild(item);
      });
    } else {
      assetsList.innerHTML =
        '<div style="padding:2rem;color:var(--text2);font-family:var(--font-mono);font-size:.875rem">no assets found.</div>';
    }
  }

  switchTab("html");
  showPanel("codeOutput");
}

/* ──────────────────────────────────────────────
   standalone deobfuscator — paste js, get readable code
────────────────────────────────────────────── */
const EXAMPLE_OBFUSCATED = `// example of obfuscated javascript
var _0x1234 = ['hello', 'world', 'console', 'log', 'example'];
var _0x5678 = function(_0x9abc, _0xdef0) {
    return _0x1234[_0x9abc] + ' ' + _0x1234[_0xdef0];
};
var _0xabcd = function(_0xef01) {
    return _0x1234[_0xef01];
};
console[_0x1234[0x2]](_0x5678(0x0, 0x1));
console[_0x1234[0x2]](_0xabcd(0x4));`;

let isDeobfuscating = false;

function updateInputStats() {
  const ta = $("obfuscatedInput");
  if (!ta) return;
  const charCount = $("charCount");
  const lineCount = $("lineCount");
  if (charCount)
    charCount.textContent = `${ta.value.length.toLocaleString()} characters`;
  if (lineCount) lineCount.textContent = `${ta.value.split("\n").length} lines`;
}

function setDeobfState(state) {
  const btn = $("deobfuscateStandaloneBtn");
  const placeholder = $("deobfuscatePlaceholder");
  const loading = $("deobfuscateLoading");
  const output = $("deobfuscateOutputContent");

  if (state === "idle") {
    if (btn) {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
    if (loading) loading.style.display = "none";
    if (output) output.style.display = "none";
    if (placeholder) placeholder.style.display = "flex";
  } else if (state === "loading") {
    if (btn) {
      btn.classList.add("loading");
      btn.disabled = true;
    }
    if (placeholder) placeholder.style.display = "none";
    if (loading) loading.style.display = "flex";
    if (output) output.style.display = "none";
  } else if (state === "done") {
    if (btn) {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
    if (loading) loading.style.display = "none";
    if (output) output.style.display = "block";
    if (placeholder) placeholder.style.display = "none";
  }
}

async function standaloneDeobfuscate() {
  if (isDeobfuscating) {
    showToast("deobfuscation already in progress", "info");
    return;
  }

  const ta = $("obfuscatedInput");
  const code = ta?.value.trim();

  if (!code) {
    showToast("paste some javascript to deobfuscate", "error");
    return;
  }
  if (code.length < 20) {
    showToast("code too short", "error");
    return;
  }

  const token = localStorage.getItem("fetch_token");
  if (!token) {
    window.location.replace("/auth.html");
    return;
  }

  isDeobfuscating = true;
  setDeobfState("loading");

  try {
    const res = await fetch(`${BACKEND_URL}/api/deobfuscate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsCode: code }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`server returned ${res.status} — unexpected response`);
    }

    const data = await res.json();

    if (res.status === 401) {
      localStorage.removeItem("fetch_token");
      window.location.replace("/auth.html");
      return;
    }

    if (data.success) {
      const codeEl = $("deobfuscatedCode");
      if (codeEl) {
        codeEl.textContent = data.deobfuscated;
        if (window.hljs)
          try {
            window.hljs.highlightElement(codeEl);
          } catch (_) {}
      }
      setDeobfState("done");
      showToast("deobfuscation complete", "success");
    } else {
      showToast(data.error || "deobfuscation failed", "error");
      setDeobfState("idle");
    }
  } catch (err) {
    console.error("[deobfuscate]", err);
    showToast(
      err.message || "network error — is the backend running?",
      "error",
    );
    setDeobfState("idle");
  } finally {
    isDeobfuscating = false;
  }
}

$("deobfuscateStandaloneBtn")?.addEventListener("click", standaloneDeobfuscate);
$("loadExampleBtn")?.addEventListener("click", () => {
  const ta = $("obfuscatedInput");
  if (ta) {
    ta.value = EXAMPLE_OBFUSCATED;
    updateInputStats();
    showToast("example loaded", "info");
  }
});
$("clearInputBtn")?.addEventListener("click", () => {
  const ta = $("obfuscatedInput");
  if (ta) {
    ta.value = "";
    updateInputStats();
    setDeobfState("idle");
    showToast("input cleared", "info");
  }
});
$("uploadFile")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 500000) {
    showToast("file too large (max 500kb)", "error");
    e.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const ta = $("obfuscatedInput");
    if (ta) {
      ta.value = ev.target.result;
      updateInputStats();
      showToast(`loaded ${file.name}`, "success");
    }
  };
  reader.onerror = () => showToast("error reading file", "error");
  reader.readAsText(file);
  e.target.value = "";
});
$("copyDeobfuscatedOutputBtn")?.addEventListener("click", () => {
  const code = $("deobfuscatedCode")?.textContent;
  if (!code) {
    showToast("nothing to copy", "error");
    return;
  }
  copyText(code);
});
$("downloadDeobfuscatedBtn")?.addEventListener("click", () => {
  const code = $("deobfuscatedCode")?.textContent;
  if (!code) {
    showToast("nothing to download", "error");
    return;
  }
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deobfuscated_${Date.now()}.js`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("downloaded", "success");
});
$("obfuscatedInput")?.addEventListener("input", updateInputStats);
updateInputStats();

/* ──────────────────────────────────────────────
   main fetch — send url to backend, show results
────────────────────────────────────────────── */
let _abortController = null;

async function startFetch(source) {
  const inputEl = source === "hero" ? $("heroUrl") : $("appUrl");
  if (!inputEl) return;

  const raw = inputEl.value.trim();
  if (!raw) {
    showToast("enter a url", "error");
    shakeElement(source === "hero" ? $("heroInputGroup") : $("appInputGroup"));
    return;
  }

  const url = normalizeURL(raw);
  if (!isValidURL(url)) {
    showToast("invalid url format", "error");
    shakeElement(source === "hero" ? $("heroInputGroup") : $("appInputGroup"));
    return;
  }

  [$("heroUrl"), $("appUrl")].forEach((el) => {
    if (el) el.value = url;
  });

  if (source === "hero") {
    $("demo")?.scrollIntoView({ behavior: "smooth" });
    await delay(700);
  }

  if (_abortController) _abortController.abort();
  _abortController = new AbortController();
  _stepsAborted = false;

  ["frameworkBadge", "assetInfo", "pageInfo"].forEach((id) =>
    $(id)?.classList.add("hidden"),
  );

  setButtonLoading("heroFetchBtn", true);
  setButtonLoading("appFetchBtn", true);
  setStatus("running", "fetching " + getDomain(url) + "…");
  showPanel("loadingState");

  const stepsPromise = animateLoadingSteps();
  const token = localStorage.getItem("fetch_token");

  if (!token) {
    window.location.replace("/auth.html");
    return;
  }

  try {
    const timeoutId = setTimeout(() => _abortController.abort(), 35000);

    const resp = await fetch(`${BACKEND_URL}/api/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
      signal: _abortController.signal,
    });

    clearTimeout(timeoutId);
    _stepsAborted = false;
    await stepsPromise;

    if (resp.status === 401) {
      localStorage.removeItem("fetch_token");
      window.location.replace("/auth.html");
      return;
    }

    if (!resp.ok) {
      const err = await resp
        .json()
        .catch(() => ({ error: `server error ${resp.status}` }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.success) throw new Error(data.error || "unknown server error");

    renderOutput(data);
    saveHistory(url);
    setStatus(
      "success",
      `✓ done — ${getDomain(url)} extracted in ${data.stats?.fetchTimeMs || 0}ms`,
    );
    showToast(`✅ ${getDomain(url)} fetched`, "success");
  } catch (err) {
    _stepsAborted = true;
    await stepsPromise.catch(() => {});

    if (err.name === "AbortError") {
      showPanel("emptyState");
      setStatus("idle", "cancelled");
      return;
    }

    let msg = err.message || "unknown error";
    if (/failed to fetch|networkerror/i.test(msg)) {
      msg = "cannot reach backend — cold start? wait 30 seconds and retry";
    }

    const errorTitle = $("errorTitle");
    const errorMsg = $("errorMsg");
    if (errorTitle) errorTitle.textContent = "fetch failed";
    if (errorMsg) errorMsg.textContent = msg;
    showPanel("errorState");
    setStatus("error", "error — " + msg.slice(0, 60));
    showToast("❌ " + msg, "error", 5000);
  } finally {
    setButtonLoading("heroFetchBtn", false);
    setButtonLoading("appFetchBtn", false);
    _abortController = null;
  }
}

$("retryBtn")?.addEventListener("click", () => startFetch("app"));

/* ──────────────────────────────────────────────
   tab switching — html, css, js tabs
────────────────────────────────────────────── */
function switchTab(tabName) {
  document.querySelectorAll(".code-tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  $("panel-" + tabName)?.classList.remove("hidden");
}

document.querySelectorAll(".code-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.tab);
    const q = $("searchInput")?.value;
    if (q && searchActive) setTimeout(() => doSearch(q), 50);
  });
});

/* ──────────────────────────────────────────────
   copy — clipboard with fallback
────────────────────────────────────────────── */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("copied", "success"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText =
    "position:fixed;opacity:0;top:0;left:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("copied", "success");
  } catch {
    showToast("copy failed — copy manually", "error");
  }
  document.body.removeChild(ta);
}

$("copyBtn")?.addEventListener("click", () => {
  if (!currentData) {
    showToast("nothing to copy", "error");
    return;
  }
  const tab = document.querySelector(".code-tab.active")?.dataset.tab;
  const map = {
    html: currentData.html,
    css: currentData.css,
    js: currentData.js,
  };
  if (map[tab]) copyText(map[tab]);
  else showToast("copy not available", "info");
});

/* ──────────────────────────────────────────────
   download zip — bundles everything
────────────────────────────────────────────── */
$("downloadBtn")?.addEventListener("click", async () => {
  if (!currentData) {
    showToast("fetch a site first", "error");
    return;
  }
  if (!window.JSZip) {
    showToast("jszip not loaded", "error");
    return;
  }

  const zip = new window.JSZip();
  const domain = getDomain(currentData.url || "site");

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

  zip.file(
    "README.md",
    `# ${currentData.pageTitle || domain}\n\nextracted by fetch v2.0.0 — ayocodes\nsource: ${currentData.url}\ndate: ${new Date().toISOString()}\nframework: ${currentData.framework || "unknown"}\n\n## files\n- index.html\n- styles.css\n- main.js\n- meta.txt\n- assets.txt\n`,
  );

  try {
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `fetch-${domain.replace(/\./g, "-")}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    showToast("zip downloaded", "success");
  } catch (e) {
    showToast("zip failed: " + e.message, "error");
  }
});

/* ──────────────────────────────────────────────
   share — native share or copy url
────────────────────────────────────────────── */
$("shareBtn")?.addEventListener("click", () => {
  if (!currentData) {
    showToast("fetch a site first", "error");
    return;
  }
  if (navigator.share) {
    navigator.share({
      title: "fetch result",
      text: `extracted code from ${currentData.url}`,
      url: window.location.href,
    });
  } else {
    copyText(currentData.url);
    showToast("source url copied", "info");
  }
});

/* ──────────────────────────────────────────────
   word wrap — toggle for code view
────────────────────────────────────────────── */
let wordWrap = false;
$("wrapBtn")?.addEventListener("click", () => {
  wordWrap = !wordWrap;
  document
    .querySelectorAll(".panel pre")
    .forEach((p) => (p.style.whiteSpace = wordWrap ? "pre-wrap" : "pre"));
  showToast(wordWrap ? "word wrap on" : "word wrap off", "info");
});

/* ──────────────────────────────────────────────
   search — highlight text in code tabs
────────────────────────────────────────────── */
let searchActive = false;
let searchTimeout = null;

$("searchBtn")?.addEventListener("click", () => {
  const bar = $("searchBar");
  searchActive = !searchActive;
  bar?.classList.toggle("hidden", !searchActive);
  if (searchActive) $("searchInput")?.focus();
  else clearSearch();
});

$("closeSearch")?.addEventListener("click", () => {
  $("searchBar")?.classList.add("hidden");
  searchActive = false;
  clearSearch();
  const si = $("searchInput");
  if (si) si.value = "";
  const sc = $("searchCount");
  if (sc) sc.textContent = "";
});

$("searchInput")?.addEventListener("input", function () {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => doSearch(this.value), 300);
});

function doSearch(query) {
  const countEl = $("searchCount");
  if (!currentData || !query.trim()) {
    clearSearch();
    if (countEl) countEl.textContent = "";
    return;
  }

  const activeTab = document.querySelector(".code-tab.active")?.dataset.tab;
  if (!["html", "css", "js"].includes(activeTab)) {
    if (countEl) countEl.textContent = "search works on code tabs only";
    return;
  }

  const codeEl = $(activeTab + "Code");
  if (!codeEl) return;

  const raw =
    activeTab === "html"
      ? currentData.html
      : activeTab === "css"
        ? currentData.css
        : currentData.js;
  if (!raw) return;

  const regex = new RegExp(escapeRegex(query), "gi");
  let count = 0;

  const escaped = escapeHtml(raw);
  const highlighted = escaped.replace(regex, (m) => {
    count++;
    return `<mark class="search-highlight">${m}</mark>`;
  });

  codeEl.innerHTML = highlighted;
  if (countEl)
    countEl.textContent = count
      ? `${count} result${count !== 1 ? "s" : ""}`
      : "0 results";

  if (count) {
    const firstMark = codeEl.querySelector("mark");
    if (firstMark)
      firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
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
  const el = $(activeTab + "Code");
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
   fullscreen — make the app go fullscreen
────────────────────────────────────────────── */
$("fullscreenBtn")?.addEventListener("click", () => {
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  if (!document.fullscreenElement) shell.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
});

/* ──────────────────────────────────────────────
   profile panel — view and edit user info
────────────────────────────────────────────── */
(function initProfile() {
  const btn = document.getElementById("profileBtn");
  const panel = document.getElementById("profilePanel");
  const overlay = document.getElementById("profileOverlay");
  const closeB = document.getElementById("profileClose");
  if (!btn || !panel) return;

  let profileLoaded = false;

  async function loadProfile() {
    const token = localStorage.getItem("fetch_token");
    if (!token) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (!data.success) return;

      const u = data.user;

      const initials = (
        (u.name || u.email || "?")
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase() || "?"
      ).slice(0, 2);
      const avatarEl = document.getElementById("profileAvatar");
      if (avatarEl) {
        if (u.avatar) {
          avatarEl.innerHTML = `<img src="${u.avatar}" alt="${initials}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"><span class="profile-initials" style="display:none">${initials}</span>`;
        } else {
          avatarEl.innerHTML = `<span class="profile-initials">${initials}</span>`;
        }
      }

      const navAvatar = document.getElementById("profileBtnAvatar");
      if (navAvatar) {
        if (u.avatar) {
          navAvatar.innerHTML = `<img src="${u.avatar}" alt="${initials}" onerror="this.innerHTML='${initials}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
          navAvatar.textContent = initials;
        }
      }

      const fields = {
        profileName: u.name || "—",
        profileEmail: u.email || "—",
        profileProvider: u.provider || "local",
        profileJoined: u.createdAt
          ? new Date(u.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—",
        profileLastLogin: u.lastLogin
          ? new Date(u.lastLogin).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
        profileFetches: (u.stats?.fetches ?? "—").toString(),
        profileDeobf: (u.stats?.deobfuscations ?? "—").toString(),
      };
      Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      });

      const badge = document.getElementById("profileProviderBadge");
      if (badge) {
        badge.textContent = u.provider;
        badge.className = `profile-badge provider-${u.provider}`;
      }

      const nameInput = document.getElementById("profileNameInput");
      if (nameInput) nameInput.value = u.name || "";

      profileLoaded = true;
    } catch (e) {
      console.warn("[profile]", e.message);
    }
  }

  function openPanel() {
    panel.classList.add("open");
    overlay?.classList.add("open");
    document.body.style.overflow = "hidden";
    if (!profileLoaded) loadProfile();
  }

  function closePanel() {
    panel.classList.remove("open");
    overlay?.classList.remove("open");
    document.body.style.overflow = "";
  }

  btn.addEventListener("click", openPanel);
  closeB?.addEventListener("click", closePanel);
  overlay?.addEventListener("click", closePanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closePanel();
  });

  const saveNameBtn = document.getElementById("profileSaveName");
  saveNameBtn?.addEventListener("click", async () => {
    const nameInput = document.getElementById("profileNameInput");
    const name = nameInput?.value.trim();
    if (!name) return;
    const token = localStorage.getItem("fetch_token");
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        const stored = JSON.parse(localStorage.getItem("fetch_user") || "{}");
        stored.name = name;
        localStorage.setItem("fetch_user", JSON.stringify(stored));
        profileLoaded = false;
        loadProfile();
        showToast("name updated", "success");
      } else {
        showToast(data.error || "update failed", "error");
      }
    } catch {
      showToast("could not save", "error");
    }
  });
})();

/* ──────────────────────────────────────────────
   url input wiring — sync hero and app inputs
────────────────────────────────────────────── */
const heroFetchBtn = $("heroFetchBtn");
const heroUrlInput = $("heroUrl");
const appFetchBtn = $("appFetchBtn");
const appUrlInput = $("appUrl");

heroFetchBtn?.addEventListener("click", () => startFetch("hero"));
appFetchBtn?.addEventListener("click", () => startFetch("app"));
heroUrlInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startFetch("hero");
});
appUrlInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startFetch("app");
});

if (heroUrlInput && appUrlInput) {
  heroUrlInput.addEventListener("input", function () {
    appUrlInput.value = this.value;
  });
  appUrlInput.addEventListener("input", function () {
    heroUrlInput.value = this.value;
  });
}

/* ──────────────────────────────────────────────
   magnetic buttons — fun hover effect
────────────────────────────────────────────── */
document
  .querySelectorAll(
    ".btn-primary:not(.btn-loading), .app-fetch-btn, .deobfuscate-standalone-btn",
  )
  .forEach((btn) => {
    btn.addEventListener("mousemove", function (e) {
      if (this.disabled) return;
      const r = this.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.2;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.2;
      this.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    btn.addEventListener("mouseleave", function () {
      this.style.transition = "transform .4s cubic-bezier(.16,1,.3,1)";
      this.style.transform = "";
    });
    btn.addEventListener("mouseenter", function () {
      this.style.transition = "transform .1s ease";
    });
  });

/* ──────────────────────────────────────────────
   active nav on scroll — highlight current section
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
   keyboard shortcuts — ctrl+k focus url, ctrl+enter fetch
────────────────────────────────────────────── */
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key === "k") {
    e.preventDefault();
    $("appUrl")?.focus();
    $("demo")?.scrollIntoView({ behavior: "smooth" });
  }

  if (mod && e.key === "Enter") startFetch("app");

  if (e.key === "Escape") {
    const mm = $("mobileMenu");
    if (mm?.classList.contains("open")) {
      mm.classList.remove("open");
      $("hamburger")?.classList.remove("active");
      mm.setAttribute("aria-hidden", "true");
      mm.style.display = "none";
      document.body.style.overflow = "";
    }
    if (searchActive) $("closeSearch")?.click();
  }
});

/* ──────────────────────────────────────────────
   terminal typewriter — fake terminal animation
────────────────────────────────────────────── */
(function initTerminal() {
  const cmd = $("termCmd");
  const out = $("termOutput");
  if (!cmd || !out) return;

  const seqs = [
    {
      command: "node server.js",
      lines: [
        { text: "⚡ fetch backend running on :10000", cls: "t-green", d: 500 },
        { text: "   health: /health ✓", cls: "t-muted", d: 800 },
        { text: "", cls: "", d: 1100 },
        { text: "post /api/fetch  200  1247ms", cls: "t-cyan", d: 1600 },
        { text: "→ github.com — react 18 detected", cls: "t-muted", d: 1900 },
        { text: "→ 412 ln html · 891 ln css", cls: "t-muted", d: 2200 },
        { text: "✓ extraction complete", cls: "t-green", d: 2600 },
      ],
    },
    {
      command: 'curl /api/fetch -d \'{"url":"stripe.com"}\'',
      lines: [
        { text: "→ connecting to stripe.com…", cls: "t-muted", d: 400 },
        { text: "→ parsing 2,891 dom elements…", cls: "t-muted", d: 800 },
        { text: "→ fetching 4 stylesheets…", cls: "t-muted", d: 1200 },
        { text: "→ fetching 7 js bundles…", cls: "t-muted", d: 1600 },
        { text: "✓ framework: next.js 14", cls: "t-cyan", d: 2000 },
        { text: "✓ 1,247 ln css · 892 ln js", cls: "t-green", d: 2300 },
        { text: "✓ done in 1.87s ⚡", cls: "t-amber", d: 2600 },
      ],
    },
  ];

  let si = 0;
  let running = false;

  async function run() {
    if (running) return;
    running = true;
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
      await delay(l.d - (prev?.d || 0));

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
    out.style.transition = "opacity .5s";
    out.style.opacity = "0";
    await delay(500);
    out.style.opacity = "1";
    running = false;
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
  else run();
})();

/* ──────────────────────────────────────────────
   legal modal — privacy policy, terms of use
────────────────────────────────────────────── */
const LEGAL_CONTENT = {
  privacy: {
    tag: "// privacy",
    title: "privacy policy",
    date: "last updated: march 2026",
    html: `<div class="legal-highlight">tl;dr — fetch does not collect, sell, or store any personal data. everything stays on your device.</div>
<h3>what we collect</h3><p>fetch collects <strong>nothing</strong>. no accounts, no cookies, no tracking.</p>
<p>the only data stored is your theme preference and last 10 fetched urls — both in <code>localstorage</code> and never sent anywhere.</p>
<h3>urls you fetch</h3><p>urls are sent to the fetch backend solely to scrape on your behalf. we do not log or store them.</p>
<h3>third-party services</h3><ul><li><strong>render.com</strong> — backend hosting.</li><li><strong>google fonts</strong> — typography.</li><li><strong>cloudflare cdn</strong> — fa icons, highlight.js, jszip.</li></ul>
<h3>contact</h3><p>questions? <a href="https://github.com/Officialay12" target="_blank">github</a> or <a href="https://x.com/sung_tech" target="_blank">x/twitter</a>.</p>`,
  },
  terms: {
    tag: "// terms",
    title: "terms of use",
    date: "last updated: march 2026",
    html: `<div class="legal-highlight">tl;dr — use fetch responsibly. don't scrape sites without permission. extracted code belongs to its original authors.</div>
<h3>acceptance</h3><p>by using fetch you agree to these terms.</p>
<h3>permitted use</h3><p>inspecting public sites for educational purposes, auditing your own sites, studying front-end techniques.</p>
<h3>prohibited use</h3><p>violating a site's tos, harvesting personal data, reproducing copyrighted content without permission, or ddos attacks.</p>
<h3>rate limits</h3><p>the api enforces 120 req/min globally and 30 fetch req/min per ip.</p>
<h3>no warranty</h3><p>fetch is provided "as is" without warranties of any kind.</p>
<h3>contact</h3><p><a href="https://github.com/Officialay12" target="_blank">github</a> or <a href="https://x.com/sung_tech" target="_blank">x/twitter</a>.</p>`,
  },
};

(function initLegalModal() {
  const backdrop = $("legalBackdrop");
  const tag = $("legalModalTag");
  const title = $("legalModalTitle");
  const date = $("legalModalDate");
  const body = $("legalModalBody");
  const closeX = $("legalModalClose");
  const closeBtn = $("legalModalCloseBtn");
  if (!backdrop) return;

  function openModal(doc) {
    const content = LEGAL_CONTENT[doc];
    if (!content) return;
    if (tag) tag.textContent = content.tag;
    if (title) title.textContent = content.title;
    if (date) date.textContent = content.date;
    if (body) {
      body.innerHTML = content.html;
      body.scrollTop = 0;
    }
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.querySelectorAll(".legal-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openModal(link.dataset.doc);
    });
  });

  closeX?.addEventListener("click", closeModal);
  closeBtn?.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && backdrop.classList.contains("open")) closeModal();
  });
})();

/* ──────────────────────────────────────────────
   console signature — just for fun
────────────────────────────────────────────── */
console.log(
  "%c[fetch v2.0.0] by ayocodes ⚡%c\nbackend: %s\nctrl+k = focus url | ctrl+enter = fetch",
  "background:#00e5ff;color:#030507;font-weight:900;font-size:13px;padding:5px 10px;border-radius:5px;",
  "color:#7aa3b5;font-size:11px;",
  BACKEND_URL,
);
