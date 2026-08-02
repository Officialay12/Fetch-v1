/* ══════════════════════════════════════════════════════════════════
   FETCH extension — background.js (MV3 service worker)
═══════════════════════════════════════════════════════════════════ */

importScripts("libs/jszip.min.js");

const MENU_ID = "fetch-extract-page";
const MAX_CONCURRENT_FETCHES = 6;
const MAX_ASSET_BYTES = 8 * 1024 * 1024; // 8MB per asset guardrail
const HISTORY_KEY = "fetchHistory";
const STATS_KEY = "fetchStats";

/* ── context menu setup ── */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Extract with FETCH",
    contexts: ["page", "frame", "link", "image"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) {
    runExtraction(tab);
  }
});

/* Popup asks background to extract the active tab */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "EXTRACT_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) runExtraction(tab);
    });
    sendResponse({ ok: true });
  }
  if (msg?.type === "GET_HISTORY") {
    chrome.storage.local.get([HISTORY_KEY, STATS_KEY], (data) => {
      sendResponse({
        history: data[HISTORY_KEY] || [],
        stats: data[STATS_KEY] || { total: 0, failed: 0 },
      });
    });
    return true; // async response
  }
});

/* ── notification click -> reveal the file ── */
const notifToDownload = new Map();
chrome.notifications.onClicked.addListener((notifId) => {
  const downloadId = notifToDownload.get(notifId);
  if (downloadId != null) chrome.downloads.show(downloadId);
});

/* ══════════════════════════════════════════════
   Core extraction pipeline
══════════════════════════════════════════════ */
async function runExtraction(tab) {
  const startedAt = Date.now();
  try {
    if (!tab.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
      notify("Can't extract this page", "Browser-internal pages aren't accessible to extensions.", null);
      return;
    }

    setBadge(tab.id, "…");

    const [{ result: pageData }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData, // defined below, injected into the page
    });

    if (!pageData) throw new Error("No data returned from page");

    const { zipBlob64, fileCount, failedCount } = await buildZip(pageData);

    const hostname = safeName(new URL(pageData.url).hostname);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `FETCH/${hostname}-${stamp}.zip`;

    const downloadId = await chrome.downloads.download({
      url: `data:application/zip;base64,${zipBlob64}`,
      filename,
      saveAs: false,
    });

    await recordHistory({
      url: pageData.url,
      title: pageData.title,
      filename,
      fileCount,
      failedCount,
      durationMs: Date.now() - startedAt,
      success: true,
    });

    const notifId = `fetch-${downloadId}`;
    notifToDownload.set(notifId, downloadId);
    notify(
      "Extraction complete",
      `Saved ${fileCount} file${fileCount === 1 ? "" : "s"} from ${hostname}` +
        (failedCount ? ` (${failedCount} asset${failedCount === 1 ? "" : "s"} failed)` : "") +
        " — click to open.",
      notifId,
    );
    setBadge(tab.id, "✓", "#00e5ff");
  } catch (err) {
    console.error("[FETCH ext] extraction failed:", err);
    await recordHistory({
      url: tab.url,
      title: tab.title,
      error: err.message,
      success: false,
    });
    notify("Extraction failed", err.message || "Unknown error", null);
    setBadge(tab.id, "!", "#ff4060");
  } finally {
    setTimeout(() => setBadge(tab.id, ""), 4000);
  }
}

/* ── injected into the target page; must be fully self-contained ── */
function extractPageData() {
  function abs(u) {
    try {
      return new URL(u, document.baseURI).href;
    } catch {
      return null;
    }
  }

  const styles = [];
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    if (link.href)
      styles.push({ type: "external", url: link.href, raw: link.getAttribute("href") });
  });
  document.querySelectorAll("style").forEach((style, i) => {
    if (style.textContent.trim())
      styles.push({ type: "inline", index: i, content: style.textContent });
  });

  const scripts = [];
  document.querySelectorAll("script").forEach((script, i) => {
    if (script.src) {
      scripts.push({ type: "external", url: script.src, raw: script.getAttribute("src") });
    } else if (script.textContent.trim()) {
      scripts.push({ type: "inline", index: i, content: script.textContent });
    }
  });

  // resolved URL -> raw as-authored attribute value (null if we can't safely rewrite it)
  const imageMap = new Map();
  document.querySelectorAll("img[src]").forEach((img) => {
    if (img.src) imageMap.set(img.src, img.getAttribute("src"));
  });
  document.querySelectorAll("[style]").forEach((el) => {
    const bg = el.style.backgroundImage;
    const m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (m) {
      const u = abs(m[1]);
      if (u && !imageMap.has(u)) imageMap.set(u, null); // fetched, but not rewritten (inline style, not an attribute we safely regex-replace)
    }
  });

  const favicon =
    document.querySelector('link[rel~="icon"]')?.href || abs("/favicon.ico");

  return {
    url: location.href,
    title: document.title,
    html: document.documentElement.outerHTML,
    doctype: document.doctype
      ? `<!DOCTYPE ${document.doctype.name}>`
      : "<!DOCTYPE html>",
    styles,
    scripts,
    images: Array.from(imageMap, ([url, raw]) => ({ url, raw })),
    favicon,
    extractedAt: new Date().toISOString(),
  };
}

