/* ══════════════════════════════════════════════════════════════════
   FETCH — pwa.js
   Registers the service worker, listens for updates, and handles
   "install the app" across platforms:
     - Android / desktop Chrome, Edge, Brave  → native beforeinstallprompt
     - iOS Safari                              → no native prompt exists,
       so we detect it and show manual "Add to Home Screen" steps instead
   Include this on every page (index/auth/admin).
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
      position: fixed; bottom: max(20px, env(safe-area-inset-bottom));
      left: 50%; transform: translateX(-50%);
      background: #0c1a23; color: #ddeef5; border: 1px solid #1a2d3a;
      padding: 12px 16px; border-radius: 10px; z-index: 99999;
      font-family: 'JetBrains Mono', monospace; font-size: 13px;
      display: flex; align-items: center; gap: 12px;
      box-shadow: 0 4px 40px rgba(0,0,0,0.4);
      max-width: calc(100vw - 32px);
    `;
    el.innerHTML = `
      <span>New version available.</span>
      <button id="fetch-update-btn" style="
        background:#00e5ff;color:#030507;border:none;padding:6px 12px;
        border-radius:6px;font-weight:700;cursor:pointer;font-family:inherit;
        white-space:nowrap;
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

  /* ── platform detection ── */
  function isIOS() {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports as Mac, but has touch — catch that too.
    const iThing = /iPad|iPhone|iPod/.test(ua);
    const iPadOS13Up =
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iThing || iPadOS13Up;
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  /* ── install prompt state ── */
  let deferredPrompt = null;
  const DISMISS_KEY = "fetch_install_dismissed_at";
  const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  function recentlyDismissed() {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  }

  function showInstallUI() {
    const btn = document.getElementById("pwaInstallBtn");
    const mobWrap = document.getElementById("pwaInstallMobWrap");
    if (btn) btn.style.display = "inline-flex";
    if (mobWrap) mobWrap.style.display = "block";

    if (!recentlyDismissed()) {
      if (isIOS()) showIOSInstallModal({ silent: true });
      else showInstallBanner();
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

  /* ── Android/desktop banner (native prompt available) ── */
  function showInstallBanner() {
    if (document.getElementById("fetch-install-banner")) return;
    if (document.getElementById("fetch-ios-install-overlay")) return;

    const el = document.createElement("div");
    el.id = "fetch-install-banner";
    el.style.cssText = `
      position: fixed; bottom: max(20px, env(safe-area-inset-bottom));
      left: 50%; transform: translateX(-50%);
      max-width: 380px; width: calc(100% - 32px);
      background: linear-gradient(160deg, #0c1a23, #0a141c);
      color: #ddeef5; border: 1px solid #1a2d3a;
      padding: 16px; border-radius: 14px; z-index: 99998;
      font-family: 'JetBrains Mono', monospace; font-size: 13px;
      box-shadow: 0 10px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,229,255,0.04);
      display: flex; align-items: flex-start; gap: 12px;
      animation: fetchSlideUp 0.35s cubic-bezier(0.16,1,0.3,1);
    `;
    injectAnim();
    el.innerHTML = `
      <div style="width:36px;height:36px;flex-shrink:0;border-radius:9px;
        background:#030507;border:1px solid #1a2d3a;display:flex;
        align-items:center;justify-content:center;color:#00e5ff;font-size:15px;">
        <i class="fa-solid fa-download" aria-hidden="true"></i>
      </div>
      <div style="flex:1;">
        <div style="font-weight:700;color:#fff;margin-bottom:3px;">Install FETCH</div>
        <div style="color:#7aa3b5;line-height:1.4;margin-bottom:10px;font-size:12px;">
          Offline access, faster launch, no browser chrome.
        </div>
        <div style="display:flex;gap:8px;">
          <button id="fetch-install-yes" style="
            background:#00e5ff;color:#030507;border:none;padding:7px 14px;
            border-radius:7px;font-weight:700;cursor:pointer;font-family:inherit;
            font-size:12.5px;
          ">Install</button>
          <button id="fetch-install-no" style="
            background:transparent;color:#7aa3b5;border:1px solid #1a2d3a;
            padding:7px 12px;border-radius:7px;cursor:pointer;font-family:inherit;
            font-size:12.5px;
          ">Not now</button>
        </div>
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

  /* ── iOS: no native prompt exists, so show manual steps ── */
  function showIOSInstallModal(opts) {
    opts = opts || {};
    if (document.getElementById("fetch-ios-install-overlay")) return;
    if (document.getElementById("fetch-install-banner")) return;

    injectAnim();

    if (opts.silent) {
      // First-visit nudge: small banner instead of a full modal so it
      // doesn't feel intrusive before the user has even looked around.
      const el = document.createElement("div");
      el.id = "fetch-install-banner";
      el.style.cssText = `
        position: fixed; bottom: max(20px, env(safe-area-inset-bottom));
        left: 50%; transform: translateX(-50%);
        max-width: 380px; width: calc(100% - 32px);
        background: linear-gradient(160deg, #0c1a23, #0a141c);
        color: #ddeef5; border: 1px solid #1a2d3a;
        padding: 16px; border-radius: 14px; z-index: 99998;
        font-family: 'JetBrains Mono', monospace; font-size: 13px;
        box-shadow: 0 10px 50px rgba(0,0,0,0.55);
        display: flex; align-items: flex-start; gap: 12px;
        animation: fetchSlideUp 0.35s cubic-bezier(0.16,1,0.3,1);
      `;
      el.innerHTML = `
        <div style="width:36px;height:36px;flex-shrink:0;border-radius:9px;
          background:#030507;border:1px solid #1a2d3a;display:flex;
          align-items:center;justify-content:center;color:#00e5ff;font-size:15px;">
          <i class="fa-solid fa-square-arrow-up-right" aria-hidden="true"></i>
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;color:#fff;margin-bottom:3px;">Add FETCH to Home Screen</div>
          <div style="color:#7aa3b5;line-height:1.4;margin-bottom:10px;font-size:12px;">
            Works offline, launches full-screen, no address bar.
          </div>
          <div style="display:flex;gap:8px;">
            <button id="fetch-ios-steps-btn" style="
              background:#00e5ff;color:#030507;border:none;padding:7px 14px;
              border-radius:7px;font-weight:700;cursor:pointer;font-family:inherit;
              font-size:12.5px;
            ">Show me how</button>
            <button id="fetch-ios-dismiss-btn" style="
              background:transparent;color:#7aa3b5;border:1px solid #1a2d3a;
              padding:7px 12px;border-radius:7px;cursor:pointer;font-family:inherit;
              font-size:12.5px;
            ">Not now</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
      document
        .getElementById("fetch-ios-steps-btn")
        .addEventListener("click", () => {
          el.remove();
          showIOSInstallModal({ silent: false });
        });
      document
        .getElementById("fetch-ios-dismiss-btn")
        .addEventListener("click", () => {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
          el.remove();
        });
      return;
    }

    // Full step-by-step modal (opened from nav button or "show me how")
    const overlay = document.createElement("div");
    overlay.id = "fetch-ios-install-overlay";
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(3,5,7,0.75); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; animation: fetchFadeIn 0.2s ease-out;
    `;
    overlay.innerHTML = `
      <div style="background:#0c1a23;border:1px solid #1a2d3a;border-radius:16px;
        max-width:420px;width:100%;max-height:85vh;overflow-y:auto;padding:28px;
        color:#ddeef5;font-family:'JetBrains Mono', monospace;
        box-shadow:0 20px 80px rgba(0,0,0,0.6);position:relative;">
        <button id="fetch-ios-modal-close" aria-label="Close" style="
          position:absolute;top:18px;right:18px;background:transparent;border:none;
          color:#7aa3b5;font-size:20px;cursor:pointer;line-height:1;">×</button>
        <h2 style="margin:0 0 6px;font-size:19px;color:#fff;display:flex;align-items:center;gap:8px;">
          <span style="color:#00e5ff;">[</span>FETCH<span style="color:#00e5ff;">]</span> on your Home Screen
        </h2>
        <p style="color:#7aa3b5;font-size:13px;line-height:1.5;margin-bottom:20px;">
          iOS doesn't let apps trigger this automatically — it's three taps, done once.
        </p>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#7aa3b5;margin-bottom:12px;">
          Add it in Safari
        </div>
        <ol style="margin:0;padding:0;list-style:none;">
          <li style="position:relative;padding:0 0 16px 34px;font-size:12.5px;line-height:1.6;">
            <span style="position:absolute;left:0;top:-1px;width:22px;height:22px;
              border-radius:6px;background:#030507;border:1px solid #1a2d3a;color:#00e5ff;font-weight:700;
              font-size:11px;display:flex;align-items:center;justify-content:center;">1</span>
            Tap the <strong>Share</strong> icon <i class="fa-solid fa-arrow-up-from-bracket" style="color:#00e5ff;"></i>
            in Safari's toolbar.
          </li>
          <li style="position:relative;padding:0 0 16px 34px;font-size:12.5px;line-height:1.6;">
            <span style="position:absolute;left:0;top:-1px;width:22px;height:22px;
              border-radius:6px;background:#030507;border:1px solid #1a2d3a;color:#00e5ff;font-weight:700;
              font-size:11px;display:flex;align-items:center;justify-content:center;">2</span>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </li>
          <li style="position:relative;padding:0 0 0 34px;font-size:12.5px;line-height:1.6;">
            <span style="position:absolute;left:0;top:-1px;width:22px;height:22px;
              border-radius:6px;background:#030507;border:1px solid #1a2d3a;color:#00e5ff;font-weight:700;
              font-size:11px;display:flex;align-items:center;justify-content:center;">3</span>
            Tap <strong>Add</strong> in the top-right corner. That's it.
          </li>
        </ol>
      </div>
    `;
    document.body.appendChild(overlay);

    function close() {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      overlay.remove();
    }
    document
      .getElementById("fetch-ios-modal-close")
      .addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", escHandler);
      }
    });
  }

  function injectAnim() {
    if (document.getElementById("fetch-pwa-anim-styles")) return;
    const style = document.createElement("style");
    style.id = "fetch-pwa-anim-styles";
    style.textContent = `
      @keyframes fetchSlideUp { from { transform: translate(-50%, 16px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      @keyframes fetchFadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);
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
    if (isStandalone()) return; // already installed, nothing to do

    ["pwaInstallBtn", "pwaInstallMobBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.addEventListener("click", (e) => {
          e.preventDefault();
          window.triggerFetchInstall();
        });
    });

    // iOS never fires beforeinstallprompt — surface the manual flow
    // ourselves instead of silently doing nothing when tapped.
    if (isIOS()) showInstallUI();
  });

  window.triggerFetchInstall = async function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "dismissed") {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
      deferredPrompt = null;
      return;
    }

    if (isIOS()) {
      showIOSInstallModal({ silent: false });
      return;
    }

    // No native prompt available and not iOS — e.g. Firefox desktop,
    // or the prompt already fired once this session. Let the person
    // know rather than doing nothing when they tap the button.
    if (typeof window.showToast === "function") {
      window.showToast(
        "install isn't available in this browser yet — try Chrome, Edge, or Safari on iOS",
        "info",
      );
    }
  };
})();
