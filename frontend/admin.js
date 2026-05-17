"use strict";

/* ══════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════ */
const BACKEND =
  window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "https://fetch-v2-cww1.onrender.com";

const PAGE_SIZE = 20;

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
let adminToken = null;
let allUsers = [];
let allFetches = [];
let allDeobf = [];
let filteredUsers = [];
let logLines = [];
let logPaused = false;
let refreshTimer = null;
let refreshInProgress = false;
let usersPage = 1;

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */
function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relTime(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

function fmtUptime(s) {
  s = Math.floor(s);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

/* ══════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════ */
function toast(msg, type = "info") {
  const wrap = $("toastWrap");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = `toastx ${type}`;
  const icons = { ok: "✓", err: "✕", info: "◈", warn: "⚠" };
  const color =
    type === "ok"
      ? "lime"
      : type === "err"
        ? "red"
        : type === "warn"
          ? "amber"
          : "cyan";
  t.innerHTML = `<span style="color:var(--${color})">${icons[type] || "•"}</span>${esc(msg)}`;
  wrap.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 3500);
}

/* ══════════════════════════════════════════════════
   ACTIVITY LOG
══════════════════════════════════════════════════ */
function addLog(type, source, msg) {
  const now = new Date().toLocaleTimeString();
  logLines.unshift({ time: now, type, source, msg });
  if (logLines.length > 300) logLines.pop();
  if (logPaused) return;

  const typeMap = { ok: "ok", err: "error", warn: "warn", info: "info" };
  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML =
    `<span class="log-time">${now}</span>` +
    `<span class="badge ${typeMap[type] || "warn"}">${esc(source)}</span>` +
    `<span class="log-msg">${esc(msg)}</span>`;

  const lf = $("liveFeed");
  if (lf) {
    if (lf.childElementCount > 40) lf.removeChild(lf.lastChild);
    lf.insertBefore(line.cloneNode(true), lf.firstChild);
  }
  const af = $("activityFeed");
  if (af) af.insertBefore(line.cloneNode(true), af.firstChild);
}

/* ══════════════════════════════════════════════════
   PROGRESS BAR
══════════════════════════════════════════════════ */
function showRbar() {
  const b = $("rbar");
  if (!b) return;
  b.style.width = "0";
  b.style.transition = "none";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      b.style.transition = "width 1.2s ease";
      b.style.width = "100%";
    }),
  );
  setTimeout(() => {
    b.style.transition = "width .25s ease";
    b.style.width = "0";
  }, 1500);
}

