"use strict";

/* ══════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════ */
const BACKEND_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "https://fetch-v2-cww1.onrender.com";

let GOOGLE_CLIENT_ID = null;
let googleReady = false;
let coldStartDetected = false;

/* ══════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════ */
function $(id) {
  return document.getElementById(id);
}

function showToast(msg, type = "info", duration = 3500) {
  const t = $("toast");
  if (!t) return;
  const icons = {
    success: "fa-check-circle",
    error: "fa-circle-xmark",
    info: "fa-circle-info",
  };
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i><span>${msg}</span>`;
  t.className = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), duration);
}

function setLoading(btnId, on) {
  const btn = $(btnId);
  if (!btn) return;
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

function showAlert(alertId, msgId, msg, type = "error") {
  const el = $(alertId);
  const msgEl = $(msgId);
  if (!el || !msgEl) return;
  el.className = `form-alert ${type} show`;
  msgEl.textContent = msg;
}

function hideAlert(alertId) {
  const el = $(alertId);
  if (el) el.classList.remove("show");
}

function shake(el) {
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth; // reflow
  el.classList.add("shake");
  el.addEventListener("animationend", () => el.classList.remove("shake"), {
    once: true,
  });
}

function validateEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());
}

function saveAuthData(token, user) {
  localStorage.setItem("fetch_token", token);
  localStorage.setItem("fetch_user", JSON.stringify(user));
}

/* ══════════════════════════════════════════════════
   FETCH WITH TIMEOUT
══════════════════════════════════════════════════ */
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

/* ══════════════════════════════════════════════════
   COLD-START DETECTION
══════════════════════════════════════════════════ */
async function checkBackendHealth() {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/health`, {}, 5000);
    if (res.ok) return; // fast — all good
  } catch (_) {
    // timed out or network error — likely cold-starting
  }

  // Show cold-start banners
  coldStartDetected = true;
  ["coldBannerLogin", "coldBannerRegister"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add("show");
  });

  // Poll until backend wakes up
  const poll = setInterval(async () => {
    try {
      const r = await fetchWithTimeout(`${BACKEND_URL}/health`, {}, 6000);
      if (r.ok) {
        clearInterval(poll);
        ["coldBannerLogin", "coldBannerRegister"].forEach((id) => {
          const el = $(id);
          if (el) el.classList.remove("show");
        });
        coldStartDetected = false;
        showToast("Backend is ready!", "success");
        loadConfig();
      }
    } catch (_) {}
  }, 5000);
}

/* ══════════════════════════════════════════════════
   AUTH GUARD
══════════════════════════════════════════════════ */
(async function authGuard() {
  const token = localStorage.getItem("fetch_token");
  if (!token) return;
  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/api/auth/verify`,
      { headers: { Authorization: "Bearer " + token } },
      8000,
    );
    const d = await res.json();
    if (d.success) {
      window.location.replace("/");
    } else {
      localStorage.removeItem("fetch_token");
      localStorage.removeItem("fetch_user");
    }
  } catch (_) {
    // Backend not reachable — stay on auth page, keep token
  }
})();

/* ══════════════════════════════════════════════════
   CONFIG — fetch Google Client ID
══════════════════════════════════════════════════ */
async function loadConfig() {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/api/config`, {}, 8000);
    if (!res.ok) return;
    const data = await res.json();
    if (data.googleClientId) {
      GOOGLE_CLIENT_ID = data.googleClientId;
      initGoogleAuth();
    } else {
      disableGoogleBtns("Google auth not configured");
    }
  } catch (e) {
    console.warn("[config] fetch failed:", e.message);
    disableGoogleBtns("Backend offline");
  }
}

function disableGoogleBtns(reason) {
  document.querySelectorAll(".google-btn").forEach((btn) => {
    btn.disabled = true;
    btn.title = reason;
    const textEl = btn.querySelector("span[id]");
    if (textEl) textEl.textContent = "Google unavailable";
  });
}

/* ══════════════════════════════════════════════════
   TABS
══════════════════════════════════════════════════ */
function switchTab(which) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const active = b.id === "tab-" + which;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".form-panel").forEach((p) => {
    p.classList.toggle("active", p.id === "panel-" + which);
  });
  hideAlert("loginAlert");
  hideAlert("registerAlert");
}

// Expose globally for footer switch buttons
window.switchTab = switchTab;

