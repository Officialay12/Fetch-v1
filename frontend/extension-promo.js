/* ══════════════════════════════════════════════════════════════════
   FETCH — extension-promo.js
   Desktop-only promo for the FETCH browser extension. Shows a small
   floating CTA; clicking it opens a modal with a real download button
   and step-by-step "load unpacked" instructions.

   Include this on desktop-facing pages (e.g. index.html) after pwa.js.
   Requires: /downloads/fetch-extension-v1.0.0.zip to exist on your
   static host — that's the actual .zip built from your extension/
   source (manifest.json, background.js, popup.html, popup.js, icons,
   libs/jszip.min.js).
═══════════════════════════════════════════════════════════════════ */

(function () {
  const DOWNLOAD_URL = "/downloads/fetch-extension";
  const DOWNLOAD_FILENAME = "fetch-extension-v1";
  const DISMISS_KEY = "fetch_ext_promo_dismissed_at";
  const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

  /* ── only show on desktop: fine pointer, wide viewport, non-mobile UA ── */
  function isDesktop() {
    const finePointer =
      window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    const wideEnough = window.innerWidth >= 900;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(
      navigator.userAgent,
    );
    return finePointer && wideEnough && !mobileUA;
  }

  /* Chromium check — the extension is MV3 and only installable via
     "Load unpacked" on Chrome/Edge/Brave/Opera etc. No point showing
     this to Firefox or Safari users. */
  function isChromiumBrowser() {
    const ua = navigator.userAgent;
    return /Chrome|Chromium|Edg|OPR|Brave/i.test(ua) && !/Firefox/i.test(ua);
  }

  function alreadyDismissedRecently() {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  }

  function init() {
    if (!isDesktop() || !isChromiumBrowser()) return;
    if (alreadyDismissedRecently()) return;
    if (document.getElementById("fetch-ext-cta")) return;

    injectStyles();
    showCTA();
  }

  function injectStyles() {
    if (document.getElementById("fetch-ext-promo-styles")) return;
    const style = document.createElement("style");
    style.id = "fetch-ext-promo-styles";
    style.textContent = `
      #fetch-ext-cta {
        position: fixed; bottom: 20px; right: 20px; z-index: 99997;
        background: #0c1a23; color: #ddeef5; border: 1px solid #1a2d3a;
        border-radius: 12px; padding: 12px 14px; max-width: 300px;
        font-family: 'JetBrains Mono', monospace; font-size: 12.5px;
        box-shadow: 0 4px 40px rgba(0,0,0,0.5);
        display: flex; align-items: flex-start; gap: 10px;
        animation: fetchExtSlideIn 0.35s ease-out;
      }
      @keyframes fetchExtSlideIn {
        from { transform: translateY(16px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      #fetch-ext-cta .ext-icon {
        width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px;
        background: #030507; border: 1px solid #1a2d3a;
        display: flex; align-items: center; justify-content: center;
        color: #00e5ff; font-weight: 800; font-size: 13px;
      }
      #fetch-ext-cta .ext-body { flex: 1; }
      #fetch-ext-cta .ext-title { font-weight: 700; color: #fff; margin-bottom: 2px; }
      #fetch-ext-cta .ext-sub { color: #7aa3b5; line-height: 1.4; margin-bottom: 8px; }
      #fetch-ext-cta button {
        font-family: inherit; cursor: pointer; border: none; border-radius: 6px;
      }
      #fetch-ext-cta .ext-open {
        background: #00e5ff; color: #030507; font-weight: 700;
        padding: 6px 12px; font-size: 11.5px;
      }
      #fetch-ext-cta .ext-close {
        background: transparent; color: #7aa3b5; font-size: 15px;
        line-height: 1; padding: 0 2px; align-self: flex-start;
      }
      #fetch-ext-cta .ext-close:hover { color: #ddeef5; }

      #fetch-ext-modal-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(3,5,7,0.75); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        padding: 24px; animation: fetchExtFadeIn 0.2s ease-out;
      }
      @keyframes fetchExtFadeIn { from { opacity: 0; } to { opacity: 1; } }
      #fetch-ext-modal {
        background: #0c1a23; border: 1px solid #1a2d3a; border-radius: 16px;
        max-width: 480px; width: 100%; max-height: 85vh; overflow-y: auto;
        padding: 28px; color: #ddeef5; font-family: 'JetBrains Mono', monospace;
        box-shadow: 0 20px 80px rgba(0,0,0,0.6);
      }
      #fetch-ext-modal h2 {
        margin: 0 0 6px; font-size: 19px; color: #fff;
        display: flex; align-items: center; gap: 8px;
      }
      #fetch-ext-modal h2 .bracket { color: #00e5ff; }
      #fetch-ext-modal .modal-sub {
        color: #7aa3b5; font-size: 13px; line-height: 1.5; margin-bottom: 20px;
      }
      #fetch-ext-download-btn {
        width: 100%; padding: 13px; border: none; border-radius: 10px;
        background: #00e5ff; color: #030507; font-weight: 700; font-size: 14px;
        font-family: inherit; cursor: pointer; margin-bottom: 8px;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      #fetch-ext-download-btn:active { transform: scale(0.98); }
      #fetch-ext-download-note {
        text-align: center; font-size: 11px; color: #7aa3b5; margin-bottom: 22px;
      }
      #fetch-ext-download-note.downloaded { color: #00e5ff; }
      #fetch-ext-modal .steps-title {
        font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
        color: #7aa3b5; margin-bottom: 12px;
      }
      #fetch-ext-modal ol { margin: 0; padding: 0; list-style: none; counter-reset: step; }
      #fetch-ext-modal ol li {
        counter-increment: step; position: relative;
        padding: 0 0 16px 34px; font-size: 12.5px; line-height: 1.5; color: #ddeef5;
      }
      #fetch-ext-modal ol li:last-child { padding-bottom: 0; }
      #fetch-ext-modal ol li::before {
        content: counter(step); position: absolute; left: 0; top: -1px;
        width: 22px; height: 22px; border-radius: 6px;
        background: #030507; border: 1px solid #1a2d3a; color: #00e5ff;
        font-weight: 700; font-size: 11px;
        display: flex; align-items: center; justify-content: center;
      }
      #fetch-ext-modal ol li code {
        background: #030507; border: 1px solid #1a2d3a; border-radius: 4px;
        padding: 1px 6px; color: #00e5ff; font-size: 11.5px;
      }
      #fetch-ext-modal-close {
        position: absolute; top: 18px; right: 18px;
        background: transparent; border: none; color: #7aa3b5;
        font-size: 20px; cursor: pointer; line-height: 1;
      }
      #fetch-ext-modal-close:hover { color: #ddeef5; }
      #fetch-ext-modal { position: relative; }
    `;
    document.head.appendChild(style);
  }

  function showCTA() {
    const el = document.createElement("div");
    el.id = "fetch-ext-cta";
    el.innerHTML = `
      <div class="ext-icon">[F]</div>
      <div class="ext-body">
        <div class="ext-title">Get FETCH as an extension</div>
        <div class="ext-sub">Right-click any page to extract its code — no need to paste URLs.</div>
        <button class="ext-open" id="fetch-ext-open-btn">Install FETCH as an extension</button>
      </div>
      <button class="ext-close" id="fetch-ext-close-btn" aria-label="Dismiss">×</button>
    `;
    document.body.appendChild(el);

    document
      .getElementById("fetch-ext-open-btn")
      .addEventListener("click", () => {
        el.remove();
        openModal();
      });

    document
      .getElementById("fetch-ext-close-btn")
      .addEventListener("click", () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        el.remove();
      });
  }

  function openModal() {
    if (document.getElementById("fetch-ext-modal-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "fetch-ext-modal-overlay";
    overlay.innerHTML = `
      <div id="fetch-ext-modal" role="dialog" aria-modal="true" aria-labelledby="fetch-ext-modal-title">
        <button id="fetch-ext-modal-close" aria-label="Close">×</button>
        <h2 id="fetch-ext-modal-title"><span class="bracket">[</span>FETCH<span class="bracket">]</span> Extension</h2>
        <p class="modal-sub">
          Extract any page's code with a right-click. Works in Chrome, Edge, Brave, and other Chromium browsers.
        </p>

        <button id="fetch-ext-download-btn">
          ⬇ Download FETCH Extension
        </button>
        <div id="fetch-ext-download-note">.zip · unzip it, then follow the steps below</div>

        <div class="steps-title">Add it to your browser</div>
        <ol>
          <li>Click <strong>Download FETCH Extension</strong> above and unzip the downloaded file to a folder you'll remember.</li>
          <li>Open <code>chrome://extensions</code> in a new tab (Edge: <code>edge://extensions</code>).</li>
          <li>Turn on <strong>Developer mode</strong> using the toggle in the top-right corner.</li>
          <li>Click <strong>Load unpacked</strong> and select the unzipped <code>fetch-extension</code> folder.</li>
          <li>Pin the <strong>[F]</strong> icon to your toolbar for one-click access.</li>
        </ol>
      </div>
    `;
    document.body.appendChild(overlay);

    document
      .getElementById("fetch-ext-download-btn")
      .addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = DOWNLOAD_URL;
        a.download = DOWNLOAD_FILENAME;
        document.body.appendChild(a);
        a.click();
        a.remove();

        const note = document.getElementById("fetch-ext-download-note");
        note.textContent = "✓ Downloaded — now follow the steps below";
        note.classList.add("downloaded");
      });

    function close() {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      overlay.remove();
    }

    document
      .getElementById("fetch-ext-modal-close")
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