/* ══════════════════════════════════════════════════
   API FETCH
══════════════════════════════════════════════════ */
async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (adminToken) headers["Authorization"] = "Bearer " + adminToken;

  const res = await fetch(BACKEND + path, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    toast("Session expired — please log in again.", "err");
    adminLogout();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ══════════════════════════════════════════════════
   AUTHENTICATION
══════════════════════════════════════════════════ */
async function attemptUnlock() {
  const username = $("lockUser")?.value.trim();
  const password = $("lockPass")?.value;
  const errEl = $("lockError");
  const coldEl = $("lockCold");
  const coldMsg = $("lockColdMsg");
  const btn = $("lockBtn");

  if (!username || !password) {
    if (errEl) errEl.textContent = "Enter both username and password";
    return;
  }

  if (btn) {
    btn.classList.add("loading");
    btn.disabled = true;
  }
  if (errEl) errEl.textContent = "";
  if (coldEl) {
    coldEl.classList.remove("loading");
    coldMsg.textContent = "";
  }

  // Show cold-start hint after 5 s
  const coldTimer = setTimeout(() => {
    if (coldEl && coldMsg) {
      coldEl.classList.add("loading");
      coldMsg.textContent = "Backend waking up — please wait…";
    }
  }, 5000);

  try {
    const response = await fetch(`${BACKEND}/api/admin/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    clearTimeout(coldTimer);
    if (coldEl) {
      coldEl.classList.remove("loading");
      coldMsg.textContent = "";
    }

    const data = await response.json();
    if (data.success) {
      adminToken = data.token;
      localStorage.setItem("fetch_admin_token", adminToken);

      const ls = $("lockScreen");
      ls.style.transition = "opacity .4s ease";
      ls.style.opacity = "0";
      setTimeout(() => {
        ls.style.display = "none";
        $("app").classList.add("visible");
        initAdmin();
        toast("Admin access granted", "ok");
      }, 420);
    } else {
      throw new Error(data.error || "Invalid credentials");
    }
  } catch (err) {
    clearTimeout(coldTimer);
    if (coldEl) {
      coldEl.classList.remove("loading");
      coldMsg.textContent = "";
    }

    if (errEl) {
      errEl.textContent = err.message.includes("fetch")
        ? "Cannot reach backend — it may be cold-starting. Retry in 30 s."
        : "Error: " + err.message;
    }
    if (btn) {
      btn.classList.remove("loading");
      btn.disabled = false;
      btn.style.background = "var(--red)";
      setTimeout(() => {
        btn.style.background = "";
        if (errEl) errEl.textContent = "";
      }, 3000);
    }
  }
}

async function checkAdminSession() {
  const saved = localStorage.getItem("fetch_admin_token");
  if (!saved) return false;
  adminToken = saved;
  try {
    await fetch(BACKEND + "/health"); // wake the server
    await apiFetch("/api/admin/stats"); // verify token
    $("lockScreen").style.display = "none";
    $("app").classList.add("visible");
    initAdmin();
    toast("Welcome back, Admin", "ok");
    return true;
  } catch {
    localStorage.removeItem("fetch_admin_token");
    adminToken = null;
    return false;
  }
}

/* ══════════════════════════════════════════════════
   DATA LOADERS
══════════════════════════════════════════════════ */
async function loadOverview() {
  try {
    const data = await apiFetch("/api/admin/stats");
    if (!data.success) return;

    const f = (id, val) => {
      const el = $(id);
      if (el) el.textContent = val;
    };
    f("s-totalUsers", data.totalUsers || 0);
    f("s-totalFetches", data.totalFetches || 0);
    f("s-totalDeobf", data.totalDeobf || 0);
    f("s-active30", data.active30 || 0);
    f("s-googleUsers", data.googleUsers || 0);

    if (data.newToday) {
      const d = $("s-newToday");
      if (d) d.textContent = "+" + data.newToday + " today";
    }
    if (data.fetchesByDay) renderFetchChart(data.fetchesByDay);
    if (data.providerCounts) renderProviderPie(data.providerCounts);
    if (data.recentUsers) renderRecentUsers(data.recentUsers);

    addLog(
      "ok",
      "STATS",
      `Users:${data.totalUsers} Active:${data.active30} Fetches:${data.totalFetches}`,
    );
  } catch (e) {
    addLog("warn", "STATS", "Failed: " + e.message);
  }
}

async function loadHealth() {
  try {
    const h = await fetch(BACKEND + "/health").then((r) => r.json());
    const f = (id, val) => {
      const el = $(id);
      if (el) el.textContent = val;
    };
    f("h-status", h.status || "—");
    f("h-version", h.version || "—");
    f("h-uptime", fmtUptime(h.uptime || 0));
    f("h-db", h.db || "—");
    f("s-uptime", fmtUptime(h.uptime || 0));

    const raw = $("healthRaw");
    if (raw) raw.textContent = JSON.stringify(h, null, 2);

    const tiers = h.tiers || {};
    const tb = $("tiersTable");
    if (tb)
      tb.innerHTML = `
      <tr>
        <td><span class="badge ${tiers.tier1_axios ? "ok" : "offline"}">T1</span></td>
        <td>Axios HTTP</td>
        <td>${tiers.tier1_axios ? "active" : "inactive"}</td>
        <td>Primary engine</td>
      </tr>
      <tr>
        <td><span class="badge ${tiers.tier2_cloudflare_scraper ? "ok" : "offline"}">T2</span></td>
        <td>Cloudflare Scraper</td>
        <td>${tiers.tier2_cloudflare_scraper ? "active" : "inactive"}</td>
        <td>Bypass Cloudflare</td>
      </tr>
      <tr>
        <td><span class="badge ${tiers.tier3_puppeteer_stealth ? "ok" : "offline"}">T3</span></td>
        <td>Puppeteer Stealth</td>
        <td>${tiers.tier3_puppeteer_stealth ? "active" : "inactive"}</td>
        <td>Headless Chrome</td>
      </tr>`;

    addLog(
      "ok",
      "HEALTH",
      `Online · DB:${h.db} · Up:${fmtUptime(h.uptime || 0)}`,
    );
  } catch {
    const el = $("h-status");
    if (el) el.textContent = "OFFLINE";
    addLog("err", "HEALTH", "Unreachable");
  }
}

async function loadUsers() {
  try {
    const data = await apiFetch("/api/admin/users");
    if (!data.success) return;
    allUsers = data.users || [];

    const badge = $("usersBadge");
    if (badge) badge.textContent = allUsers.length;
    const title = $("usersTableTitle");
    if (title) title.textContent = `Users (${allUsers.length})`;

    filteredUsers = [...allUsers];
    renderUserPage(filteredUsers, 1);
    addLog("ok", "USERS", "Loaded " + allUsers.length + " users");
  } catch (e) {
    const b = $("usersTableBody");
    if (b)
      b.innerHTML = `<tr class="empty-row"><td colspan="7">Error: ${esc(e.message)}</td></tr>`;
    addLog("err", "USERS", e.message);
  }
}

async function loadFetches() {
  try {
    const data = await apiFetch("/api/admin/fetches");
    if (!data.success) return;
    allFetches = data.fetches || [];
    const s = data.stats || {};
    const f = (id, val) => {
      const el = $(id);
      if (el) el.textContent = val;
    };
    f("f-total", s.total || 0);
    f("f-success", s.success || 0);
    f("f-failed", s.failed || 0);
    f("f-avg", Math.round(s.avgDuration || 0) + "ms");
    renderFetchesTable(allFetches);
  } catch (e) {
    const b = $("fetchesTableBody");
    if (b)
      b.innerHTML = `<tr class="empty-row"><td colspan="6">Error: ${esc(e.message)}</td></tr>`;
  }
}

async function loadDeobf() {
  try {
    const data = await apiFetch("/api/admin/deobfuscations");
    if (!data.success) return;
    allDeobf = data.deobfuscations || [];
    const s = data.stats || {};
    const f = (id, val) => {
      const el = $(id);
      if (el) el.textContent = val;
    };
    f("d-total", s.total || 0);
    f("d-success", s.success || 0);
    f("d-failed", s.failed || 0);
    f("d-users", s.uniqueUsers || 0);
    renderDeobfTable(allDeobf);
  } catch (e) {
    const b = $("deobfTableBody");
    if (b)
      b.innerHTML = `<tr class="empty-row"><td colspan="5">Error: ${esc(e.message)}</td></tr>`;
  }
}

/* ══════════════════════════════════════════════════
   RENDERERS
══════════════════════════════════════════════════ */
function renderFetchChart(days) {
  const wrap = $("fetchChart");
  if (!wrap) return;
  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((s, d) => s + d.count, 0);
  const tc = $("chartTotal");
  if (tc) tc.textContent = total + " total";
  const H = 160;
  wrap.innerHTML = days
    .map(
      (d) => `
    <div class="bar-wrap">
      <div class="bar-inner">
        <div class="bar" style="height:${d.count ? Math.max(Math.round((d.count / max) * H), 4) : 2}px;
          background:linear-gradient(to top,var(--cyan),rgba(0,229,255,.35))">
          <span class="bar-val">${d.count}</span>
        </div>
      </div>
      <span class="bar-label">${esc(d.label)}</span>
    </div>`,
    )
    .join("");
}

function renderProviderPie(counts) {
  const wrap = $("providerPie");
  if (!wrap) return;
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const colors = { local: "#b388ff", google: "#00e5ff", both: "#aaff00" };
  const labels = { local: "Local", google: "Google", both: "Both" };
  wrap.innerHTML = `
    <div class="pie-legend">
      ${Object.entries(counts)
        .map(
          ([k, v]) => `
        <div class="pie-item">
          <div class="pie-dot" style="background:${colors[k] || "#fff"}"></div>
          <span>${labels[k] || k} — ${v} (${Math.round((v / total) * 100)}%)</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

function renderRecentUsers(users) {
  const tbody = $("recentUsersBody");
  if (!tbody) return;
  tbody.innerHTML = users
    .slice(0, 8)
    .map(
      (u) => `
    <tr>
      <td>${esc(u.name || "—")}</td>
      <td class="email-cell">${esc(u.email)}</td>
      <td><span class="badge ${esc(u.provider)}">${esc(u.provider)}</span></td>
      <td>${u.createdAt ? relTime(u.createdAt) : "—"}</td>
    </tr>`,
    )
    .join("");
}

function renderUserPage(list, pg) {
  usersPage = pg;
  const start = (pg - 1) * PAGE_SIZE;
  const slice = list.slice(start, start + PAGE_SIZE);
  const total = Math.ceil(list.length / PAGE_SIZE) || 1;

  const pi = $("usersPagInfo");
  if (pi) pi.textContent = `${list.length} users · page ${pg}/${total}`;

  const tbody = $("usersTableBody");
  if (!slice.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="7">No users match your filter.</td></tr>';
    return;
  }
  tbody.innerHTML = slice
    .map(
      (u, i) => `
    <tr>
      <td style="color:var(--muted)">${start + i + 1}</td>
      <td>${esc(u.name || "—")}</td>
      <td class="email-cell">${esc(u.email)}</td>
      <td><span class="badge ${esc(u.provider)}">${esc(u.provider)}</span></td>
      <td>${u.lastLogin ? relTime(u.lastLogin) : "—"}</td>
      <td>${u.createdAt ? fmtDate(u.createdAt) : "—"}</td>
      <td><button class="act-btn" onclick="openUserModal(${JSON.stringify(JSON.stringify(u))})">view</button></td>
    </tr>`,
    )
    .join("");

  const btns = $("usersPagBtns");
  if (!btns) return;
  btns.innerHTML = "";
  for (let p = 1; p <= Math.min(total, 10); p++) {
    const b = document.createElement("button");
    b.className = "pg-btn" + (p === pg ? " active" : "");
    b.textContent = p;
    b.onclick = () => renderUserPage(list, p);
    btns.appendChild(b);
  }
}

function renderFetchesTable(list) {
  const tbody = $("fetchesTableBody");
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="6">No records found.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .slice(0, 200)
    .map(
      (f) => `
    <tr>
      <td>${f.createdAt ? relTime(f.createdAt) : "—"}</td>
      <td class="email-cell">${esc(f.userEmail || "—")}</td>
      <td class="url-cell" title="${esc(f.url || "")}">${esc(f.url || "—")}</td>
      <td><span class="badge ${f.success ? "ok" : "error"}">${f.success ? "ok" : "fail"}</span></td>
      <td>${f.tierUsed ? "T" + f.tierUsed : "—"}</td>
      <td>${f.durationMs ? f.durationMs + "ms" : "—"}</td>
    </tr>`,
    )
    .join("");
}

function renderDeobfTable(list) {
  const tbody = $("deobfTableBody");
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="5">No records found.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .slice(0, 200)
    .map(
      (d) => `
    <tr>
      <td>${d.createdAt ? relTime(d.createdAt) : "—"}</td>
      <td class="email-cell">${esc(d.userEmail || "—")}</td>
      <td>${d.inputLength ? d.inputLength.toLocaleString() + " ch" : "—"}</td>
      <td><span class="badge ${d.success ? "ok" : "error"}">${d.success ? "ok" : "fail"}</span></td>
      <td>${esc(d.model || "—")}</td>
    </tr>`,
    )
    .join("");
}

/* ══════════════════════════════════════════════════
   FILTERS
══════════════════════════════════════════════════ */
function filterUsers() {
  const q = ($("userSearch")?.value || "").toLowerCase();
  const pf = $("providerFilter")?.value || "";
  filteredUsers = allUsers.filter(
    (u) =>
      (!q ||
        u.email.toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q)) &&
      (!pf || u.provider === pf),
  );
  renderUserPage(filteredUsers, 1);
}

function filterFetches() {
  const q = ($("fetchSearch")?.value || "").toLowerCase();
  renderFetchesTable(
    allFetches.filter(
      (f) =>
        !q ||
        (f.url || "").toLowerCase().includes(q) ||
        (f.userEmail || "").toLowerCase().includes(q),
    ),
  );
}

/* ══════════════════════════════════════════════════
   USER MODAL
══════════════════════════════════════════════════ */
function openUserModal(jsonStr) {
  const u = JSON.parse(jsonStr);
  const initials = (
    (u.name || u.email || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  ).slice(0, 2);

  $("modalBody").innerHTML = `
    <div class="detail-row">
      <div class="user-avatar">
        ${u.avatar ? `<img src="${esc(u.avatar)}" onerror="this.style.display='none'">` : ""}
        ${initials}
      </div>
      <div>
        <div style="font-weight:600;font-size:1rem">${esc(u.name || "—")}</div>
        <div style="color:var(--text2);font-size:.78rem">${esc(u.email)}</div>
        <span class="badge ${esc(u.provider)}">${esc(u.provider)}</span>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-key">User ID</div>
        <div class="detail-val">${esc(u._id || u.id || "—")}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Google ID</div>
        <div class="detail-val">${esc(u.googleId || "—")}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Joined</div>
        <div class="detail-val">${u.createdAt ? fmtDate(u.createdAt) : "—"}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Last Login</div>
        <div class="detail-val">${u.lastLogin ? fmtDate(u.lastLogin) : "—"}</div>
      </div>
    </div>`;

  $("userModal").classList.add("open");
}

function closeModal() {
  $("userModal").classList.remove("open");
}

/* ══════════════════════════════════════════════════
   MAIN ACTIONS
══════════════════════════════════════════════════ */
async function refreshAll() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  showRbar();
  const btn = $("refreshBtn");
  if (btn) btn.disabled = true;

  try {
    await Promise.all([loadOverview(), loadHealth()]);
    const activePage = document
      .querySelector(".page.active")
      ?.id?.replace("page-", "");
    if (activePage === "users") await loadUsers();
    else if (activePage === "fetches") await loadFetches();
    else if (activePage === "deobf") await loadDeobf();
  } finally {
    refreshInProgress = false;
    if (btn) btn.disabled = false;
  }
}

function updateClock() {
  const el = $("topbarTime");
  if (el) el.textContent = new Date().toLocaleTimeString();
}

function togglePause() {
  logPaused = !logPaused;
  const btn = $("pauseBtn");
  if (btn) btn.innerHTML = logPaused ? "▶ Resume" : "⏸ Pause";
  toast(logPaused ? "Log paused" : "Log resumed", "info");
}

function clearLog() {
  logLines = [];
  const lf = $("liveFeed");
  if (lf)
    lf.innerHTML =
      '<div class="log-line"><span class="log-time">—</span>' +
      '<span class="badge info">cleared</span>' +
      '<span class="log-msg">Log cleared</span></div>';
  const af = $("activityFeed");
  if (af) af.innerHTML = "";
  toast("Log cleared", "info");
}

function exportData() {
  const btn = $("exportBtn");
  if (btn) btn.disabled = true;
  try {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            users: allUsers,
            fetches: allFetches,
            deobf: allDeobf,
            log: logLines.slice(0, 100),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fetch-admin-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast("Export downloaded", "ok");
  } finally {
    setTimeout(() => {
      if (btn) btn.disabled = false;
    }, 1000);
  }
}

function adminLogout() {
  if (refreshTimer) clearInterval(refreshTimer);
  localStorage.removeItem("fetch_admin_token");
  $("app").classList.remove("visible");
  $("lockScreen").style.display = "flex";
  $("lockScreen").style.opacity = "1";
  $("lockPass").value = "";
  adminToken = null;
  allUsers = [];
  allFetches = [];
  allDeobf = [];
  logLines = [];
  refreshInProgress = false;
  toast("Logged out", "info");
}

function showPage(pageName, btn) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  const page = $("page-" + pageName);
  if (page) page.classList.add("active");
  if (btn) btn.classList.add("active");

  if (pageName === "users") loadUsers();
  else if (pageName === "fetches") loadFetches();
  else if (pageName === "deobf") loadDeobf();
  else if (pageName === "health") loadHealth();
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
function initAdmin() {
  updateClock();
  setInterval(updateClock, 1000);
  addLog(
    "ok",
    "ADMIN",
    "Console initialized — " + new Date().toLocaleTimeString(),
  );
  addLog("info", "SYSTEM", "Backend: " + BACKEND);
  refreshAll();
  refreshTimer = setInterval(() => {
    if (!refreshInProgress) refreshAll();
  }, 30000);
}

/* ══════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  $("lockBtn")?.addEventListener("click", attemptUnlock);
  $("lockPass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptUnlock();
  });
  $("lockUser")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("lockPass").focus();
  });

  $("refreshBtn")?.addEventListener("click", refreshAll);
  $("exportBtn")?.addEventListener("click", exportData);
  $("logoutBtn")?.addEventListener("click", adminLogout);
  $("refreshUsersBtn")?.addEventListener("click", loadUsers);
  $("pingHealthBtn")?.addEventListener("click", loadHealth);
  $("pauseBtn")?.addEventListener("click", togglePause);
  $("clearLogBtn")?.addEventListener("click", clearLog);

  $("userSearch")?.addEventListener("input", filterUsers);
  $("providerFilter")?.addEventListener("change", filterUsers);
  $("fetchSearch")?.addEventListener("input", filterFetches);

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.page, btn));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Expose modal functions globally (called from inline onclick attrs in dynamic HTML)
  window.openUserModal = openUserModal;
  window.closeModal = closeModal;

  checkAdminSession();
  console.log(
    "%c[FETCH Admin v2.0.0] — Console Ready",
    "color:#00e5ff;font-size:12px;font-weight:bold;",
  );
});
