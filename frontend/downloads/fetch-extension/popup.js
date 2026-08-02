document.addEventListener("DOMContentLoaded", () => {
  const extractBtn = document.getElementById("extractBtn");
  const statTotal = document.getElementById("statTotal");
  const statFailed = document.getElementById("statFailed");
  const historyList = document.getElementById("historyList");

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url || "unknown";
    }
  }

  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function render(history, stats) {
    statTotal.textContent = stats.total || 0;
    statFailed.textContent = stats.failed || 0;

    if (!history.length) {
      historyList.innerHTML = '<div class="empty">No extractions yet</div>';
      return;
    }

    historyList.innerHTML = history
      .slice(0, 6)
      .map((h) => {
        const ok = h.success;
        return `
        <div class="history-item">
          <span class="host">${hostOf(h.url)}</span>
          <span class="${ok ? "status-ok" : "status-fail"}">
            ${ok ? ` · ${h.fileCount} files` : " · failed"}
          </span>
          <div style="color:var(--text2);font-size:10.5px;margin-top:2px;">${timeAgo(h.at)}</div>
        </div>`;
      })
      .join("");
  }

  function refresh() {
    chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (res) => {
      if (res) render(res.history, res.stats);
    });
  }

  extractBtn.addEventListener("click", () => {
    extractBtn.disabled = true;
    extractBtn.textContent = "Extracting…";
    chrome.runtime.sendMessage({ type: "EXTRACT_ACTIVE_TAB" }, () => {
      setTimeout(() => {
        extractBtn.disabled = false;
        extractBtn.textContent = "⚡ Extract This Page";
        refresh();
      }, 1500);
    });
  });

  refresh();
});
