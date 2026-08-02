/* ══════════════════════════════════════════════════════════════════
   FETCH — pwa.js
   Registers the service worker, listens for updates, and captures the
   install prompt. Include this on every page (index/auth/admin).
═══════════════════════════════════════════════════════════════════ */

(function () {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Check for an updated service worker once on load, and periodically
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // A new version is ready — show a lightweight update toast
              showUpdateToast(reg);
            }
          });
        });
      })
      .catch((err) => console.warn("[SW] registration failed:", err));

    // Reload once the new SW takes control (after user accepts update)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });

  function showUpdateToast(reg) {
    if (document.getElementById("fetch-update-toast")) return;
    const el = document.createElement("div");
    el.id = "fetch-update-toast";
    el.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: #0c1a23; color: #ddeef5; border: 1px solid #1a2d3a;
      padding: 12px 16px; border-radius: 10px; z-index: 99999;
      font-family: 'JetBrains Mono', monospace; font-size: 13px;
      display: flex; align-items: center; gap: 12px;
      box-shadow: 0 4px 40px rgba(0,0,0,0.4);
    `;
    el.innerHTML = `
      <span>New version available.</span>
      <button id="fetch-update-btn" style="
        background:#00e5ff;color:#030507;border:none;padding:6px 12px;
        border-radius:6px;font-weight:700;cursor:pointer;font-family:inherit;
      ">Refresh</button>
    `;
    document.body.appendChild(el);
    document
      .getElementById("fetch-update-btn")
      .addEventListener("click", () => {
        if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        el.remove();
      });
  }

  // ── Install prompt (Android/desktop Chrome) ──
  let deferredPrompt;
  const DISMISS_KEY = "fetch_install_dismissed_at";
  const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  function showInstallUI() {
    const btn = document.getElementById("pwaInstallBtn");
    const mobWrap = document.getElementById("pwaInstallMobWrap");
    if (btn) btn.style.display = "inline-flex";
    if (mobWrap) mobWrap.style.display = "block";

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissedAt > DISMISS_COOLDOWN_MS) {
      showInstallBanner();
    }
  }

  function hideInstallUI() {
    const btn = document.getElementById("pwaInstallBtn");
    const mobWrap = document.getElementById("pwaInstallMobWrap");
    if (btn) btn.style.display = "none";
    if (mobWrap) mobWrap.style.display = "none";
    const banner = document.getElementById("fetch-install-banner");
    if (banner) banner.remove();
  }

  function showInstallBanner() {
    if (document.getElementById("fetch-install-banner")) return;
    const el = document.createElement("div");
    el.id = "fetch-install-banner";
    el.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      max-width: 360px; width: calc(100% - 32px);
      background: #0c1a23; color: #ddeef5; border: 1px solid #1a2d3a;
      padding: 14px 16px; border-radius: 12px; z-index: 99998;
      font-family: 'JetBrains Mono', monospace; font-size: 13px;
      box-shadow: 0 4px 40px rgba(0,0,0,0.5);
      display: flex; align-items: center; gap: 12px;
    `;
    el.innerHTML = `
      <div style="flex:1;">
        <strong style="color:#00e5ff;">[FETCH]</strong> works better installed —
        offline access, faster launch, no browser chrome.
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button id="fetch-install-yes" style="
          background:#00e5ff;color:#030507;border:none;padding:7px 14px;
          border-radius:6px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;
        ">Install</button>
        <button id="fetch-install-no" style="
          background:transparent;color:#7aa3b5;border:none;padding:2px;
          cursor:pointer;font-family:inherit;font-size:11px;
        ">Not now</button>
      </div>
    `;
    document.body.appendChild(el);
    document
      .getElementById("fetch-install-yes")
      .addEventListener("click", () => {
        window.triggerFetchInstall();
        el.remove();
      });
    document
      .getElementById("fetch-install-no")
      .addEventListener("click", () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        el.remove();
      });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallUI();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideInstallUI();
  });

  window.addEventListener("load", () => {
    ["pwaInstallBtn", "pwaInstallMobBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.addEventListener("click", (e) => {
          e.preventDefault();
          window.triggerFetchInstall();
        });
    });
  });

  window.triggerFetchInstall = async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "dismissed") {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    deferredPrompt = null;
  };
})();