/* ══════════════════════════════════════════════════
   PASSWORD TOGGLE
══════════════════════════════════════════════════ */
function initPwToggle(inputId, btnId) {
  const input = $(inputId);
  const btn = $(btnId);
  if (!input || !btn) return;
  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.querySelector("i").className = show
      ? "fa-solid fa-eye-slash"
      : "fa-solid fa-eye";
  });
}

/* ══════════════════════════════════════════════════
   PASSWORD STRENGTH
══════════════════════════════════════════════════ */
function initStrengthMeter(inputId) {
  const input = $(inputId);
  if (!input) return;
  input.addEventListener("input", function () {
    const val = this.value;
    const wrap = $("strengthWrap");
    const fill = $("strengthFill");
    const label = $("strengthLabel");
    if (!wrap || !fill || !label) return;

    if (!val) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "block";

    let score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const levels = [
      { w: "20%", bg: "var(--red)", text: "Weak" },
      { w: "40%", bg: "var(--amber)", text: "Fair" },
      { w: "60%", bg: "var(--amber)", text: "Good" },
      { w: "80%", bg: "var(--cyan)", text: "Strong" },
      { w: "100%", bg: "var(--lime)", text: "Excellent" },
    ];
    const lvl = levels[Math.min(score, 4)];
    fill.style.width = lvl.w;
    fill.style.background = lvl.bg;
    label.style.color = lvl.bg;
    label.textContent = lvl.text;
  });
}

/* ══════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════ */
function initLoginForm() {
  const form = $("loginForm");
  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = $("loginEmail")?.value.trim();
    const password = $("loginPassword")?.value;
    hideAlert("loginAlert");
    let valid = true;

    if (!validateEmail(email)) {
      $("loginEmailErr")?.classList.add("show");
      $("loginEmailWrap")?.classList.add("error");
      valid = false;
    } else {
      $("loginEmailErr")?.classList.remove("show");
      $("loginEmailWrap")?.classList.remove("error");
    }

    if (!password) {
      $("loginPwErr")?.classList.add("show");
      $("loginPwWrap")?.classList.add("error");
      valid = false;
    } else {
      $("loginPwErr")?.classList.remove("show");
      $("loginPwWrap")?.classList.remove("error");
    }

    if (!valid) {
      shake(form);
      return;
    }

    setLoading("loginBtn", true);
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
        30000,
      );
      const data = await res.json();
      if (data.success) {
        saveAuthData(data.token, data.user);
        showToast(
          "Welcome back, " + (data.user?.name || email.split("@")[0]) + " ⚡",
          "success",
        );
        setTimeout(() => window.location.replace("/"), 800);
      } else {
        showAlert(
          "loginAlert",
          "loginAlertMsg",
          data.error || "Login failed. Check your credentials.",
          "error",
        );
        shake(form);
      }
    } catch (err) {
      const msg =
        err.name === "AbortError"
          ? "Request timed out. Backend may be cold-starting — wait 30 s and retry."
          : "Cannot reach server. Check your connection.";
      showAlert("loginAlert", "loginAlertMsg", msg, "error");
    } finally {
      setLoading("loginBtn", false);
    }
  });
}

/* ══════════════════════════════════════════════════
   REGISTER
══════════════════════════════════════════════════ */
function initRegisterForm() {
  const form = $("registerForm");
  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = $("registerName")?.value.trim();
    const email = $("registerEmail")?.value.trim();
    const password = $("registerPassword")?.value;
    hideAlert("registerAlert");
    let valid = true;

    if (!validateEmail(email)) {
      $("registerEmailErr")?.classList.add("show");
      $("registerEmailWrap")?.classList.add("error");
      valid = false;
    } else {
      $("registerEmailErr")?.classList.remove("show");
      $("registerEmailWrap")?.classList.remove("error");
    }

    if (!password || password.length < 6) {
      $("registerPwErr")?.classList.add("show");
      $("registerPwWrap")?.classList.add("error");
      valid = false;
    } else {
      $("registerPwErr")?.classList.remove("show");
      $("registerPwWrap")?.classList.remove("error");
    }

    if (!valid) {
      shake(form);
      return;
    }

    setLoading("registerBtn", true);
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: name || undefined }),
        },
        30000,
      );
      const data = await res.json();
      if (data.success) {
        saveAuthData(data.token, data.user);
        showToast("Account created! Welcome to FETCH ⚡", "success");
        setTimeout(() => window.location.replace("/"), 800);
      } else {
        showAlert(
          "registerAlert",
          "registerAlertMsg",
          data.error || "Registration failed.",
          "error",
        );
        shake(form);
      }
    } catch (err) {
      const msg =
        err.name === "AbortError"
          ? "Request timed out. Backend may be cold-starting — wait 30 s and retry."
          : "Cannot reach server.";
      showAlert("registerAlert", "registerAlertMsg", msg, "error");
    } finally {
      setLoading("registerBtn", false);
    }
  });
}