/* ── fetch with a concurrency limiter so we don't hammer the target ── */
async function pooledMap(items, worker, limit = MAX_CONCURRENT_FETCHES) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i).catch((e) => ({ error: e.message }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

async function fetchResource(url) {
  const res = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_ASSET_BYTES) throw new Error("asset too large, skipped");
  return { buf, contentType: res.headers.get("content-type") || "" };
}

function safeName(str, fallback = "file") {
  const clean = (str || fallback).split("?")[0].split("#")[0];
  const base = clean.split("/").filter(Boolean).pop() || fallback;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || fallback;
}

/* rewrite href="RAW" / src="RAW" attribute occurrences to a local path.
   Only touches href/src attributes (not arbitrary substrings) to avoid
   corrupting unrelated text that happens to contain the same string. */
function rewriteAttrRefs(html, rawValue, localPath) {
  if (!rawValue) return html;
  const escaped = rawValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(href|src)=(["'])${escaped}\\2`, "g");
  return html.replace(re, (_m, attr, quote) => `${attr}=${quote}${localPath}${quote}`);
}

/* ── assemble the ZIP from extracted page data ── */
async function buildZip(pageData) {
  const zip = new JSZip();
  let fileCount = 0;
  let failedCount = 0;
  const report = { failedAssets: [], unrewrittenReferences: [] };
  let html = pageData.html;

  const cssFolder = zip.folder("css");
  const jsFolder = zip.folder("js");
  const assetsFolder = zip.folder("assets");

  // Inline styles/scripts — no network needed, no rewriting required
  pageData.styles
    .filter((s) => s.type === "inline")
    .forEach((s, i) => {
      cssFolder.file(`inline-${i + 1}.css`, s.content);
      fileCount++;
    });
  pageData.scripts
    .filter((s) => s.type === "inline")
    .forEach((s, i) => {
      jsFolder.file(`inline-${i + 1}.js`, s.content);
      fileCount++;
    });

  // External CSS — fetch, save locally, then point href at the local copy
  const externalCss = pageData.styles.filter((s) => s.type === "external");
  await pooledMap(externalCss, async (s, i) => {
    const localPath = `css/${i + 1}-${safeName(s.url, "style.css")}`;
    try {
      const { buf } = await fetchResource(s.url);
      cssFolder.file(localPath.replace(/^css\//, ""), buf);
      fileCount++;
      html = rewriteAttrRefs(html, s.raw, localPath);
    } catch (e) {
      failedCount++;
      report.failedAssets.push({ url: s.url, error: e.message });
    }
  });

  // External JS
  const externalJs = pageData.scripts.filter((s) => s.type === "external");
  await pooledMap(externalJs, async (s, i) => {
    const localPath = `js/${i + 1}-${safeName(s.url, "script.js")}`;
    try {
      const { buf } = await fetchResource(s.url);
      jsFolder.file(localPath.replace(/^js\//, ""), buf);
      fileCount++;
      html = rewriteAttrRefs(html, s.raw, localPath);
    } catch (e) {
      failedCount++;
      report.failedAssets.push({ url: s.url, error: e.message });
    }
  });

  // Images (and background-image URLs, which we fetch but can't safely rewrite —
  // they came from a computed style, not a literal attribute in the HTML)
  await pooledMap(pageData.images, async (img, i) => {
    const localPath = `assets/${i + 1}-${safeName(img.url, "image")}`;
    try {
      const { buf } = await fetchResource(img.url);
      assetsFolder.file(localPath.replace(/^assets\//, ""), buf);
      fileCount++;
      if (img.raw) {
        html = rewriteAttrRefs(html, img.raw, localPath);
      } else {
        report.unrewrittenReferences.push(img.url);
      }
    } catch (e) {
      failedCount++;
      report.failedAssets.push({ url: img.url, error: e.message });
    }
  });

  const finalHtml = `${pageData.doctype || "<!DOCTYPE html>"}\n${html}`;
  zip.file("index.html", finalHtml);
  fileCount++;

  zip.file(
    "meta.json",
    JSON.stringify(
      {
        source: pageData.url,
        title: pageData.title,
        extractedAt: pageData.extractedAt,
        fileCount,
        failedCount,
        failedAssets: report.failedAssets,
        unrewrittenReferences: report.unrewrittenReferences,
        note:
          "index.html has been rewritten to point at the local css/js/assets folders so it opens correctly offline. Background-image URLs (CSS-driven, not HTML attributes) were downloaded into assets/ but left unrewritten in index.html — see unrewrittenReferences above.",
        extractedWith: "FETCH extension v1.0.0",
      },
      null,
      2,
    ),
  );
  fileCount++;

  const zipBlob64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  return { zipBlob64, fileCount, failedCount };
}

/* ── small helpers ── */
function notify(title, message, id) {
  chrome.notifications.create(id || undefined, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message,
    priority: 1,
  });
}

function setBadge(tabId, text, color) {
  try {
    chrome.action.setBadgeText({ tabId, text });
    if (color) chrome.action.setBadgeBackgroundColor({ tabId, color });
  } catch {
    /* tab may be gone */
  }
}

async function recordHistory(entry) {
  const data = await chrome.storage.local.get([HISTORY_KEY, STATS_KEY]);
  const history = data[HISTORY_KEY] || [];
  const stats = data[STATS_KEY] || { total: 0, failed: 0 };

  history.unshift({ ...entry, at: new Date().toISOString() });
  if (history.length > 25) history.length = 25;

  stats.total += 1;
  if (!entry.success) stats.failed += 1;

  await chrome.storage.local.set({ [HISTORY_KEY]: history, [STATS_KEY]: stats });
}
