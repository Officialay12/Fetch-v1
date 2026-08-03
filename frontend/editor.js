/* ══════════════════════════════════════════════════════════════════
   FETCH — editor.js
   A self-contained "code editor + live preview" feature.

   - Opens as a full-screen overlay (id="editorOverlay" in index.html).
   - Three files: index.html / styles.css / script.js.
   - Live preview iframe (sandboxed) rebuilt from the three files,
     with a tiny console shim so console.log/warn/error/info inside
     the preview shows up in FETCH's own Console tab.
   - Projects are saved to localStorage so people can come back later.
   - CodeMirror (line numbers + syntax highlighting) is lazy-loaded
     from cdnjs the first time the editor opens. If that fails (e.g.
     offline, or the CDN is blocked) the editor keeps working with
     plain <textarea>s — nothing here depends on CodeMirror loading.

   Depends on nothing except the DOM already in index.html. If
   `currentData` (set by script.js after a scrape) exists in scope,
   "Add to Code Editor" will use it — otherwise the editor just opens
   with a starter template.
═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const PROJECTS_KEY = "fetch_editor_projects";
  const LAST_STATE_KEY = "fetch_editor_last_state";
  const SPLIT_KEY = "fetch_editor_split_pct";
  const CM_VERSION = "5.65.16";

  const STARTER = {
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Page</title>
</head>
<body>
  <h1>Hello from FETCH Code Editor 👋</h1>
  <p>Edit the HTML, CSS and JS tabs — the preview updates live.</p>
  <button id="btn">Click me</button>
</body>
</html>`,
    css: `body {
  font-family: system-ui, sans-serif;
  background: #0c1a23;
  color: #ddeef5;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
  text-align: center;
}

button {
  background: #00e5ff;
  color: #030507;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}`,
    js: `document.getElementById('btn').addEventListener('click', () => {
  console.log('Button clicked!');
  document.body.style.background = '#112030';
});`,
  };

  /* ── DOM refs (grabbed lazily since script may load before DOM in edge cases) ── */
  let els = {};
  function grabEls() {
    els = {
      overlay: document.getElementById("editorOverlay"),
      shell: document.getElementById("editorShell"),
      body: document.getElementById("editorBody"),
      pane: document.getElementById("editorPane"),
      previewPane: document.getElementById("editorPreviewPane"),
      resizer: document.getElementById("editorResizer"),
      name: document.getElementById("editorProjectName"),
      select: document.getElementById("editorProjectSelect"),
      saveBtn: document.getElementById("editorSaveBtn"),
      newBtn: document.getElementById("editorNewBtn"),
      deleteBtn: document.getElementById("editorDeleteBtn"),
      downloadBtn: document.getElementById("editorDownloadBtn"),
      fullscreenBtn: document.getElementById("editorFullscreenBtn"),
      closeBtn: document.getElementById("editorCloseBtn"),
      fileTabs: Array.from(document.querySelectorAll(".editor-file-tab")),
      wrapHtml: document.getElementById("editorCodeWrapHtml"),
      wrapCss: document.getElementById("editorCodeWrapCss"),
      wrapJs: document.getElementById("editorCodeWrapJs"),
      taHtml: document.getElementById("editorTextareaHtml"),
      taCss: document.getElementById("editorTextareaCss"),
      taJs: document.getElementById("editorTextareaJs"),
      consoleTabBtn: document.getElementById("editorConsoleTabBtn"),
      consolePanel: document.getElementById("editorConsolePanel"),
      consoleLog: document.getElementById("consoleLog"),
      consoleBadge: document.getElementById("consoleBadge"),
      consoleClearBtn: document.getElementById("consoleClearBtn"),
      autoRun: document.getElementById("editorAutoRun"),
      runBtn: document.getElementById("editorRunBtn"),
      popoutBtn: document.getElementById("editorPopoutBtn"),
      frame: document.getElementById("editorPreviewFrame"),
      deviceBtns: Array.from(document.querySelectorAll(".device-btn")),
      statusMsg: document.getElementById("editorStatusMsg"),
      charCount: document.getElementById("editorCharCount"),
      stackedToggle: document.getElementById("editorStackedToggle"),
      viewCodeBtn: document.getElementById("editorViewCodeBtn"),
      viewPreviewBtn: document.getElementById("editorViewPreviewBtn"),
      addToEditorBtn: document.getElementById("addToEditorBtn"),
      navBtn: document.getElementById("codeEditorNavBtn"),
      mobBtn: document.getElementById("mobCodeEditorBtn"),
      heroBtn: document.getElementById("heroCodeEditorBtn"),
    };
  }

  /* ── state ── */
  let activeFile = "html";
  let currentProjectKey = null; // localStorage key of loaded project, or null = unsaved
  let cmInstances = { html: null, css: null, js: null }; // CodeMirror instances, if loaded
  let cmReady = false;
  let cmLoading = null;
  let runDebounce = null;
  let consoleCount = 0;
  let isOpen = false;

  function toast(msg, type) {
    if (typeof window.showToast === "function") {
      window.showToast(msg, type || "info");
    } else {
      console.log("[FETCH editor]", msg);
    }
  }

  /* ══════════════════════════════════════════════
     CodeMirror — lazy load, progressive enhancement
  ══════════════════════════════════════════════ */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("failed to load " + src));
      document.head.appendChild(s);
    });
  }
  function loadStyle(href) {
    return new Promise((resolve, reject) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = resolve;
      l.onerror = () => reject(new Error("failed to load " + href));
      document.head.appendChild(l);
    });
  }

  function ensureCodeMirror() {
    if (cmLoading) return cmLoading;
    const base = `https://cdnjs.cloudflare.com/ajax/libs/codemirror/${CM_VERSION}`;
    cmLoading = Promise.all([
      loadStyle(`${base}/codemirror.min.css`),
      loadStyle(`${base}/theme/material-darker.min.css`),
      loadStyle(`${base}/addon/hint/show-hint.min.css`),
    ])
      .then(() => loadScript(`${base}/codemirror.min.js`))
      .then(() =>
        Promise.all([
          loadScript(`${base}/mode/xml/xml.min.js`),
          loadScript(`${base}/mode/css/css.min.js`),
          loadScript(`${base}/mode/javascript/javascript.min.js`),
          loadScript(`${base}/mode/htmlmixed/htmlmixed.min.js`),
          loadScript(`${base}/addon/edit/matchbrackets.min.js`),
          loadScript(`${base}/addon/edit/closebrackets.min.js`),
          loadScript(`${base}/addon/selection/active-line.min.js`),
        ]),
      )
      .then(() => {
        cmReady = true;
      })
      .catch((err) => {
        console.warn(
          "[FETCH editor] CodeMirror failed to load, falling back to plain textareas:",
          err.message,
        );
        cmReady = false;
      });
    return cmLoading;
  }

  function initCodeMirrorInstances() {
    if (!cmReady || !window.CodeMirror) return;
    const common = {
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      theme: "material-darker",
      tabSize: 2,
      indentUnit: 2,
      viewportMargin: Infinity,
    };
    if (!cmInstances.html) {
      cmInstances.html = CodeMirror.fromTextArea(els.taHtml, {
        ...common,
        mode: "htmlmixed",
      });
      cmInstances.html.on("change", onEditorChange);
    }
    if (!cmInstances.css) {
      cmInstances.css = CodeMirror.fromTextArea(els.taCss, {
        ...common,
        mode: "css",
      });
      cmInstances.css.on("change", onEditorChange);
    }
    if (!cmInstances.js) {
      cmInstances.js = CodeMirror.fromTextArea(els.taJs, {
        ...common,
        mode: "javascript",
      });
      cmInstances.js.on("change", onEditorChange);
    }
    // sizing — flex layout handles width, CM needs an explicit refresh once visible
    Object.values(cmInstances).forEach(
      (cm) => cm && setTimeout(() => cm.refresh(), 30),
    );
  }

  function getFileValue(file) {
    const cm = cmInstances[file];
    if (cm) return cm.getValue();
    const ta =
      file === "html" ? els.taHtml : file === "css" ? els.taCss : els.taJs;
    return ta ? ta.value : "";
  }
  function setFileValue(file, value) {
    const cm = cmInstances[file];
    const ta =
      file === "html" ? els.taHtml : file === "css" ? els.taCss : els.taJs;
    if (ta) ta.value = value;
    if (cm) cm.setValue(value || "");
  }

  function onEditorChange() {
    updateCharCount();
    if (els.autoRun && els.autoRun.checked) {
      clearTimeout(runDebounce);
      runDebounce = setTimeout(runPreview, 500);
    }
    setStatus("Unsaved changes");
  }

  /* ══════════════════════════════════════════════
     File tab switching
  ══════════════════════════════════════════════ */
  function switchFile(file) {
    activeFile = file;
    els.fileTabs.forEach((btn) => {
      const isActive = btn.dataset.file === file;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    const showConsole = file === "console";
    els.consolePanel.classList.toggle("hidden", !showConsole);
    els.wrapHtml.classList.toggle("hidden", showConsole || file !== "html");
    els.wrapCss.classList.toggle("hidden", showConsole || file !== "css");
    els.wrapJs.classList.toggle("hidden", showConsole || file !== "js");

    if (!showConsole) {
      const cm = cmInstances[file];
      if (cm)
        setTimeout(() => {
          cm.refresh();
          cm.focus();
        }, 10);
      else {
        const ta =
          file === "html" ? els.taHtml : file === "css" ? els.taCss : els.taJs;
        if (ta) ta.focus();
      }
      updateCharCount();
    }
  }

  function updateCharCount() {
    if (activeFile === "console") return;
    const val = getFileValue(activeFile);
    els.charCount.textContent = `${val.length.toLocaleString()} chars`;
  }

  function setStatus(msg) {
    els.statusMsg.textContent = msg;
  }

  /* ══════════════════════════════════════════════
     Live preview
  ══════════════════════════════════════════════ */
  const CONSOLE_SHIM = `
    <script>
      (function () {
        var methods = ["log", "warn", "error", "info"];
        methods.forEach(function (m) {
          var orig = console[m];
          console[m] = function () {
            try {
              var args = Array.prototype.slice.call(arguments).map(function (a) {
                if (a instanceof Error) return a.message;
                if (typeof a === "object") { try { return JSON.stringify(a); } catch (e) { return String(a); } }
                return String(a);
              });
              window.parent.postMessage({ __fetchConsole: true, level: m, args: args }, "*");
            } catch (e) {}
            orig && orig.apply(console, arguments);
          };
        });
        window.addEventListener("error", function (e) {
          window.parent.postMessage({ __fetchConsole: true, level: "error", args: [e.message] }, "*");
        });
      })();
    <\/script>
  `;

  function buildPreviewDoc() {
    const html = getFileValue("html") || "";
    const css = getFileValue("css") || "";
    const js = getFileValue("js") || "";

    // If the HTML already has <head>/<body>, inject into them; otherwise wrap.
    const hasHtmlTag = /<html[\s>]/i.test(html);
    const styleTag = `<style>\n${css}\n</style>`;
    const scriptTag = `<script>\n${js}\n<\/script>`;

    if (hasHtmlTag) {
      let doc = html;
      if (/<\/head>/i.test(doc))
        doc = doc.replace(/<\/head>/i, `${styleTag}\n${CONSOLE_SHIM}\n</head>`);
      else
        doc = doc.replace(
          /<html[^>]*>/i,
          (m) => `${m}<head>${styleTag}${CONSOLE_SHIM}</head>`,
        );
      if (/<\/body>/i.test(doc))
        doc = doc.replace(/<\/body>/i, `${scriptTag}\n</body>`);
      else doc += scriptTag;
      return doc;
    }

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">${styleTag}${CONSOLE_SHIM}</head>
<body>
${html}
${scriptTag}
</body>
</html>`;
  }

  function runPreview() {
    if (!els.frame) return;
    const doc = buildPreviewDoc();
    // Using srcdoc keeps everything sandboxed and same-origin-free.
    els.frame.srcdoc = doc;
    setStatus("Preview updated · " + new Date().toLocaleTimeString());
  }

  window.addEventListener("message", (e) => {
    if (!e.data || !e.data.__fetchConsole) return;
    appendConsoleEntry(e.data.level, e.data.args);
  });

  function appendConsoleEntry(level, args) {
    if (!els.consoleLog) return;
    const empty = els.consoleLog.querySelector(".console-empty");
    if (empty) empty.remove();
    const row = document.createElement("div");
    row.className = `console-row console-${level}`;
    const icon =
      level === "error"
        ? "fa-circle-exclamation"
        : level === "warn"
          ? "fa-triangle-exclamation"
          : "fa-angle-right";
    row.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span class="console-text"></span>`;
    row.querySelector(".console-text").textContent = args.join(" ");
    els.consoleLog.appendChild(row);
    els.consoleLog.scrollTop = els.consoleLog.scrollHeight;

    consoleCount++;
    els.consoleBadge.textContent = String(consoleCount);
    els.consoleBadge.classList.remove("hidden");
  }

  function clearConsole() {
    consoleCount = 0;
    els.consoleBadge.textContent = "0";
    els.consoleBadge.classList.add("hidden");
    els.consoleLog.innerHTML = `<div class="console-empty">Logs from your preview's <code>console.log</code>, <code>warn</code> and <code>error</code> will show up here.</div>`;
  }

  function popoutPreview() {
    const doc = buildPreviewDoc();
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ══════════════════════════════════════════════
     Device preview sizing
  ══════════════════════════════════════════════ */
  function setDevice(device) {
    els.deviceBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.device === device),
    );
    const wrap = document.getElementById("editorPreviewFrameWrap");
    wrap.classList.remove("device-full", "device-tablet", "device-mobile");
    wrap.classList.add(`device-${device}`);
  }

  /* ══════════════════════════════════════════════
     Split-pane resizing (desktop only)
  ══════════════════════════════════════════════ */
  function initResizer() {
    let dragging = false;
    const saved = Number(localStorage.getItem(SPLIT_KEY));
    if (saved && saved > 20 && saved < 80) applySplit(saved);

    function applySplit(pct) {
      els.pane.style.flex = `0 0 ${pct}%`;
      els.previewPane.style.flex = `0 0 ${100 - pct}%`;
    }

    els.resizer.addEventListener("mousedown", (e) => {
      dragging = true;
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const rect = els.body.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.min(80, Math.max(20, pct));
      applySplit(pct);
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      const pct = parseFloat(els.pane.style.flexBasis) || 50;
      localStorage.setItem(SPLIT_KEY, String(pct));
    });
  }

  /* ══════════════════════════════════════════════
     Stacked (narrow-screen) view toggle
  ══════════════════════════════════════════════ */
  function checkStackedLayout() {
    const stacked = window.innerWidth < 880;
    els.body.classList.toggle("stacked", stacked);
    els.stackedToggle.classList.toggle("hidden", !stacked);
  }
  function setStackedView(view) {
    els.pane.classList.toggle("stacked-hidden", view !== "code");
    els.previewPane.classList.toggle("stacked-hidden", view !== "preview");
    els.viewCodeBtn.classList.toggle("active", view === "code");
    els.viewPreviewBtn.classList.toggle("active", view === "preview");
    if (view === "preview") runPreview();
  }

  /* ══════════════════════════════════════════════
     Projects — localStorage persistence
  ══════════════════════════════════════════════ */
  function getProjects() {
    try {
      return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function setProjects(obj) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(obj));
  }

  function refreshProjectSelect() {
    const projects = getProjects();
    const keys = Object.keys(projects).sort(
      (a, b) => (projects[b].updatedAt || 0) - (projects[a].updatedAt || 0),
    );
    els.select.innerHTML = '<option value="">— Saved Projects —</option>';
    keys.forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = projects[key].name || key;
      if (key === currentProjectKey) opt.selected = true;
      els.select.appendChild(opt);
    });
  }

  function saveProject() {
    const name =
      (els.name.value || "untitled-project").trim() || "untitled-project";
    const key = currentProjectKey || `proj_${Date.now()}`;
    const projects = getProjects();
    projects[key] = {
      name,
      html: getFileValue("html"),
      css: getFileValue("css"),
      js: getFileValue("js"),
      updatedAt: Date.now(),
    };
    setProjects(projects);
    currentProjectKey = key;
    refreshProjectSelect();
    setStatus(`Saved "${name}"`);
    toast(`Project "${name}" saved`, "success");
  }

  function loadProject(key) {
    const projects = getProjects();
    const p = projects[key];
    if (!p) return;
    currentProjectKey = key;
    els.name.value = p.name || "untitled-project";
    setFileValue("html", p.html || "");
    setFileValue("css", p.css || "");
    setFileValue("js", p.js || "");
    updateCharCount();
    runPreview();
    setStatus(`Loaded "${p.name}"`);
  }

  function deleteProject() {
    if (!currentProjectKey) {
      toast("This project hasn't been saved yet", "info");
      return;
    }
    const projects = getProjects();
    const name = projects[currentProjectKey]?.name || "project";
    delete projects[currentProjectKey];
    setProjects(projects);
    currentProjectKey = null;
    refreshProjectSelect();
    toast(`Deleted "${name}"`, "info");
    setStatus("Deleted. Editing an unsaved copy.");
  }

  function newProject() {
    currentProjectKey = null;
    els.name.value = "untitled-project";
    setFileValue("html", STARTER.html);
    setFileValue("css", STARTER.css);
    setFileValue("js", STARTER.js);
    updateCharCount();
    clearConsole();
    runPreview();
    refreshProjectSelect();
    setStatus("New project");
  }

  /* ══════════════════════════════════════════════
     Download as ZIP (reuses the JSZip already on the page)
  ══════════════════════════════════════════════ */
  async function downloadZip() {
    if (!window.JSZip) {
      toast("JSZip isn't loaded — can't build the ZIP", "error");
      return;
    }
    const zip = new window.JSZip();
    zip.file("index.html", getFileValue("html") || "");
    zip.file("styles.css", getFileValue("css") || "");
    zip.file("script.js", getFileValue("js") || "");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (els.name.value || "fetch-project")
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-");
    a.href = url;
    a.download = `${name}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast("ZIP downloaded", "success");
  }

  /* ══════════════════════════════════════════════
     Open / close
  ══════════════════════════════════════════════ */
  function hasAnyContent() {
    return !!(
      getFileValue("html") ||
      getFileValue("css") ||
      getFileValue("js")
    );
  }

  function openEditor(seed) {
    grabEls();
    if (!els.overlay) return;

    isOpen = true;
    els.overlay.classList.add("open");
    els.overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Apply content right away (works whether or not CodeMirror has loaded yet —
    // setFileValue falls back to the plain <textarea> until CM takes over).
    if (seed) applySeed(seed);
    else if (!hasAnyContent()) applyLastOrStarter();

    switchFile("html");
    checkStackedLayout();
    refreshProjectSelect();

    ensureCodeMirror().then(() => {
      const isFirstInit = !cmInstances.html;
      initCodeMirrorInstances();
      // If instances already existed from a previous open, the textarea-only
      // assignment above wouldn't have reached them — sync now.
      if (!isFirstInit && seed) applySeed(seed);
      switchFile(activeFile);
      updateCharCount();
      runPreview();
    });
  }

  function applySeed(seed) {
    currentProjectKey = null;
    els.name.value = seed.name || "untitled-project";
    setFileValue("html", seed.html || "");
    setFileValue("css", seed.css || "");
    setFileValue("js", seed.js || "");
    updateCharCount();
    clearConsole();
    runPreview();
    setStatus(seed.sourceLabel ? `Loaded from ${seed.sourceLabel}` : "Loaded");
  }

  function applyLastOrStarter() {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_STATE_KEY) || "null");
      if (last) {
        setFileValue("html", last.html || STARTER.html);
        setFileValue("css", last.css || STARTER.css);
        setFileValue("js", last.js || STARTER.js);
        return;
      }
    } catch {}
    setFileValue("html", STARTER.html);
    setFileValue("css", STARTER.css);
    setFileValue("js", STARTER.js);
  }

  function closeEditor() {
    isOpen = false;
    els.overlay.classList.remove("open");
    els.overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    try {
      localStorage.setItem(
        LAST_STATE_KEY,
        JSON.stringify({
          html: getFileValue("html"),
          css: getFileValue("css"),
          js: getFileValue("js"),
        }),
      );
    } catch {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      els.shell
        .requestFullscreen?.()
        .catch(() =>
          toast("Fullscreen isn't available in this browser", "info"),
        );
    } else {
      document.exitFullscreen();
    }
  }

  /* ══════════════════════════════════════════════
     Wire everything up once the DOM is ready
  ══════════════════════════════════════════════ */
  function init() {
    grabEls();
    if (!els.overlay) return; // this page doesn't have the editor markup

    els.fileTabs.forEach((btn) =>
      btn.addEventListener("click", () => switchFile(btn.dataset.file)),
    );

    els.closeBtn.addEventListener("click", closeEditor);
    els.overlay.addEventListener("click", (e) => {
      if (e.target === els.overlay) closeEditor();
    });

    els.saveBtn.addEventListener("click", saveProject);
    els.newBtn.addEventListener("click", () => {
      if (
        confirm(
          "Start a new blank project? Unsaved changes in the current one will be lost unless you save first.",
        )
      ) {
        newProject();
      }
    });
    els.deleteBtn.addEventListener("click", () => {
      if (confirm("Delete this saved project? This can't be undone."))
        deleteProject();
    });
    els.downloadBtn.addEventListener("click", downloadZip);
    els.fullscreenBtn.addEventListener("click", toggleFullscreen);
    els.select.addEventListener("change", () => {
      if (els.select.value) loadProject(els.select.value);
    });

    els.runBtn.addEventListener("click", runPreview);
    els.popoutBtn.addEventListener("click", popoutPreview);
    els.consoleClearBtn.addEventListener("click", clearConsole);
    els.deviceBtns.forEach((btn) =>
      btn.addEventListener("click", () => setDevice(btn.dataset.device)),
    );

    // Plain-textarea input listeners (used whenever CodeMirror hasn't taken over yet)
    [els.taHtml, els.taCss, els.taJs].forEach(
      (ta) => ta && ta.addEventListener("input", onEditorChange),
    );

    els.viewCodeBtn.addEventListener("click", () => setStackedView("code"));
    els.viewPreviewBtn.addEventListener("click", () =>
      setStackedView("preview"),
    );

    window.addEventListener("resize", checkStackedLayout);

    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        runPreview();
      } else if (e.key === "Escape") {
        // Don't steal Escape from CodeMirror's own search/close-hint behavior.
        const active = document.activeElement;
        const inCm = active && active.closest && active.closest(".CodeMirror");
        if (!inCm) closeEditor();
      }
    });

    initResizer();

    // Entry points
    els.navBtn?.addEventListener("click", () => openEditor());
    els.heroBtn?.addEventListener("click", () => openEditor());
    els.mobBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("mobileMenu")?.classList.remove("open");
      openEditor();
    });

    els.addToEditorBtn?.addEventListener("click", () => {
      if (typeof currentData === "undefined" || !currentData) {
        toast("Fetch a website first, then send it to the editor", "info");
        return;
      }
      openEditor({
        name:
          (
            currentData.pageTitle ||
            getDomainSafe(currentData.url) ||
            "scraped-site"
          )
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, "-")
            .slice(0, 40) || "scraped-site",
        html: currentData.html || "",
        css: currentData.css || "",
        js: currentData.js || "",
        sourceLabel: currentData.url || "scraped site",
      });
      toast("Loaded into the Code Editor", "success");
    });

    window.openFetchCodeEditor = openEditor; // exposed for other scripts/console
  }

  function getDomainSafe(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