/* ══════════════════════════════════════════════════
   GOOGLE AUTH
══════════════════════════════════════════════════ */
function initGoogleAuth() {
  if (!GOOGLE_CLIENT_ID) return;
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.onload = () => {
    if (!window.google?.accounts) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup",
    });
    googleReady = true;
  };
  script.onerror = () => {
    console.warn("[google] Failed to load GIS script");
    disableGoogleBtns("Google unavailable");
  };
  document.head.appendChild(script);
}

async function handleGoogleCredential(response) {
  if (!response?.credential) {
    showToast("Google sign-in failed — no credential received.", "error");
    return;
  }

  document.querySelectorAll(".google-btn").forEach((btn) => {
    btn.disabled = true;
    const s = btn.querySelector("span[id]");
    if (s) s.textContent = "Authenticating…";
  });

  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/api/auth/google`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      },
      20000,
    );
    const data = await res.json();
    if (data.success) {
      saveAuthData(data.token, data.user);
      showToast("Welcome, " + (data.user?.name || "there") + " ⚡", "success");
      setTimeout(() => window.location.replace("/"), 800);
    } else {
      throw new Error(data.error || "Google auth failed.");
    }
  } catch (err) {
    showToast(err.message, "error");
    document.querySelectorAll(".google-btn").forEach((btn) => {
      btn.disabled = false;
      const s = btn.querySelector("span[id]");
      if (s) s.textContent = "Continue with Google";
    });
  }
}

function triggerGoogleSignIn() {
  if (!googleReady || !window.google?.accounts?.id) {
    showToast("Google sign-in is still loading. Please wait a moment.", "info");
    return;
  }
  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      // One Tap suppressed — render button popup instead
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;top:80px;right:20px;z-index:9999;";
      document.body.appendChild(container);
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "sign_in_with",
      });
      setTimeout(() => {
        if (container.parentNode) document.body.removeChild(container);
      }, 15000);
      showToast("Google sign-in popup opened →", "info");
    }
  });
}

/* ══════════════════════════════════════════════════
   CANVAS PARTICLES
══════════════════════════════════════════════════ */
function initParticles() {
  const canvas = $("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W,
    H,
    rafId,
    active = true;
  const pts = [];
  const COLORS = ["rgba(0,229,255,", "rgba(170,255,0,", "rgba(255,183,0,"];

  function resize() {
    W = canvas.width = innerWidth;
    H = canvas.height = innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  for (let i = 0; i < 50; i++) {
    pts.push({
      x: Math.random() * 1000,
      y: Math.random() * 800,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.2 + 0.4,
      a: Math.random() * 0.4 + 0.1,
      c: COLORS[i % 3],
    });
  }

  function loop() {
    if (!active) return;
    ctx.clearRect(0, 0, W, H);
    pts.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c + p.a + ")";
      ctx.fill();
    });
    rafId = requestAnimationFrame(loop);
  }
  loop();
  window.addEventListener("beforeunload", () => {
    active = false;
    cancelAnimationFrame(rafId);
  });
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  $("tab-login")?.addEventListener("click", () => switchTab("login"));
  $("tab-register")?.addEventListener("click", () => switchTab("register"));

  // Check URL param
  if (new URLSearchParams(window.location.search).get("tab") === "register") {
    switchTab("register");
  }

  // Google buttons
  $("googleLoginBtn")?.addEventListener("click", triggerGoogleSignIn);
  $("googleRegisterBtn")?.addEventListener("click", triggerGoogleSignIn);

  // Password toggles
  initPwToggle("loginPassword", "loginPwToggle");
  initPwToggle("registerPassword", "registerPwToggle");

  // Strength meter
  initStrengthMeter("registerPassword");

  // Forms
  initLoginForm();
  initRegisterForm();

  // Background
  initParticles();

  // Backend
  checkBackendHealth();
  loadConfig();
});
