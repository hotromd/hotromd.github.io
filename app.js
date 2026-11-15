(function () {
  "use strict";

  var KEY_DOCS = "md.local:docs";
  var KEY_ACTIVE = "md.local:active";
  var KEY_PREFS = "md.local:prefs";
  var KEY_FOLDERS = "md.local:folders";
  var KEY_TRASH = "md.local:trash";
  var DOC_MIME = "text/x-md-doc";
  var KEY_MODE = "md.local:mode"; // legacy, migrated into prefs
  var KEY_OLD = "md.local:doc";   // single-document storage from the first version
  var MD_OPTS = { gfm: true, breaks: false };

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var editor = $("editor");
  var preview = $("preview");
  var proEditor = $("pro-editor");
  var paneView = $("pane-view");
  var app = $("app");
  var titleInput = $("title-input");
  var btnAutoTitle = $("btn-auto-title");
  var docList = $("doc-list");
  var searchInput = $("search");
  var outline = $("outline");
  var outlineList = $("outline-list");
  var saveState = $("save-state");
  var tabs = { edit: $("tab-edit"), split: $("tab-split"), view: $("tab-view"), pro: $("tab-pro") };
  var mqDark = window.matchMedia("(prefers-color-scheme: dark)");
  var mqMobile = window.matchMedia("(max-width: 760px)");

  var tr = window.I18N.t; // UI strings live in i18n.js (English default, Vietnamese optional)
  function appName() { return tr("app.name"); }

  var docs = [];
  var folders = [];   // { id, name, collapsed, created }
  var trash = [];     // recently deleted docs
  var trashCollapsed = true;
  var current = null;
  var renamingId = null;
  var viewState = {}; // per-document cursor/scroll, kept in memory only
  var prefs = loadPrefs();

  // ---------- utils ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function isMobile() { return mqMobile.matches; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function fold(s) {
    // Case- and diacritic-insensitive matching (Vietnamese friendly)
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "i");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }

  // ---------- prefs ----------
  function loadPrefs() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(KEY_PREFS) || "{}") || {}; } catch (e) { p = {}; }
    var d = {
      mode: localStorage.getItem(KEY_MODE) || "split", theme: "auto", sidebar: true,
      outline: false, sync: true, split: 50, fontScale: 1, sidebarWidth: 280, lang: window.I18N.lang,
      sort: "updated"
    };
    Object.keys(d).forEach(function (k) { if (p[k] === undefined) p[k] = d[k]; });
    return p;
  }
  function savePrefs() {
    try { localStorage.setItem(KEY_PREFS, JSON.stringify(prefs)); } catch (e) {}
  }

  // ---------- data ----------
  function normalizeEol(s) { return String(s).replace(/\r\n?/g, "\n"); }

  function newDoc(content, folderId) {
    return {
      id: uid(), title: "", titleAuto: true, pinned: false, folderId: folderId || null,
      content: content || "", updated: Date.now()
    };
  }

  function findFolder(id) {
    return id ? folders.find(function (f) { return f.id === id; }) || null : null;
  }
  function folderOf(doc) { return findFolder(doc.folderId); }
  function sortedFolders() {
    return folders.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, "vi", { numeric: true, sensitivity: "base" });
    });
  }

  function autoTitle(content) {
    var text = content || "";
    var h = text.match(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/m);
    if (h) return h[1].trim().slice(0, 120);
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/[#>*_`~\[\]()|-]/g, " ").replace(/\s+/g, " ").trim();
      if (l) return l.slice(0, 80);
    }
    return tr("untitled");
  }

  function getTitle(doc) {
    return doc.titleAuto || !doc.title.trim() ? autoTitle(doc.content) : doc.title;
  }

  function snippet(doc) {
    var title = getTitle(doc);
    var lines = (doc.content || "").split(/\r?\n/);
    for (var i = 0; i < lines.length && i < 40; i++) {
      if (/^\s*(```|~~~|\|?\s*:?-{3,})/.test(lines[i])) continue;
      var l = lines[i].replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~|]/g, " ").replace(/^\s*([-+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "").replace(/\s+/g, " ").trim();
      if (l && l !== title) return l.slice(0, 90);
    }
    return tr("empty");
  }

  function load() {
    try { folders = JSON.parse(localStorage.getItem(KEY_FOLDERS) || "[]"); } catch (e) { folders = []; }
    if (!Array.isArray(folders)) folders = [];
    try { trash = JSON.parse(localStorage.getItem(KEY_TRASH) || "[]"); } catch (e) { trash = []; }
    if (!Array.isArray(trash)) trash = [];
    try { docs = JSON.parse(localStorage.getItem(KEY_DOCS) || "null"); } catch (e) { docs = null; }
    if (!Array.isArray(docs) || !docs.length) {
      var old = localStorage.getItem(KEY_OLD);
      docs = [newDoc(old === null ? tr("welcome") : old)];
      persist(true);
    }
    // The textarea always uses "\n"; keep stored content consistent so search offsets match
    docs.forEach(function (d) { if (typeof d.content === "string") d.content = normalizeEol(d.content); });
    var activeId = localStorage.getItem(KEY_ACTIVE);
    current = docs.find(function (d) { return d.id === activeId; }) || sortedDocs()[0];
  }

  var persistTimer, lastSavedAt = "";
  function persist(quiet) {
    clearTimeout(persistTimer);
    try {
      localStorage.setItem(KEY_DOCS, JSON.stringify(docs));
      localStorage.setItem(KEY_FOLDERS, JSON.stringify(folders));
      localStorage.setItem(KEY_TRASH, JSON.stringify(trash));
      if (current) localStorage.setItem(KEY_ACTIVE, current.id);
      var d = new Date();
      lastSavedAt = pad(d.getHours()) + ":" + pad(d.getMinutes());
      setSaveState(tr("saved", { time: lastSavedAt }));
      return true;
    } catch (e) {
      setSaveState(tr("saveFull"), true);
      if (!quiet) toast(tr("saveFullToast"), { type: "error", timeout: 6000 });
      return false;
    }
  }
  function persistSoon() {
    setSaveState(tr("saving"));
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 400);
  }
  function setSaveState(text, isError) {
    saveState.textContent = text;
    saveState.classList.toggle("error", !!isError);
  }

  function sortedDocs() {
    var sortBy = prefs.sort || "updated";
    return docs.slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (sortBy === "title") {
        return getTitle(a).localeCompare(getTitle(b), "vi", { numeric: true, sensitivity: "base" });
      }
      if (sortBy === "length") {
        var dl = (b.content || "").length - (a.content || "").length;
        if (dl !== 0) return dl;
      }
      return b.updated - a.updated;
    });
  }

  // ---------- markdown rendering ----------
  if (window.marked && typeof marked.use === "function") {
    marked.use({
      extensions: [
        {
          name: "mathBlock",
          level: "block",
          start: function (src) {
            var m = src.match(/^ {0,3}\$\$/m);
            return m ? m.index : -1;
          },
          tokenizer: function (src) {
            var m = src.match(/^ {0,3}\$\$\s*\n([\s\S]+?)\n {0,3}\$\$[ \t]*(?:\n|$)/) ||
                    src.match(/^ {0,3}\$\$([^\n$]+?)\$\$[ \t]*(?:\n|$)/);
            if (m) return { type: "mathBlock", raw: m[0], text: m[1].trim() };
          },
          renderer: function (t) {
            return '<div class="math-block" data-math="' + escapeHtml(t.text) + '">' + escapeHtml(t.text) + "</div>\n";
          }
        },
        {
          name: "mathInline",
          level: "inline",
          start: function (src) { return src.indexOf("$"); },
          tokenizer: function (src) {
            var m = src.match(/^\$\$([^\s$](?:[^$]*[^\s$])?)\$\$/) ||
                    src.match(/^\$([^\s$\\](?:\\.|[^$\n\\])*?(?:[^\s$\\]|\\.)|[^\s$\\])\$(?!\d)/);
            if (m) {
              return { type: "mathInline", raw: m[0], text: m[1].trim(), display: m[0].slice(0, 2) === "$$" };
            }
          },
          renderer: function (t) {
            var cls = t.display ? "math-block" : "math-inline";
            return '<span class="' + cls + '" data-math="' + escapeHtml(t.text) + '">' + escapeHtml(t.text) + "</span>";
          }
        }
      ]
    });
  }

  var ALERT_ICONS = {
    note: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
    tip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>',
    important: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
    warning: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
    caution: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>'
  };

  function enhanceAlerts(container) {
    container.querySelectorAll("blockquote").forEach(function (bq) {
      var first = bq.firstElementChild;
      if (!first || first.tagName !== "P") return;
      var m = first.innerHTML.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]*\r?\n|[ \t]*<br\s*\/?>|[ \t]+|$)/i);
      if (!m) return;
      var type = m[1].toLowerCase();
      var rest = first.innerHTML.slice(m[0].length);
      if (rest.trim()) first.innerHTML = rest;
      else first.remove();

      var div = document.createElement("div");
      div.className = "markdown-alert markdown-alert-" + type;
      div.setAttribute("data-alert", type);
      if (bq.hasAttribute("data-src")) div.setAttribute("data-src", bq.getAttribute("data-src"));

      var title = document.createElement("p");
      title.className = "markdown-alert-title";
      title.innerHTML = ALERT_ICONS[type] + "<span>" + escapeHtml(tr("alert." + type)) + "</span>";
      div.appendChild(title);
      while (bq.firstChild) div.appendChild(bq.firstChild);
      bq.replaceWith(div);
    });
  }

  // ---------- KaTeX (loaded from CDN on first use) ----------
  var KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
  var KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
  var katexLoading = null;

  function loadKatex() {
    if (window.katex) return Promise.resolve(window.katex);
    if (!katexLoading) {
      if (!document.querySelector('link[href="' + KATEX_CSS + '"]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = KATEX_CSS;
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
      }
      katexLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = KATEX_JS;
        s.async = true;
        s.crossOrigin = "anonymous";
        s.onload = function () {
          if (window.katex) resolve(window.katex); else reject(new Error("KaTeX failed"));
        };
        s.onerror = function () {
          katexLoading = null;
          s.remove();
          reject(new Error("KaTeX load failed"));
        };
        document.head.appendChild(s);
      });
    }
    return katexLoading;
  }

  function applyKatexTo(container, katex) {
    container.querySelectorAll("[data-math]").forEach(function (el) {
      var code = el.getAttribute("data-math") || "";
      var display = el.classList.contains("math-block");
      try {
        el.innerHTML = katex.renderToString(code, {
          displayMode: display,
          throwOnError: false,
          output: "htmlAndMathml"
        });
      } catch (e) {
        el.classList.add("math-error");
        el.textContent = code;
      }
    });
  }

  function renderMath(container) {
    var nodes = container.querySelectorAll("[data-math]");
    if (!nodes.length) return Promise.resolve(container);
    if (window.katex) {
      applyKatexTo(container, window.katex);
      return Promise.resolve(container);
    }
    return loadKatex().then(function (k) {
      if (container.isConnected || container !== preview) applyKatexTo(container, k);
      return container;
    }).catch(function () { return container; });
  }

  function slug(text) {
    // GitHub-style anchor: keep unicode letters/numbers, spaces -> "-"
    return String(text).trim().toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
  }

  function addHeadingIds(container) {
    var used = {};
    container.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(function (h) {
      var base = slug(h.textContent) || "muc";
      var id = base, n = 1;
      while (used[id]) id = base + "-" + n++;
      used[id] = true;
      h.id = id;
    });
  }

  function highlight(container) {
    if (!window.hljs) return;
    container.querySelectorAll("pre code:not(.language-mermaid)").forEach(function (el) {
      try { window.hljs.highlightElement(el); } catch (e) {}
    });
  }

  // Clean HTML for export (no UI buttons, checkboxes stay disabled)
  function buildHtml(src) {
    var div = document.createElement("div");
    div.innerHTML = marked.parse(src || "", MD_OPTS);
    addHeadingIds(div);
    enhanceAlerts(div);
    highlight(div);
    if (window.katex) applyKatexTo(div, window.katex);
    return div.innerHTML;
  }

  // ---------- Mermaid (loaded from CDN on first use) ----------
  var MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js";
  var mermaidLoading = null, mermaidQueue = Promise.resolve(), mermaidSeq = 0;
  var mermaidCache = new Map(); // "variant\0code" -> svg
  var lastDiagram = {};         // block index -> last good svg, shown while re-rendering

  function loadMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (!mermaidLoading) {
      mermaidLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = MERMAID_URL;
        s.async = true;
        s.crossOrigin = "anonymous";
        s.onload = function () {
          if (window.mermaid) resolve(window.mermaid); else reject(new Error(tr("mermaid.initFail")));
        };
        s.onerror = function () {
          mermaidLoading = null; // allow retry on next render
          s.remove();
          reject(new Error(tr("mermaid.loadFail")));
        };
        document.head.appendChild(s);
      });
    }
    return mermaidLoading;
  }

  // variant: "light" | "dark" | "export" (light, plain SVG text labels so it can be turned into PNG)
  function mermaidSvg(code, variant) {
    var key = variant + "\u0000" + code;
    if (mermaidCache.has(key)) return Promise.resolve(mermaidCache.get(key));
    var job = mermaidQueue.then(loadMermaid).then(function (m) {
      var plain = variant === "export";
      m.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: variant === "dark" ? "dark" : "default",
        htmlLabels: !plain,
        flowchart: { htmlLabels: !plain },
        fontFamily: '-apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif'
      });
      var id = "mmd-" + (++mermaidSeq);
      return m.render(id, code).then(function (r) { return r.svg; }, function (err) {
        // Mermaid can leave its temporary render node behind on errors
        ["d" + id, id].forEach(function (x) { var el = document.getElementById(x); if (el) el.remove(); });
        throw err;
      });
    }).then(function (svg) {
      mermaidCache.set(key, svg);
      if (mermaidCache.size > 120) mermaidCache.delete(mermaidCache.keys().next().value);
      return svg;
    });
    mermaidQueue = job.catch(function () {});
    return job;
  }

  function diagramVariant() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }

  function showDiagramError(w, err) {
    w.classList.remove("loading");
    w.classList.add("mermaid-error");
    w.innerHTML = "";
    var msg = document.createElement("div");
    msg.className = "mermaid-error-msg";
    msg.textContent = tr("mermaid.error", { msg: String((err && (err.message || err.str)) || err).split("\n")[0] });
    var pre = document.createElement("pre");
    pre.textContent = w._code;
    w.appendChild(msg);
    w.appendChild(pre);
  }

  function renderDiagrams() {
    var variant = diagramVariant();
    var jobs = [];
    preview.querySelectorAll(".mermaid-wrap").forEach(function (w) {
      var idx = w.getAttribute("data-mermaid");
      var key = variant + "\u0000" + w._code;
      w.classList.remove("mermaid-error");
      if (mermaidCache.has(key)) {
        w.innerHTML = mermaidCache.get(key);
        lastDiagram[idx] = w.innerHTML;
        return;
      }
      // Keep the previous drawing visible (dimmed) while the new one renders: no flicker while typing
      if (lastDiagram[idx]) w.innerHTML = lastDiagram[idx];
      else w.innerHTML = '<div class="mermaid-placeholder">' + escapeHtml(tr("mermaid.drawing")) + "</div>";
      w.classList.add("loading");
      jobs.push(mermaidSvg(w._code, variant).then(function (svg) {
        if (!w.isConnected) return;
        w.classList.remove("loading");
        w.innerHTML = svg;
        lastDiagram[idx] = svg;
      }, function (err) {
        if (w.isConnected) showDiagramError(w, err);
      }));
    });
    return Promise.all(jobs);
  }

  function svgSize(svgEl) {
    var vb = (svgEl.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    var w = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(svgEl.getAttribute("width")) || 600;
    var h = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(svgEl.getAttribute("height")) || 400;
    return { w: w, h: h };
  }

  // SVG -> PNG data URL (Word and rich-text paste targets do not handle inline SVG)
  function svgToPng(svgText) {
    return new Promise(function (resolve, reject) {
      var doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      var svg = doc.documentElement;
      var size = svgSize(svg);
      svg.setAttribute("width", size.w);
      svg.setAttribute("height", size.h);
      svg.removeAttribute("style");
      var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
      var img = new Image();
      img.onload = function () {
        var scale = 2, c = document.createElement("canvas");
        c.width = Math.ceil(size.w * scale);
        c.height = Math.ceil(size.h * scale);
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        try { resolve({ src: c.toDataURL("image/png"), w: Math.round(size.w), h: Math.round(size.h) }); }
        catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("svg to png failed")); };
      img.src = url;
    });
  }

  // Replace ```mermaid code blocks inside a container with diagrams.
  // format: "svg" (HTML export) or "png" (Word / clipboard). Blocks that fail stay as code.
  function embedDiagrams(container, format) {
    var codes = Array.prototype.slice.call(container.querySelectorAll("pre > code.language-mermaid"));
    var wraps = Array.prototype.slice.call(container.querySelectorAll(".mermaid-wrap"));
    var items = codes.map(function (c) { return { el: c.parentNode, code: c.textContent }; })
      .concat(wraps.map(function (w) { return { el: w, code: w._code || (w.querySelector("pre") || {}).textContent || "" }; }));
    if (!items.length) return Promise.resolve(container);
    return Promise.all(items.map(function (it) {
      if (!it.code) return null;
      return mermaidSvg(it.code, format === "png" ? "export" : "light").then(function (svg) {
        if (format !== "png") {
          var box = document.createElement("div");
          box.className = "mermaid-diagram";
          box.innerHTML = svg;
          it.el.replaceWith(box);
          return;
        }
        return svgToPng(svg).then(function (png) {
          var img = document.createElement("img");
          img.src = png.src;
          img.width = Math.min(png.w, 680);
          img.alt = tr("mermaid.alt");
          var p = document.createElement("p");
          p.appendChild(img);
          it.el.replaceWith(p);
        });
      }).catch(function () {
        if (it.el.classList && it.el.classList.contains("mermaid-wrap")) {
          var pre = document.createElement("pre");
          var code = document.createElement("code");
          code.textContent = it.code;
          pre.appendChild(code);
          it.el.replaceWith(pre);
        }
      });
    })).then(function () { return container; });
  }

  function buildHtmlWithDiagrams(src, format) {
    var div = document.createElement("div");
    div.innerHTML = buildHtml(src);
    return Promise.all([embedDiagrams(div, format), renderMath(div)]).then(function () { return div.innerHTML; });
  }

  function render() {
    hideBlockBtn(); // block references become stale after re-render
    clearSearchHighlight();
    var src = editor.value || "";
    var tokens = src.trim() ? marked.lexer(src, MD_OPTS) : [];
    preview.innerHTML = tokens.length ? marked.parser(tokens, MD_OPTS) : "";
    mapBlocks(src, tokens);
    addHeadingIds(preview);
    enhanceAlerts(preview);
    highlight(preview);
    enhancePreview();
    buildOutline();
  }

  // Tag each top-level rendered block with its start offset in the source (data-src),
  // so search results can jump to the exact block in the preview.
  function mapBlocks(src, tokens) {
    var pos = 0, k = 0, kids = preview.children;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var at = t.raw ? src.indexOf(t.raw, pos) : -1;
      if (at >= 0) pos = at + t.raw.length;
      if (t.type === "space" || t.type === "def") continue;
      if (t.type === "html") return; // raw HTML may render any number of elements
      var el = kids[k++];
      if (!el) return;
      if (at >= 0) el.setAttribute("data-src", String(at));
    }
  }

  function enhancePreview() {
    renderMath(preview);
    // ```mermaid blocks become diagram containers (rendered asynchronously)
    preview.querySelectorAll("pre > code.language-mermaid").forEach(function (code, i) {
      var pre = code.parentNode;
      var w = document.createElement("div");
      w.className = "mermaid-wrap";
      w.setAttribute("data-mermaid", String(i));
      w._code = code.textContent;
      if (pre.hasAttribute("data-src")) w.setAttribute("data-src", pre.getAttribute("data-src"));
      pre.replaceWith(w);
    });
    renderDiagrams();

    preview.querySelectorAll("pre").forEach(function (pre) {
      var wrap = document.createElement("div");
      wrap.className = "code-wrap";
      if (pre.parentNode === preview && pre.hasAttribute("data-src")) {
        wrap.setAttribute("data-src", pre.getAttribute("data-src"));
        pre.removeAttribute("data-src");
      }
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.textContent = tr("copy");
      btn.addEventListener("click", function () {
        var code = pre.querySelector("code") || pre;
        copyText(code.textContent).then(function () {
          btn.textContent = tr("copied");
          btn.classList.add("done");
          setTimeout(function () { btn.textContent = tr("copy"); btn.classList.remove("done"); }, 1500);
        }, function () { toast(tr("copyFail"), { type: "error" }); });
      });
      wrap.appendChild(btn);
    });

    preview.querySelectorAll('input[type="checkbox"]').forEach(function (cb, i) {
      cb.disabled = false;
      cb.title = tr("task.title");
      cb.addEventListener("change", function () { toggleTask(i, cb.checked); });
    });

    preview.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (/^https?:\/\//i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      } else if (href.charAt(0) === "#") {
        a.addEventListener("click", function (e) {
          var id;
          try { id = decodeURIComponent(href.slice(1)); } catch (x) { id = href.slice(1); }
          var el = document.getElementById(id) || document.getElementById(slug(id));
          if (el && preview.contains(el)) {
            e.preventDefault();
            scrollPreviewTo(el);
          }
        });
      }
    });
  }

  // Map the n-th rendered checkbox back to the n-th task marker in the source
  function toggleTask(index, checked) {
    var v = editor.value;
    var re = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])\]/;
    var pos = 0, n = 0, inFence = false;
    var lines = v.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^ {0,3}(```|~~~)/.test(line)) inFence = !inFence;
      else if (!inFence) {
        var m = line.match(re);
        if (m) {
          if (n === index) {
            var at = pos + m[1].length;
            applyEdit(at, at + 1, checked ? "x" : " ", null, null, true);
            return;
          }
          n++;
        }
      }
      pos += line.length + 1;
    }
  }

  // ---------- outline ----------
  var outlineHeadings = [];
  function buildOutline() {
    var source = app.dataset.mode === "pro" ? proEditor : preview;
    outlineHeadings = Array.prototype.slice.call(source.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    outlineList.innerHTML = "";
    outlineHeadings.forEach(function (h) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.className = "lvl-" + h.tagName.charAt(1);
      b.textContent = h.textContent;
      b.title = h.textContent;
      b.addEventListener("click", function () { goToHeading(h); });
      li.appendChild(b);
      outlineList.appendChild(li);
    });
    $("outline-empty").hidden = outlineHeadings.length > 0;
    updateOutlineCurrent();
  }

  function scrollPreviewTo(el) {
    paneView.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior: "smooth" });
  }

  function goToHeading(h) {
    if (app.dataset.mode !== "edit") {
      scrollPreviewTo(h);
    } else {
      // Find the heading line in the source and move the caret there
      var text = h.textContent.trim();
      var lines = editor.value.split("\n"), pos = 0;
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/);
        if (m && m[1].replace(/[*_`~]/g, "").trim() === text) {
          editor.blur();
          editor.setSelectionRange(pos, pos);
          editor.focus();
          break;
        }
        pos += lines[i].length + 1;
      }
    }
    if (isMobile()) setOutline(false);
  }

  var outlineRaf = 0;
  function updateOutlineCurrent() {
    outlineRaf = 0;
    if (outline.hidden) return;
    var top = paneView.scrollTop + 40, idx = -1;
    for (var i = 0; i < outlineHeadings.length; i++) {
      if (outlineHeadings[i].offsetTop <= top) idx = i; else break;
    }
    if (idx < 0 && outlineHeadings.length) idx = 0;
    var btns = outlineList.querySelectorAll("button");
    btns.forEach(function (b, i) { b.classList.toggle("current", i === idx); });
  }

  function setOutline(show) {
    prefs.outline = show;
    outline.hidden = !show;
    $("btn-outline").setAttribute("aria-pressed", String(show));
    if (!isMobile()) savePrefs();
    if (show) updateOutlineCurrent();
  }

  // ---------- sidebar list ----------
  function relTime(ts) {
    var diff = (Date.now() - ts) / 1000;
    if (diff < 45) return tr("time.now");
    if (diff < 3600) return tr("time.min", { n: Math.max(1, Math.round(diff / 60)) });
    var d = new Date(ts), now = new Date();
    var hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return tr("time.today", { hm: hm });
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return tr("time.yesterday", { hm: hm });
    return d.toLocaleDateString(window.I18N.locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function fullTime(ts) {
    return new Date(ts).toLocaleString(window.I18N.locale, {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function iconButton(name, label, cls, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn" + (cls ? " " + cls : "");
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(name));
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
    return b;
  }

  function docMatches(d, q) {
    return !q || fold(getTitle(d)).indexOf(q) >= 0 || fold(d.content).indexOf(q) >= 0;
  }

  function renderList() {
    var q = fold(searchInput.value.trim());
    var all = sortedDocs();
    var shown = 0;
    docList.innerHTML = "";
    docList.dataset.drop = ""; // empty list area = move out of folders

    sortedFolders().forEach(function (f) {
      var nameHit = !!q && fold(f.name).indexOf(q) >= 0;
      var total = all.filter(function (d) { return d.folderId === f.id; });
      var inF = total.filter(function (d) { return nameHit || docMatches(d, q); });
      if (q && !nameHit && !inF.length) return;
      shown += inF.length;
      docList.appendChild(renderFolder(f, inF, total.length, q));
    });

    var rootDocs = all.filter(function (d) { return !folderOf(d) && docMatches(d, q); });
    if (folders.length && rootDocs.length) {
      var label = document.createElement("li");
      label.className = "root-label";
      label.textContent = tr("noFolder");
      docList.appendChild(label);
    }
    rootDocs.forEach(function (d) { docList.appendChild(renderDocItem(d)); });
    shown += rootDocs.length;

    if (trash.length) {
      var trashHits = trash.filter(function (d) { return docMatches(d, q); });
      if (!q || trashHits.length) docList.appendChild(renderTrashSection(trashHits, q));
    }
    var sepTrash = $("sep-trash"), btnEmptyTrash = $("btn-empty-trash");
    if (sepTrash) sepTrash.hidden = !trash.length;
    if (btnEmptyTrash) btnEmptyTrash.hidden = !trash.length;

    $("doc-empty").hidden = docList.children.length > 0;
    $("doc-count").textContent = (q ? shown + " / " : "") + tr("count.docs", { n: docs.length }) +
      (folders.length ? " · " + tr("count.folders", { n: folders.length }) : "");
  }

  function renderTrashSection(items, q) {
    var collapsed = trashCollapsed && !q;
    var li = document.createElement("li");
    li.className = "folder trash-section" + (collapsed ? " collapsed" : "");

    var head = document.createElement("div");
    head.className = "folder-head";
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "folder-toggle";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    var chev = icon("chevron-right");
    chev.classList.add("chev");
    var tic = icon("trash");
    tic.classList.add("fi");
    var name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = tr("trash.heading");
    var count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = trash.length;
    toggle.appendChild(chev);
    toggle.appendChild(tic);
    toggle.appendChild(name);
    toggle.appendChild(count);
    toggle.addEventListener("click", function () {
      if (q) return;
      trashCollapsed = !trashCollapsed;
      renderList();
    });
    head.appendChild(toggle);

    var actions = document.createElement("div");
    actions.className = "folder-actions";
    actions.appendChild(iconButton("trash", tr("trash.emptyAction"), "del", function () { emptyTrash(); }));
    head.appendChild(actions);
    li.appendChild(head);

    var ul = document.createElement("ul");
    ul.className = "folder-docs";
    items.forEach(function (d) {
      var title = getTitle(d);
      var row = document.createElement("li");
      row.className = "doc is-trash";
      var item = document.createElement("button");
      item.type = "button";
      item.className = "doc-item";
      item.title = title;
      var t = document.createElement("span");
      t.className = "doc-title";
      var ts = document.createElement("span");
      ts.textContent = title;
      t.appendChild(ts);
      var sn = document.createElement("span");
      sn.className = "doc-snippet";
      sn.textContent = snippet(d);
      item.appendChild(t);
      item.appendChild(sn);
      item.addEventListener("click", function () { restoreFromTrash(d); });

      var rowActions = document.createElement("div");
      rowActions.className = "doc-actions";
      rowActions.appendChild(iconButton("restore", tr("trash.restore"), "", function () { restoreFromTrash(d); }));
      rowActions.appendChild(iconButton("x", tr("trash.deletePerm"), "del", function () { deleteFromTrash(d); }));

      row.appendChild(item);
      row.appendChild(rowActions);
      ul.appendChild(row);
    });
    li.appendChild(ul);
    return li;
  }

  function renderFolder(folder, items, total, q) {
    var collapsed = folder.collapsed && !q;
    var li = document.createElement("li");
    li.className = "folder" + (collapsed ? " collapsed" : "");
    li.dataset.drop = folder.id;

    var head = document.createElement("div");
    head.className = "folder-head";
    if (renamingId === folder.id) {
      var input = document.createElement("input");
      input.className = "folder-rename";
      input.value = renameDraft;
      input.maxLength = 80;
      input.setAttribute("aria-label", tr("folder.nameAria"));
      input.addEventListener("input", function () { renameDraft = input.value; });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commitRename(folder, input.value); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); renamingId = null; renderList(); }
      });
      input.addEventListener("blur", function () {
        if (renamingId === folder.id) commitRename(folder, input.value, true);
      });
      var fi = icon("folder");
      fi.classList.add("fi");
      head.appendChild(fi);
      head.appendChild(input);
      setTimeout(function () { if (document.body.contains(input)) { input.focus(); input.select(); } }, 0);
    } else {
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "folder-toggle";
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.title = tr("folder.dblRename", { name: folder.name });
      var chev = icon("chevron-right");
      chev.classList.add("chev");
      var fic = icon("folder");
      fic.classList.add("fi");
      var name = document.createElement("span");
      name.className = "folder-name";
      name.textContent = folder.name;
      var count = document.createElement("span");
      count.className = "folder-count";
      count.textContent = total;
      toggle.appendChild(chev);
      toggle.appendChild(fic);
      toggle.appendChild(name);
      toggle.appendChild(count);
      toggle.addEventListener("click", function () {
        if (q) return;
        folder.collapsed = !folder.collapsed;
        persist(true);
        renderList();
      });
      toggle.addEventListener("dblclick", function (e) { e.preventDefault(); startRename(folder); });
      head.appendChild(toggle);

      var actions = document.createElement("div");
      actions.className = "folder-actions";
      actions.appendChild(iconButton("plus", tr("folder.newDoc"), "", function () {
        create("", "", false, folder.id);
      }));
      actions.appendChild(iconButton("edit", tr("folder.rename"), "", function () { startRename(folder); }));
      actions.appendChild(iconButton("trash", tr("folder.delete"), "del", function () { removeFolder(folder); }));
      head.appendChild(actions);
    }
    li.appendChild(head);

    var ul = document.createElement("ul");
    ul.className = "folder-docs";
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "folder-empty";
      empty.textContent = tr("folder.empty");
      ul.appendChild(empty);
    }
    items.forEach(function (d) { ul.appendChild(renderDocItem(d)); });
    li.appendChild(ul);
    return li;
  }

  function renderDocItem(doc) {
      var title = getTitle(doc);
      var li = document.createElement("li");
      li.className = "doc" + (doc === current ? " active" : "");
      li.draggable = true;
      li.addEventListener("dragstart", function (e) {
        draggingDoc = doc;
        e.dataTransfer.setData(DOC_MIME, doc.id);
        e.dataTransfer.effectAllowed = "move";
        li.classList.add("dragging");
        docList.classList.add("drag-active");
        closeMenus();
      });
      li.addEventListener("dragend", endDocDrag);

      var item = document.createElement("button");
      item.className = "doc-item";
      if (doc === current) item.setAttribute("aria-current", "true");
      item.title = title + "\n" + tr("doc.updated", { time: fullTime(doc.updated) });

      var t = document.createElement("span");
      t.className = "doc-title";
      if (doc.pinned) t.appendChild(icon("pin"));
      var ts = document.createElement("span");
      ts.textContent = title;
      t.appendChild(ts);
      var sn = document.createElement("span");
      sn.className = "doc-snippet";
      sn.textContent = snippet(doc);
      var time = document.createElement("span");
      time.className = "doc-time";
      time.textContent = relTime(doc.updated);
      item.appendChild(t);
      item.appendChild(sn);
      item.appendChild(time);
      item.addEventListener("click", function () { open(doc); });

      var actions = document.createElement("div");
      actions.className = "doc-actions";
      var pin = iconButton("pin", doc.pinned ? tr("doc.unpin") : tr("doc.pin"), "", function () { togglePin(doc); });
      pin.setAttribute("aria-pressed", String(!!doc.pinned));
      actions.appendChild(pin);
      var move = iconButton("folder", tr("doc.move"), "", function () { openMoveMenu(doc, move); });
      move.setAttribute("aria-haspopup", "menu");
      actions.appendChild(move);
      actions.appendChild(iconButton("copy", tr("doc.duplicate"), "", function () { duplicate(doc); }));
      actions.appendChild(iconButton("trash", tr("doc.delete", { title: title }), "del", function () { remove(doc); }));

      li.appendChild(item);
      li.appendChild(actions);
      return li;
  }

  // ---------- folders ----------
  var renameDraft = "";
  var pointerIsDown = false;
  document.addEventListener("pointerdown", function () { pointerIsDown = true; }, true);
  document.addEventListener("pointerup", function () { pointerIsDown = false; }, true);

  // Re-render after the current click finishes, so the clicked element is not replaced mid-click
  function renderListAfterPointer() {
    if (!pointerIsDown) { renderList(); return; }
    document.addEventListener("pointerup", function once() {
      document.removeEventListener("pointerup", once, true);
      setTimeout(renderList, 0);
    }, true);
  }

  function createFolder(rename) {
    var f = { id: uid(), name: tr("folder.new"), collapsed: false, created: Date.now() };
    folders.push(f);
    persist();
    if (searchInput.value) searchInput.value = "";
    if (!sidebarVisible()) setSidebar(true);
    if (rename) startRename(f); else renderList();
    return f;
  }

  function startRename(f) {
    renamingId = f.id;
    renameDraft = f.name;
    renderList();
  }

  function commitRename(f, name, fromBlur) {
    renamingId = null;
    name = String(name || "").trim().slice(0, 80);
    if (name && name !== f.name) { f.name = name; persist(); }
    renderTitle();
    if (fromBlur) renderListAfterPointer(); else renderList();
  }

  function removeFolder(f) {
    var ids = docs.filter(function (d) { return d.folderId === f.id; }).map(function (d) { return d.id; });
    folders = folders.filter(function (x) { return x !== f; });
    docs.forEach(function (d) { if (d.folderId === f.id) d.folderId = null; });
    persist();
    renderList();
    renderTitle();
    toast(ids.length ? tr("folder.deletedKept", { name: f.name, n: ids.length }) : tr("folder.deleted", { name: f.name }), {
      timeout: 7000,
      action: {
        label: tr("undo"),
        fn: function () {
          if (folders.indexOf(f) < 0) folders.push(f);
          docs.forEach(function (d) { if (ids.indexOf(d.id) >= 0 && !d.folderId) d.folderId = f.id; });
          persist();
          renderList();
          renderTitle();
        }
      }
    });
  }

  function moveDoc(doc, folderId) {
    folderId = folderId || null;
    if ((doc.folderId || null) === folderId) return;
    var f = findFolder(folderId);
    doc.folderId = f ? f.id : null;
    if (f) f.collapsed = false;
    persist();
    renderList();
    if (doc === current) renderTitle();
    toast(f ? tr("moved.in", { title: getTitle(doc), folder: f.name }) : tr("moved.out", { title: getTitle(doc) }));
  }

  // Floating "move to folder" menu, anchored to a button
  var moveMenu = null;
  function openMoveMenu(doc, anchor) {
    var reopen = moveMenu && moveMenu._anchor === anchor;
    closeMenus();
    if (reopen) return;

    var menu = document.createElement("div");
    menu.className = "menu menu-floating";
    menu.setAttribute("role", "menu");
    menu._anchor = anchor;
    var head = document.createElement("div");
    head.className = "menu-label";
    head.textContent = tr("move.heading");
    menu.appendChild(head);

    function add(label, iconName, checked, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(!!checked));
      var l = document.createElement("span");
      l.className = "mi-label";
      l.appendChild(icon(iconName));
      var t = document.createElement("span");
      t.textContent = label;
      l.appendChild(t);
      b.appendChild(l);
      if (checked) b.appendChild(icon("check"));
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        closeMenus();
        fn();
      });
      menu.appendChild(b);
    }

    sortedFolders().forEach(function (f) {
      add(f.name, "folder", doc.folderId === f.id, function () { moveDoc(doc, f.id); });
    });
    add(tr("noFolder"), "file", !folderOf(doc), function () { moveDoc(doc, null); });
    var sep = document.createElement("div");
    sep.className = "menu-sep";
    menu.appendChild(sep);
    add(tr("move.newFolder"), "folder-plus", false, function () {
      var f = createFolder(false);
      moveDoc(doc, f.id);
      startRename(f);
    });

    menu.addEventListener("click", function (e) { e.stopPropagation(); });
    menu.addEventListener("keydown", function (e) { menuKeys(e, menu, anchor); });
    document.body.appendChild(menu);

    var r = anchor.getBoundingClientRect();
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    menu.style.top = top + "px";
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    anchor.setAttribute("aria-expanded", "true");
    moveMenu = menu;
    var first = menu.querySelector("button");
    if (first) first.focus();
  }

  // ---------- drag documents into folders ----------
  var draggingDoc = null, dropTarget = null, expandTimer = null;

  function isDocDrag(e) {
    return !!draggingDoc && !!e.dataTransfer &&
      Array.prototype.indexOf.call(e.dataTransfer.types || [], DOC_MIME) >= 0;
  }

  function setDropTarget(el) {
    if (dropTarget === el) return;
    if (dropTarget) dropTarget.classList.remove("drop-over");
    clearTimeout(expandTimer);
    dropTarget = el;
    if (!el) return;
    el.classList.add("drop-over");
    if (el.classList.contains("collapsed")) {
      // Hovering a collapsed folder opens it (no full re-render: it would cancel the drag)
      expandTimer = setTimeout(function () {
        var f = findFolder(el.dataset.drop);
        if (f) { f.collapsed = false; el.classList.remove("collapsed"); }
      }, 700);
    }
  }

  function endDocDrag() {
    draggingDoc = null;
    setDropTarget(null);
    docList.classList.remove("drag-active");
    var d = docList.querySelector(".dragging");
    if (d) d.classList.remove("dragging");
  }

  docList.addEventListener("dragover", function (e) {
    var el = e.target.closest ? e.target.closest("[data-drop]") : null;
    if (isDocDrag(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      // Only highlight the root area when the doc is currently inside a folder
      setDropTarget(el === docList && !folderOf(draggingDoc) ? null : el);
    } else if (hasFiles(e)) {
      // Files dropped on a folder open inside that folder
      setDropTarget(el && el.classList.contains("folder") ? el : null);
    }
  });
  docList.addEventListener("dragleave", function (e) {
    if (!e.relatedTarget || !docList.contains(e.relatedTarget)) setDropTarget(null);
  });
  docList.addEventListener("drop", function (e) {
    if (!isDocDrag(e)) return; // files are handled by the window drop handler
    e.preventDefault();
    e.stopPropagation();
    var el = e.target.closest ? e.target.closest("[data-drop]") : null;
    var doc = draggingDoc;
    var collapsedChanged = el && el.classList.contains("folder");
    endDocDrag();
    if (doc && el) {
      if ((doc.folderId || null) === (el.dataset.drop || null)) { if (collapsedChanged) persist(true); renderList(); }
      else moveDoc(doc, el.dataset.drop || null);
    }
  });

  function renderTitle() {
    titleInput.value = getTitle(current);
    titleInput.classList.toggle("auto", !!current.titleAuto);
    btnAutoTitle.hidden = !!current.titleAuto;
    document.title = getTitle(current) + " - " + appName();
    var f = folderOf(current);
    var chip = $("doc-folder");
    $("doc-folder-name").textContent = f ? f.name : tr("noFolder");
    chip.classList.toggle("is-root", !f);
  }

  // ---------- document actions ----------
  function rememberView() {
    if (!current) return;
    viewState[current.id] = {
      s: editor.selectionStart, e: editor.selectionEnd,
      es: editor.scrollTop, vs: paneView.scrollTop
    };
  }

  function open(doc) {
    if (current && current !== doc) rememberView();
    if (current !== doc) lastDiagram = {};
    current = doc;
    editor.value = doc.content;
    try { localStorage.setItem(KEY_ACTIVE, doc.id); } catch (e) {}
    renderTitle();
    renderList();
    if (app.dataset.mode === "pro") refreshProEditor();
    render();
    updateStats();
    if (findBar && !findBar.hidden) { frIndex = -1; computeFindMatches(); }
    var vs = viewState[doc.id];
    syncLock = "restore"; // ignore scroll events from restoring positions
    editor.setSelectionRange(vs ? vs.s : 0, vs ? vs.e : 0);
    editor.scrollTop = vs ? vs.es : 0;
    paneView.scrollTop = vs ? vs.vs : 0;
    releaseSyncSoon();
    if (isMobile()) setSidebar(false);
  }

  function create(content, title, silent, folderId) {
    var f = findFolder(folderId);
    var doc = newDoc(content, f ? f.id : null);
    if (title) { doc.title = title; doc.titleAuto = false; }
    if (f) f.collapsed = false;
    docs.push(doc);
    if (silent) return doc;
    persist();
    if (searchInput.value) searchInput.value = "";
    open(doc);
    if (app.dataset.mode === "pro") proEditor.focus();
    else if (app.dataset.mode !== "view") editor.focus();
    return doc;
  }

  function createFromTemplate(key) {
    var now = new Date();
    var dateStr = now.toLocaleDateString(window.I18N.locale, { day: "2-digit", month: "2-digit", year: "numeric" });
    var content = tr("tpl.content." + key, { date: dateStr, year: String(now.getFullYear()) });
    var folderId = current && current.folderId ? current.folderId : null;
    create(content, "", false, folderId);
    toast(tr("tpl.created", { name: tr("tpl." + key) }));
  }

  function remove(doc) {
    var title = getTitle(doc);
    docs = docs.filter(function (d) { return d !== doc; });
    trash = [doc].concat(trash.filter(function (d) { return d.id !== doc.id; })).slice(0, 40);
    var placeholder = null;
    if (!docs.length) { placeholder = newDoc(""); docs.push(placeholder); }
    if (doc === current) { current = null; open(sortedDocs()[0]); } else renderList();
    persist();
    toast(tr("doc.deleted", { title: title }), {
      timeout: 7000,
      action: {
        label: tr("undo"),
        fn: function () {
          if (placeholder && !placeholder.content && docs.indexOf(placeholder) >= 0) {
            docs = docs.filter(function (d) { return d !== placeholder; });
          }
          trash = trash.filter(function (d) { return d !== doc && d.id !== doc.id; });
          if (docs.indexOf(doc) < 0) docs.push(doc);
          persist();
          open(doc);
        }
      }
    });
  }

  function restoreFromTrash(doc) {
    trash = trash.filter(function (d) { return d !== doc && d.id !== doc.id; });
    if (doc.folderId && !findFolder(doc.folderId)) doc.folderId = null;
    doc.updated = Date.now();
    if (docs.length === 1 && !docs[0].content && docs[0].titleAuto) docs = [doc];
    else if (docs.indexOf(doc) < 0) docs.push(doc);
    persist();
    open(doc);
    toast(tr("trash.restored", { title: getTitle(doc) }));
  }

  function deleteFromTrash(doc) {
    var title = getTitle(doc);
    trash = trash.filter(function (d) { return d !== doc && d.id !== doc.id; });
    persist();
    renderList();
    toast(tr("trash.deletedPerm", { title: title }));
  }

  function emptyTrash() {
    if (!trash.length) return;
    trash = [];
    persist();
    renderList();
    toast(tr("trash.emptied"));
  }

  function duplicate(doc) {
    var copy = newDoc(doc.content, doc.folderId);
    copy.title = getTitle(doc) + tr("doc.copySuffix");
    copy.titleAuto = false;
    docs.push(copy);
    persist();
    open(copy);
    toast(tr("doc.duplicated"));
  }

  function togglePin(doc) {
    doc.pinned = !doc.pinned;
    persist();
    renderList();
  }

  // ---------- mode / layout ----------
  function setMode(mode) {
    if (!tabs[mode]) mode = "split";
    var changed = app.dataset.mode !== mode;
    app.dataset.mode = mode;
    root.setAttribute("data-mode", mode);
    Object.keys(tabs).forEach(function (k) {
      tabs[k].setAttribute("aria-selected", String(k === mode));
    });
    prefs.mode = mode;
    savePrefs();
    closeTablePicker();
    if (mode === "pro") {
      if (changed) refreshProEditor();
      else updateProToolbarState();
    } else {
      hideProFloatingUi();
      updateProToolbarState();
    }
    if (mode === "split") syncScroll(editor, paneView);
    buildOutline();
  }

  function setSidebar(show) {
    if (isMobile()) {
      root.classList.toggle("sidebar-open", show);
    } else {
      prefs.sidebar = show;
      root.classList.toggle("sidebar-collapsed", !show);
      savePrefs();
    }
  }
  function sidebarVisible() {
    return isMobile() ? root.classList.contains("sidebar-open") : !root.classList.contains("sidebar-collapsed");
  }

  function applyTheme() {
    var t = prefs.theme === "auto" ? (mqDark.matches ? "dark" : "light") : prefs.theme;
    var changed = root.getAttribute("data-theme") !== t;
    root.setAttribute("data-theme", t);
    if (changed && preview.querySelector(".mermaid-wrap")) { lastDiagram = {}; renderDiagrams(); }
    var icons = { auto: "monitor", light: "sun", dark: "moon" };
    $("theme-icon").setAttribute("href", "#i-" + icons[prefs.theme]);
    $("btn-theme").title = tr("theme.title", { name: tr("theme." + prefs.theme) });
  }
  function cycleTheme() {
    var order = ["auto", "light", "dark"];
    prefs.theme = order[(order.indexOf(prefs.theme) + 1) % order.length];
    savePrefs();
    applyTheme();
    toast(tr("theme.toast", { name: tr("theme." + prefs.theme) }));
  }

  // ---------- language ----------
  function applyLanguage() {
    window.I18N.setLang(prefs.lang);
    window.I18N.apply();
    $("btn-lang").textContent = window.I18N.lang.toUpperCase();
  }

  function switchLanguage() {
    var langs = window.I18N.languages;
    prefs.lang = langs[(langs.indexOf(window.I18N.lang) + 1) % langs.length];
    savePrefs();
    applyLanguage();
    // Re-render everything that builds text in JS
    applyTheme();
    if (current) {
      renderTitle();
      if (app.dataset.mode === "pro") refreshProEditor();
      render();
      updateStats();
    }
    renderList();
    if (lastSavedAt) setSaveState(tr("saved", { time: lastSavedAt }));
    if (!gsPanel.hidden) renderSearch();
    toast(tr("lang.switched"));
  }

  function applyFont() {
    root.style.setProperty("--fs", String(prefs.fontScale));
    $("font-size").textContent = Math.round(prefs.fontScale * 100) + "%";
  }
  function changeFont(delta) {
    prefs.fontScale = Math.min(1.6, Math.max(0.8, Math.round((prefs.fontScale + delta) * 10) / 10));
    savePrefs();
    applyFont();
  }

  function applySplit() {
    app.style.setProperty("--split", prefs.split + "%");
  }

  // ---------- sync scroll ----------
  var syncLock = null, syncTimer;
  function releaseSyncSoon() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncLock = null; }, 80);
  }
  function syncScroll(src, dst) {
    if (!prefs.sync || app.dataset.mode !== "split" || isMobile()) return;
    if (syncLock && syncLock !== src) return; // event caused by our own scroll
    var max = src.scrollHeight - src.clientHeight;
    var ratio = max > 0 ? src.scrollTop / max : 0;
    syncLock = src;
    dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight);
    releaseSyncSoon();
  }

  // ---------- stats ----------
  function updateStats() {
    var v = editor.value;
    var words = (v.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’_-]*/gu) || []).length;
    $("stat-words").textContent = tr("stat.words", { n: words });
    $("stat-chars").textContent = tr("stat.chars", { n: v.length });
    $("stat-read").textContent = words ? tr("stat.read", { n: Math.max(1, Math.round(words / 200)) }) : "";
    updateCursor();
  }
  function updateCursor() {
    var s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    var line = v.slice(0, s).split("\n").length;
    var col = s - v.lastIndexOf("\n", s - 1);
    $("stat-cursor").textContent = tr("stat.cursor", { line: line, col: col }) + (e > s ? tr("stat.sel", { n: e - s }) : "");
  }

  // ---------- editing helpers ----------
  function onContentChange() {
    current.content = editor.value;
    current.updated = Date.now();
    if (current.titleAuto) renderTitle();
    persistSoon();
    updateStats();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { render(); renderList(); }, 150);
  }
  var renderTimer;

  // Replace a range while keeping native undo (Ctrl+Z) when possible
  // direct=true edits in place without moving focus/caret (used by preview checkboxes)
  function applyEdit(start, end, text, selStart, selEnd, direct) {
    var visible = !direct && editor.offsetParent !== null;
    if (visible) {
      var before = editor.value;
      editor.focus();
      editor.setSelectionRange(start, end);
      try { document.execCommand("insertText", false, text); } catch (e) {}
      var changed = editor.value !== before || (start === end && !text);
      if (!changed) {
        editor.setRangeText(text, start, end, "end");
        onContentChange();
      }
      var a = selStart == null ? start + text.length : selStart;
      editor.setSelectionRange(a, selEnd == null ? a : selEnd);
    } else {
      editor.setRangeText(text, start, end, "preserve");
      onContentChange();
    }
  }

  function wrap(before, after, placeholder) {
    var s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    var selected = v.slice(s, e);
    var surrounded = v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after &&
      !(before === "*" && v.charAt(s - 2) === "*" && v.charAt(s - 3) !== "*");
    if (surrounded) {
      applyEdit(s - before.length, e + after.length, selected, s - before.length, e - before.length);
      return;
    }
    if (selected.length >= before.length + after.length && selected.indexOf(before) === 0 &&
        selected.slice(-after.length) === after && selected.length > before.length) {
      var inner = selected.slice(before.length, selected.length - after.length);
      applyEdit(s, e, inner, s, s + inner.length);
      return;
    }
    var text = selected || placeholder;
    applyEdit(s, e, before + text + after, s + before.length, s + before.length + text.length);
  }

  function lineRange() {
    var v = editor.value, s = editor.selectionStart, e = editor.selectionEnd;
    var ls = v.lastIndexOf("\n", s - 1) + 1;
    var endAt = e > s && v.charAt(e - 1) === "\n" ? e - 1 : e;
    var le = v.indexOf("\n", endAt);
    if (le < 0) le = v.length;
    return { start: ls, end: le, text: v.slice(ls, le) };
  }

  var LIST_RE = /^(\s*)(?:[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/;
  function stripList(l) { return l.replace(LIST_RE, "$1"); }

  function toggleLines(test, strip, make) {
    var r = lineRange();
    var lines = r.text.split("\n");
    var filled = lines.filter(function (l) { return l.trim(); });
    var all = filled.length > 0 && filled.every(test);
    var k = 0;
    var out = lines.map(function (l) {
      if (!l.trim() && lines.length > 1) return l;
      return all ? strip(l) : make(l, k++);
    });
    var text = out.join("\n");
    if (lines.length === 1) applyEdit(r.start, r.end, text);
    else applyEdit(r.start, r.end, text, r.start, r.start + text.length);
  }

  function insertBlock(block, selFrom, selTo) {
    var s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    var pre = s === 0 ? "" : v.charAt(s - 1) !== "\n" ? "\n\n" : (s > 1 && v.charAt(s - 2) !== "\n" ? "\n" : "");
    var post = e < v.length && v.charAt(e) !== "\n" ? "\n\n" : (e >= v.length ? "\n" : "");
    var base = s + pre.length;
    applyEdit(s, e, pre + block + post, base + selFrom, base + (selTo == null ? selFrom : selTo));
  }

  var commands = {
    bold: function () { wrap("**", "**", tr("ph.bold")); },
    italic: function () { wrap("*", "*", tr("ph.italic")); },
    strike: function () { wrap("~~", "~~", tr("ph.strike")); },
    code: function () { wrap("`", "`", "code"); },
    heading: function () {
      var r = lineRange();
      var first = r.text.split("\n")[0];
      var m = first.match(/^(#{1,6})[ \t]+/);
      var level = m ? m[1].length : 0;
      var next = level >= 3 ? 0 : level + 1;
      var line = (next ? "######".slice(0, next) + " " : "") + first.replace(/^#{1,6}[ \t]+/, "");
      var end = r.start + first.length;
      applyEdit(r.start, end, line);
    },
    quote: function () {
      toggleLines(function (l) { return /^\s*>/.test(l); },
        function (l) { return l.replace(/^(\s*)>[ \t]?/, "$1"); },
        function (l) { return "> " + l; });
    },
    ul: function () {
      toggleLines(function (l) { return /^\s*[-*+][ \t]+(?!\[[ xX]\])/.test(l); },
        stripList, function (l) { return stripList(l).replace(/^(\s*)/, "$1- "); });
    },
    ol: function () {
      toggleLines(function (l) { return /^\s*\d+[.)][ \t]+/.test(l); },
        stripList, function (l, i) { return stripList(l).replace(/^(\s*)/, "$1" + (i + 1) + ". "); });
    },
    task: function () {
      toggleLines(function (l) { return /^\s*[-*+][ \t]+\[[ xX]\]/.test(l); },
        stripList, function (l) { return stripList(l).replace(/^(\s*)/, "$1- [ ] "); });
    },
    link: function () {
      var s = editor.selectionStart, e = editor.selectionEnd, sel = editor.value.slice(s, e);
      if (/^(https?:\/\/|www\.)\S+$/i.test(sel)) {
        var lt = tr("ph.linkText");
        applyEdit(s, e, "[" + lt + "](" + sel + ")", s + 1, s + 1 + lt.length);
      } else {
        var text = sel || tr("ph.linkText");
        var at = s + text.length + 3;
        applyEdit(s, e, "[" + text + "](https://)", at, at + 8);
      }
    },
    image: function () {
      var s = editor.selectionStart, e = editor.selectionEnd, alt = editor.value.slice(s, e) || tr("ph.alt");
      var at = s + alt.length + 4;
      applyEdit(s, e, "![" + alt + "](https://)", at, at + 8);
    },
    codeblock: function () {
      var sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
      if (sel) insertBlock("```\n" + sel.replace(/\n$/, "") + "\n```", 3, 3);
      else insertBlock("```\n\n```", 4, 4);
    },
    table: function () {
      insertBlock(tr("ph.table"), 2, 2 + tr("ph.tableSel").length);
    },
    alert: function () {
      var types = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];
      var r = lineRange();
      var lines = r.text.split("\n");
      var m = lines[0].match(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i);
      if (m) {
        var idx = types.indexOf(m[1].toUpperCase());
        if (idx < types.length - 1) {
          lines[0] = "> [!" + types[idx + 1] + "]";
          var nextText = lines.join("\n");
          applyEdit(r.start, r.end, nextText, r.start, r.start + nextText.length);
        } else {
          var stripped = lines.slice(1).map(function (l) { return l.replace(/^\s*>[ \t]?/, ""); }).join("\n");
          applyEdit(r.start, r.end, stripped, r.start, r.start + stripped.length);
        }
        return;
      }
      var body = lines.map(function (l) { return "> " + (l.replace(/^\s*>[ \t]?/, "") || "Note"); }).join("\n");
      var block = "> [!NOTE]\n" + body;
      applyEdit(r.start, r.end, block, r.start + 12, r.start + block.length);
    },
    math: function () {
      var s = editor.selectionStart, e = editor.selectionEnd, sel = editor.value.slice(s, e);
      if (sel.indexOf("\n") >= 0) {
        insertBlock("$$\n" + sel.replace(/\n$/, "") + "\n$$", 3, 3 + sel.length);
      } else if (sel) {
        wrap("$", "$", "E = mc^2");
      } else {
        var r = lineRange();
        if (!r.text.trim()) insertBlock("$$\nE = mc^2\n$$", 3, 11);
        else wrap("$", "$", "E = mc^2");
      }
    },
    find: function () {
      openFindBar();
    },
    hr: function () { insertBlock("---", 3, 3); }
  };

  var proSavedRange = null;
  var proTableBar = $("pro-table-bar");
  var proAddRowEdge = $("pro-add-row-edge");
  var proAddColEdge = $("pro-add-col-edge");
  var proMediaBar = $("pro-media-bar");
  var activeProCell = null;
  var activeProTable = null;
  var activeProMedia = null;
  var tablePicker = null;

  function rememberProSelection() {
    var selection = window.getSelection();
    if (selection && selection.rangeCount && proEditor.contains(selection.anchorNode) &&
        proEditor.contains(selection.focusNode)) {
      proSavedRange = selection.getRangeAt(0).cloneRange();
    }
    if (app.dataset.mode === "pro") {
      updateProContextUi();
      updateProToolbarState();
    }
  }

  function restoreProSelection() {
    var selection = window.getSelection();
    proEditor.focus();
    if (!selection) return;
    selection.removeAllRanges();
    if (proSavedRange && proEditor.contains(proSavedRange.commonAncestorContainer)) {
      selection.addRange(proSavedRange);
    } else if (activeProCell && proEditor.contains(activeProCell)) {
      var cellRange = document.createRange();
      cellRange.selectNodeContents(activeProCell);
      cellRange.collapse(false);
      selection.addRange(cellRange);
    } else {
      var range = document.createRange();
      range.selectNodeContents(proEditor);
      range.collapse(false);
      selection.addRange(range);
    }
  }

  function enhanceProNodes(container) {
    container.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.disabled = false; });
    container.querySelectorAll(".markdown-alert-title").forEach(function (t) {
      t.setAttribute("contenteditable", "false");
      t.title = tr("pro.alertClickTitle");
    });
    container.querySelectorAll("[data-math]").forEach(function (m) {
      m.setAttribute("contenteditable", "false");
      m.title = tr("tb.math");
    });
    renderMath(container);
  }

  function refreshProEditor() {
    proEditor.innerHTML = buildHtml(editor.value);
    enhanceProNodes(proEditor);
    proSavedRange = null;
    hideProFloatingUi();
    updateProToolbarState();
  }

  function escapeMarkdownText(text) {
    return String(text).replace(/([\\`*_{}\[\]<>#+.!|()-])/g, "\\$1");
  }

  function markdownUrl(url) {
    return String(url || "").replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  }

  function stripProUiAttrs(el) {
    var clone = el.cloneNode(true);
    clone.classList.remove("pro-active-table", "pro-active-cell", "pro-active-media");
    if (!clone.className) clone.removeAttribute("class");
    clone.querySelectorAll(".pro-active-table, .pro-active-cell, .pro-active-media").forEach(function (n) {
      n.classList.remove("pro-active-table", "pro-active-cell", "pro-active-media");
      if (!n.className) n.removeAttribute("class");
    });
    return clone;
  }

  function proInline(node) {
    if (node.nodeType === 3) return escapeMarkdownText(node.nodeValue);
    if (node.nodeType !== 1) return "";
    var tag = node.tagName.toLowerCase();
    if (node.hasAttribute("data-math")) {
      var mCode = node.getAttribute("data-math") || "";
      return node.classList.contains("math-block") ? "\n\n$$\n" + mCode + "\n$$\n\n" : "$" + mCode + "$";
    }
    if (tag === "br") return "  \n";
    if (tag === "input") return "";
    if (node.hasAttribute("style") || tag === "font") return sanitizePastedHtml(stripProUiAttrs(node).outerHTML);

    var content = Array.prototype.map.call(node.childNodes, proInline).join("");
    if (tag === "b" || tag === "strong") return "**" + content + "**";
    if (tag === "i" || tag === "em") return "*" + content + "*";
    if (tag === "s" || tag === "strike" || tag === "del") return "~~" + content + "~~";
    if (tag === "u" || tag === "sub" || tag === "sup") return sanitizePastedHtml(stripProUiAttrs(node).outerHTML);
    if (tag === "code") {
      var ticks = (node.textContent.match(/`+/g) || []).reduce(function (n, s) { return Math.max(n, s.length); }, 0) + 1;
      var fence = new Array(ticks + 1).join("`");
      return fence + node.textContent + fence;
    }
    if (tag === "a" && node.getAttribute("href")) {
      return "[" + content + "](" + markdownUrl(node.getAttribute("href")) + ")";
    }
    if (tag === "img" && node.getAttribute("src")) {
      if (node.hasAttribute("width") || node.hasAttribute("height")) {
        return sanitizePastedHtml(stripProUiAttrs(node).outerHTML);
      }
      return "![" + escapeMarkdownText(node.getAttribute("alt") || "") + "](" + markdownUrl(node.getAttribute("src")) + ")";
    }
    return content;
  }

  function proBlock(node) {
    if (node.nodeType === 3) return escapeMarkdownText(node.nodeValue).trim();
    if (node.nodeType !== 1) return "";
    var tag = node.tagName.toLowerCase();
    if (node.hasAttribute("data-math")) {
      var mathCode = node.getAttribute("data-math") || "";
      return node.classList.contains("math-block") ? "$$\n" + mathCode + "\n$$" : "$" + mathCode + "$";
    }
    if (node.classList.contains("markdown-alert")) {
      var aType = (node.getAttribute("data-alert") || "note").toUpperCase();
      var aBody = Array.prototype.filter.call(node.childNodes, function (c) {
        return !(c.nodeType === 1 && c.classList.contains("markdown-alert-title"));
      }).map(proBlock).filter(Boolean).join("\n\n");
      var aLines = aBody ? aBody.split("\n").map(function (l) { return "> " + l; }).join("\n") : "> ";
      return "> [!" + aType + "]\n" + aLines;
    }
    if (tag !== "table" && (node.hasAttribute("style") || node.hasAttribute("align"))) {
      return sanitizePastedHtml(stripProUiAttrs(node).outerHTML);
    }
    if (/^h[1-6]$/.test(tag)) {
      return new Array(+tag.charAt(1) + 1).join("#") + " " +
        Array.prototype.map.call(node.childNodes, proInline).join("").trim();
    }
    if (tag === "p") return Array.prototype.map.call(node.childNodes, proInline).join("").trim();
    if (tag === "div") {
      return Array.prototype.map.call(node.childNodes, proBlock).filter(Boolean).join("\n\n");
    }
    if (tag === "ul" || tag === "ol") return proList(node, 0);
    if (tag === "blockquote") {
      var quote = Array.prototype.map.call(node.childNodes, proBlock).filter(Boolean).join("\n\n");
      return quote.split("\n").map(function (line) { return "> " + line; }).join("\n");
    }
    if (tag === "pre") {
      var code = node.querySelector("code");
      var text = (code || node).textContent.replace(/\n$/, "");
      var ticks = (text.match(/`+/g) || []).reduce(function (n, s) { return Math.max(n, s.length); }, 2) + 1;
      var fence = new Array(ticks + 1).join("`");
      var language = code && (code.className.match(/(?:^|\s)language-([\w+-]+)/) || [])[1];
      return fence + (language || "") + "\n" + text + "\n" + fence;
    }
    if (tag === "hr") return "---";
    if (tag === "table") return proTable(node);
    return proInline(node).trim();
  }

  function proList(list, depth) {
    var ordered = list.tagName.toLowerCase() === "ol";
    var start = parseInt(list.getAttribute("start") || "1", 10) || 1;
    var items = Array.prototype.filter.call(list.children, function (child) { return child.tagName.toLowerCase() === "li"; });
    return items.map(function (item, index) {
      var nested = [], parts = [], checked = null;
      Array.prototype.forEach.call(item.childNodes, function (child) {
        if (child.nodeType === 1 && /^(ul|ol)$/i.test(child.tagName)) nested.push(child);
        else if (child.nodeType === 1 && child.tagName.toLowerCase() === "input" &&
            child.type === "checkbox") checked = child.checked;
        else if (child.nodeType === 1 && /^(p|div)$/i.test(child.tagName)) parts.push("\n" + proBlock(child) + "\n");
        else parts.push(proInline(child));
      });
      var body = parts.join("").replace(/\n{2,}/g, "\n").trim();
      var indent = new Array(depth + 1).join("  ");
      var marker = ordered ? (start + index) + ". " : "- ";
      if (checked !== null) marker += checked ? "[x] " : "[ ] ";
      var lines = body.split("\n");
      var result = indent + marker + (lines[0] || "");
      for (var i = 1; i < lines.length; i++) result += "\n" + indent + "  " + lines[i];
      nested.forEach(function (child) { result += "\n" + proList(child, depth + 1); });
      return result;
    }).join("\n");
  }

  function getCellAlign(cell) {
    if (!cell) return "";
    var a = (cell.getAttribute("align") || (cell.style && cell.style.textAlign) || "").toLowerCase().trim();
    return (a === "left" || a === "center" || a === "right") ? a : "";
  }

  function hasComplexTableHtml(table) {
    if (table.hasAttribute("style") || table.hasAttribute("align") || table.hasAttribute("bgcolor")) return true;
    if (table.querySelector("[colspan], [rowspan], [bgcolor]")) return true;
    var styled = table.querySelectorAll("[style]");
    for (var i = 0; i < styled.length; i++) {
      var st = styled[i].getAttribute("style") || "";
      var rest = st.replace(/text-align\s*:\s*(?:left|center|right|justify)\s*;?/gi, "").trim();
      if (rest) return true;
    }
    return false;
  }

  function proTable(table) {
    if (hasComplexTableHtml(table)) {
      return sanitizePastedHtml(stripProUiAttrs(table).outerHTML);
    }
    var rawRows = Array.prototype.slice.call(table.rows);
    var rows = rawRows.map(function (row) {
      return Array.prototype.map.call(row.cells, function (cell) {
        return Array.prototype.map.call(cell.childNodes, proInline).join("")
          .replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim();
      });
    }).filter(function (row) { return row.length; });
    if (!rows.length) return "";
    var width = rows.reduce(function (n, row) { return Math.max(n, row.length); }, 0);
    var aligns = [];
    for (var c = 0; c < width; c++) {
      var colAlign = "";
      for (var r = 0; r < rawRows.length; r++) {
        var ca = getCellAlign(rawRows[r].cells[c]);
        if (ca) { colAlign = ca; break; }
      }
      aligns.push(colAlign === "center" ? ":---:" : colAlign === "right" ? "---:" : colAlign === "left" ? ":---" : "---");
    }
    function renderRow(row) {
      while (row.length < width) row.push("");
      return "| " + row.join(" | ") + " |";
    }
    return [renderRow(rows[0]), renderRow(aligns)]
      .concat(rows.slice(1).map(renderRow)).join("\n");
  }

  function proMarkdown() {
    return Array.prototype.map.call(proEditor.childNodes, proBlock).filter(Boolean)
      .join("\n\n").replace(/^\s+|\s+$/g, "");
  }

  function syncProToMarkdown() {
    var content = proMarkdown();
    if (editor.value === content) return;
    editor.value = content;
    onContentChange();
  }

  // ---------- Pro Contextual UI (Table bar, Edge buttons, Media bar, Toolbar state) ----------
  function clearProTableHighlights() {
    proEditor.querySelectorAll(".pro-active-table").forEach(function (el) { el.classList.remove("pro-active-table"); });
    proEditor.querySelectorAll(".pro-active-cell").forEach(function (el) { el.classList.remove("pro-active-cell"); });
  }

  function clearProMediaHighlights() {
    proEditor.querySelectorAll(".pro-active-media").forEach(function (el) { el.classList.remove("pro-active-media"); });
  }

  function hideProFloatingUi() {
    clearProTableHighlights();
    clearProMediaHighlights();
    activeProCell = null;
    activeProTable = null;
    activeProMedia = null;
    if (proTableBar) proTableBar.hidden = true;
    if (proAddRowEdge) proAddRowEdge.hidden = true;
    if (proAddColEdge) proAddColEdge.hidden = true;
    if (proMediaBar) proMediaBar.hidden = true;
  }

  function positionProTableUi() {
    if (!activeProTable || !proEditor.contains(activeProTable) || app.dataset.mode !== "pro") {
      if (proTableBar) proTableBar.hidden = true;
      if (proAddRowEdge) proAddRowEdge.hidden = true;
      if (proAddColEdge) proAddColEdge.hidden = true;
      return;
    }
    var viewRect = paneView.getBoundingClientRect();
    var tblRect = activeProTable.getBoundingClientRect();
    var scrollTop = paneView.scrollTop;
    var scrollLeft = paneView.scrollLeft;

    var tblTop = tblRect.top - viewRect.top + scrollTop;
    var tblLeft = tblRect.left - viewRect.left + scrollLeft;
    var tblWidth = tblRect.width;
    var tblHeight = tblRect.height;

    proTableBar.hidden = false;
    var barH = proTableBar.offsetHeight || 36;
    var barW = proTableBar.offsetWidth || 320;
    var idealTop = tblTop - barH - 8;
    if (idealTop < scrollTop + 6) {
      idealTop = Math.min(tblTop + tblHeight - barH - 6, Math.max(tblTop + 4, scrollTop + 6));
    }
    var idealLeft = Math.max(12, Math.min(tblLeft, paneView.clientWidth - barW - 12));
    proTableBar.style.top = Math.max(4, idealTop) + "px";
    proTableBar.style.left = idealLeft + "px";

    // Edge "+" button for adding a row at the bottom
    proAddRowEdge.hidden = false;
    proAddRowEdge.style.top = (tblTop + tblHeight + 2) + "px";
    proAddRowEdge.style.left = tblLeft + "px";
    proAddRowEdge.style.width = tblWidth + "px";
    proAddRowEdge.style.height = "20px";

    // Edge "+" button for adding a column at the right
    proAddColEdge.hidden = false;
    proAddColEdge.style.top = tblTop + "px";
    proAddColEdge.style.left = (tblLeft + tblWidth + 2) + "px";
    proAddColEdge.style.width = "20px";
    proAddColEdge.style.height = tblHeight + "px";

    // Highlight active column alignment in table bar
    var curAlign = getCellAlign(activeProCell);
    proTableBar.querySelectorAll("[data-table-cmd^='col-align-']").forEach(function (btn) {
      var a = btn.getAttribute("data-table-cmd").replace("col-align-", "");
      btn.classList.toggle("is-active", curAlign === a);
    });
  }

  function positionProMediaUi() {
    if (!activeProMedia || !proEditor.contains(activeProMedia) || app.dataset.mode !== "pro") {
      if (proMediaBar) proMediaBar.hidden = true;
      return;
    }
    var viewRect = paneView.getBoundingClientRect();
    var mRect = activeProMedia.getBoundingClientRect();
    var mTop = mRect.top - viewRect.top + paneView.scrollTop;
    var mLeft = mRect.left - viewRect.left + paneView.scrollLeft;

    proMediaBar.hidden = false;
    var barH = proMediaBar.offsetHeight || 34;
    var barW = proMediaBar.offsetWidth || 220;
    var top = mTop - barH - 6;
    if (top < paneView.scrollTop + 6) top = mTop + mRect.height + 6;
    var left = Math.max(12, Math.min(mLeft, paneView.clientWidth - barW - 12));
    proMediaBar.style.top = Math.max(4, top) + "px";
    proMediaBar.style.left = left + "px";
  }

  function showProMediaBarFor(el) {
    clearProMediaHighlights();
    activeProMedia = el;
    if (!el) { proMediaBar.hidden = true; return; }
    proMediaBar.innerHTML = "";
    if (el.tagName === "A") {
      var href = el.getAttribute("href") || "";
      var u = document.createElement("span");
      u.className = "ptb-url";
      u.textContent = href;
      u.title = href;
      proMediaBar.appendChild(u);

      var btnOpen = document.createElement("button");
      btnOpen.type = "button";
      btnOpen.textContent = "↗ " + tr("pmb.openLink");
      btnOpen.addEventListener("click", function () {
        if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) window.open(href, "_blank", "noopener");
      });
      proMediaBar.appendChild(btnOpen);

      var btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.textContent = tr("pmb.editLink");
      btnEdit.addEventListener("click", function () {
        var next = window.prompt(tr("pro.linkPrompt"), el.getAttribute("href") || "https://");
        if (!next) return;
        var safe = safePasteUrl(next, false);
        if (!safe) { toast(tr("pro.invalidUrl"), { type: "error" }); return; }
        el.setAttribute("href", safe);
        syncProToMarkdown();
        showProMediaBarFor(el);
      });
      proMediaBar.appendChild(btnEdit);

      var btnUnlink = document.createElement("button");
      btnUnlink.type = "button";
      btnUnlink.className = "ptb-del";
      btnUnlink.textContent = tr("pmb.unlink");
      btnUnlink.addEventListener("click", function () {
        var parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
        hideProFloatingUi();
        syncProToMarkdown();
      });
      proMediaBar.appendChild(btnUnlink);
    } else if (el.tagName === "IMG") {
      el.classList.add("pro-active-media");
      ["25%", "50%", "75%", "100%"].forEach(function (pct) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = pct;
        b.classList.toggle("is-active", el.getAttribute("width") === pct || (pct === "100%" && !el.hasAttribute("width")));
        b.addEventListener("click", function () {
          if (pct === "100%") el.removeAttribute("width");
          else el.setAttribute("width", pct);
          el.removeAttribute("height");
          syncProToMarkdown();
          showProMediaBarFor(el);
        });
        proMediaBar.appendChild(b);
      });
      var sep = document.createElement("span");
      sep.className = "tb-sep";
      proMediaBar.appendChild(sep);

      var btnImgEdit = document.createElement("button");
      btnImgEdit.type = "button";
      btnImgEdit.textContent = tr("pmb.editImg");
      btnImgEdit.addEventListener("click", function () {
        var src = window.prompt(tr("pro.imagePrompt"), el.getAttribute("src") || "https://");
        if (!src) return;
        var safe = safePasteUrl(src, true);
        if (!safe) { toast(tr("pro.invalidUrl"), { type: "error" }); return; }
        var alt = window.prompt(tr("pro.imageAltPrompt"), el.getAttribute("alt") || "");
        if (alt === null) return;
        el.setAttribute("src", safe);
        el.setAttribute("alt", alt);
        syncProToMarkdown();
      });
      proMediaBar.appendChild(btnImgEdit);

      var btnImgDel = document.createElement("button");
      btnImgDel.type = "button";
      btnImgDel.className = "ptb-del";
      btnImgDel.title = tr("pmb.delImg");
      btnImgDel.appendChild(icon("trash"));
      btnImgDel.addEventListener("click", function () {
        el.remove();
        hideProFloatingUi();
        syncProToMarkdown();
      });
      proMediaBar.appendChild(btnImgDel);
    }
    positionProMediaUi();
  }

  function updateProContextUi() {
    if (app.dataset.mode !== "pro") { hideProFloatingUi(); return; }
    var sel = window.getSelection();
    var node = sel && sel.rangeCount ? sel.anchorNode : null;
    var el = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
    if (!el || !proEditor.contains(el)) return;

    var cell = el.closest("td, th");
    var tbl = cell ? cell.closest("table") : null;
    clearProTableHighlights();
    if (cell && tbl && proEditor.contains(tbl)) {
      activeProCell = cell;
      activeProTable = tbl;
      tbl.classList.add("pro-active-table");
      cell.classList.add("pro-active-cell");
      positionProTableUi();
    } else {
      activeProCell = null;
      activeProTable = null;
      if (proTableBar) proTableBar.hidden = true;
      if (proAddRowEdge) proAddRowEdge.hidden = true;
      if (proAddColEdge) proAddColEdge.hidden = true;
    }

    var link = el.closest("a[href]");
    if (link && proEditor.contains(link)) {
      showProMediaBarFor(link);
    } else if (!activeProMedia || activeProMedia.tagName !== "IMG") {
      clearProMediaHighlights();
      activeProMedia = null;
      if (proMediaBar) proMediaBar.hidden = true;
    }
  }

  function updateProToolbarState() {
    var tb = $("toolbar");
    if (!tb) return;
    if (app.dataset.mode !== "pro") {
      tb.querySelectorAll("button.is-active").forEach(function (b) { b.classList.remove("is-active"); });
      return;
    }
    var sel = window.getSelection();
    var node = sel && sel.rangeCount ? sel.anchorNode : null;
    var el = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
    var inside = el && proEditor.contains(el);

    function queryState(cmd) {
      if (!inside) return false;
      try { return document.queryCommandState(cmd); } catch (e) { return false; }
    }

    var states = {
      bold: queryState("bold"),
      italic: queryState("italic"),
      strike: queryState("strikeThrough"),
      ul: queryState("insertUnorderedList"),
      ol: queryState("insertOrderedList"),
      heading: !!(inside && el.closest("h1,h2,h3,h4,h5,h6")),
      code: !!(inside && el.closest("code") && !el.closest("pre")),
      codeblock: !!(inside && el.closest("pre")),
      quote: !!(inside && el.closest("blockquote")),
      alert: !!(inside && el.closest(".markdown-alert")),
      table: !!(inside && el.closest("table"))
    };
    Object.keys(states).forEach(function (k) {
      var btn = tb.querySelector('[data-cmd="' + k + '"]');
      if (btn) btn.classList.toggle("is-active", states[k]);
    });
    ["underline", "justifyLeft", "justifyCenter", "justifyRight"].forEach(function (cmd) {
      var btn = tb.querySelector('[data-pro-command="' + cmd + '"]');
      if (btn) btn.classList.toggle("is-active", queryState(cmd));
    });
  }

  // ---------- Pro Table Manipulation (Add/Delete/Move Rows & Columns, Align, Navigation) ----------
  function focusProCell(cell, selectText) {
    if (!cell || !proEditor.contains(cell)) return;
    activeProCell = cell;
    activeProTable = cell.closest("table");
    clearProTableHighlights();
    if (activeProTable) activeProTable.classList.add("pro-active-table");
    cell.classList.add("pro-active-cell");
    proEditor.focus();
    var range = document.createRange();
    range.selectNodeContents(cell);
    if (!selectText) range.collapse(false);
    var sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    rememberProSelection();
    positionProTableUi();
  }

  function makeTableCell(tag, align, htmlContent) {
    var c = document.createElement(tag);
    if (align) {
      c.setAttribute("align", align);
      c.style.textAlign = align;
    }
    c.innerHTML = htmlContent != null ? htmlContent : "<br>";
    return c;
  }

  function ensureTableSections(table) {
    var thead = table.querySelector("thead");
    var tbody = table.querySelector("tbody");
    if (!thead && table.rows.length > 0) {
      thead = document.createElement("thead");
      var firstRow = table.rows[0];
      Array.prototype.slice.call(firstRow.cells).forEach(function (c) {
        if (c.tagName !== "TH") {
          var th = makeTableCell("th", getCellAlign(c), c.innerHTML);
          c.replaceWith(th);
        }
      });
      thead.appendChild(firstRow);
      table.insertBefore(thead, table.firstChild);
    }
    if (!tbody) {
      tbody = document.createElement("tbody");
      Array.prototype.slice.call(table.querySelectorAll(":scope > tr")).forEach(function (r) {
        tbody.appendChild(r);
      });
      table.appendChild(tbody);
    }
    return { thead: thead, tbody: tbody };
  }

  function runProTableAction(action) {
    var cell = activeProCell;
    var table = activeProTable;
    if (!cell || !table || !proEditor.contains(table)) {
      updateProContextUi();
      cell = activeProCell;
      table = activeProTable;
    }
    if (!cell || !table) return;

    var sections = ensureTableSections(table);
    var rows = Array.prototype.slice.call(table.rows);
    var row = cell.parentElement;
    var rowIndex = rows.indexOf(row);
    var colIndex = cell.cellIndex;
    var colCount = rows.reduce(function (n, r) { return Math.max(n, r.cells.length); }, 1);
    if (rowIndex < 0 || colIndex < 0) return;

    function colAlignAt(cIdx) {
      for (var i = 0; i < rows.length; i++) {
        var a = getCellAlign(rows[i].cells[cIdx]);
        if (a) return a;
      }
      return "";
    }

    if (action === "row-above") {
      var newRowAbove = document.createElement("tr");
      if (row.parentElement === sections.thead) {
        // Demote current header row to top of tbody as <td>, put new <th> row in thead
        var demoted = document.createElement("tr");
        for (var c0 = 0; c0 < colCount; c0++) {
          var oldTh = row.cells[c0];
          demoted.appendChild(makeTableCell("td", colAlignAt(c0), oldTh ? oldTh.innerHTML : "<br>"));
          newRowAbove.appendChild(makeTableCell("th", colAlignAt(c0), escapeHtml(tr("pro.tableHeading"))));
        }
        sections.thead.replaceChild(newRowAbove, row);
        sections.tbody.insertBefore(demoted, sections.tbody.firstChild);
        syncProToMarkdown();
        focusProCell(newRowAbove.cells[Math.min(colIndex, newRowAbove.cells.length - 1)], true);
        return;
      }
      for (var ca = 0; ca < colCount; ca++) {
        newRowAbove.appendChild(makeTableCell("td", colAlignAt(ca), "<br>"));
      }
      row.parentElement.insertBefore(newRowAbove, row);
      syncProToMarkdown();
      focusProCell(newRowAbove.cells[Math.min(colIndex, newRowAbove.cells.length - 1)], false);
    } else if (action === "row-below" || action === "row-end") {
      var newRowBelow = document.createElement("tr");
      for (var cb = 0; cb < colCount; cb++) {
        newRowBelow.appendChild(makeTableCell("td", colAlignAt(cb), "<br>"));
      }
      if (action === "row-end") {
        sections.tbody.appendChild(newRowBelow);
      } else if (row.parentElement === sections.thead) {
        sections.tbody.insertBefore(newRowBelow, sections.tbody.firstChild);
      } else {
        row.parentElement.insertBefore(newRowBelow, row.nextSibling);
      }
      syncProToMarkdown();
      focusProCell(newRowBelow.cells[action === "row-end" ? 0 : Math.min(colIndex, newRowBelow.cells.length - 1)], false);
    } else if (action === "row-up" || action === "row-down") {
      var targetRowIdx = rowIndex + (action === "row-up" ? -1 : 1);
      if (targetRowIdx < 0 || targetRowIdx >= rows.length) return;
      var otherRow = rows[targetRowIdx];
      for (var cm = 0; cm < colCount; cm++) {
        var cA = row.cells[cm], cB = otherRow.cells[cm];
        if (cA && cB) {
          var tmpHtml = cA.innerHTML;
          cA.innerHTML = cB.innerHTML;
          cB.innerHTML = tmpHtml;
        }
      }
      syncProToMarkdown();
      focusProCell(otherRow.cells[Math.min(colIndex, otherRow.cells.length - 1)], false);
    } else if (action === "row-del") {
      if (rows.length <= 1) {
        table.remove();
        hideProFloatingUi();
        syncProToMarkdown();
        return;
      }
      var nextFocusRowIdx = rowIndex < rows.length - 1 ? rowIndex + 1 : rowIndex - 1;
      var nextFocusRow = rows[nextFocusRowIdx];
      if (row.parentElement === sections.thead && sections.tbody.rows.length > 0) {
        // Promote first tbody row to thead
        var promoted = sections.tbody.rows[0];
        var newHeadRow = document.createElement("tr");
        Array.prototype.slice.call(promoted.cells).forEach(function (td, idx) {
          newHeadRow.appendChild(makeTableCell("th", colAlignAt(idx), td.innerHTML));
        });
        sections.thead.replaceChild(newHeadRow, row);
        promoted.remove();
        syncProToMarkdown();
        focusProCell(newHeadRow.cells[Math.min(colIndex, newHeadRow.cells.length - 1)], false);
        return;
      }
      row.remove();
      syncProToMarkdown();
      if (nextFocusRow && proEditor.contains(nextFocusRow)) {
        focusProCell(nextFocusRow.cells[Math.min(colIndex, nextFocusRow.cells.length - 1)], false);
      }
    } else if (action === "col-left" || action === "col-right" || action === "col-end") {
      var insertAt = action === "col-left" ? colIndex : action === "col-right" ? colIndex + 1 : colCount;
      var targetCellToFocus = null;
      rows.forEach(function (r) {
        var isHead = r.parentElement === sections.thead || !!r.querySelector("th");
        var newCell = makeTableCell(isHead ? "th" : "td", "", isHead ? escapeHtml(tr("pro.tableHeading")) : "<br>");
        var refCell = r.cells[insertAt] || null;
        r.insertBefore(newCell, refCell);
        if (r === row) targetCellToFocus = newCell;
      });
      if (!targetCellToFocus && rows[0]) targetCellToFocus = rows[0].cells[insertAt];
      syncProToMarkdown();
      focusProCell(targetCellToFocus, targetCellToFocus && targetCellToFocus.tagName === "TH");
    } else if (action === "col-left-move" || action === "col-right-move") {
      var targetColIdx = colIndex + (action === "col-left-move" ? -1 : 1);
      if (targetColIdx < 0 || targetColIdx >= colCount) return;
      rows.forEach(function (r) {
        var c1 = r.cells[colIndex], c2 = r.cells[targetColIdx];
        if (!c1 || !c2) return;
        if (action === "col-left-move") r.insertBefore(c1, c2);
        else r.insertBefore(c2, c1);
      });
      syncProToMarkdown();
      focusProCell(row.cells[targetColIdx], false);
    } else if (action === "col-del") {
      if (colCount <= 1) {
        table.remove();
        hideProFloatingUi();
        syncProToMarkdown();
        return;
      }
      var nextColIdx = Math.min(colIndex, colCount - 2);
      rows.forEach(function (r) {
        if (r.cells[colIndex]) r.cells[colIndex].remove();
      });
      syncProToMarkdown();
      focusProCell(row.cells[nextColIdx], false);
    } else if (/^col-align-(left|center|right)$/.test(action)) {
      var desiredAlign = action.replace("col-align-", "");
      var currentAlign = getCellAlign(cell);
      var nextAlign = currentAlign === desiredAlign ? "" : desiredAlign;
      rows.forEach(function (r) {
        var c = r.cells[colIndex];
        if (!c) return;
        if (nextAlign) {
          c.setAttribute("align", nextAlign);
          c.style.textAlign = nextAlign;
        } else {
          c.removeAttribute("align");
          c.style.textAlign = "";
          if (!c.getAttribute("style")) c.removeAttribute("style");
        }
      });
      syncProToMarkdown();
      focusProCell(cell, false);
    } else if (action === "table-dup") {
      var clone = stripProUiAttrs(table);
      table.parentNode.insertBefore(clone, table.nextSibling);
      syncProToMarkdown();
      var firstCell = clone.querySelector("th, td");
      if (firstCell) focusProCell(firstCell, false);
    } else if (action === "table-del") {
      table.remove();
      hideProFloatingUi();
      syncProToMarkdown();
      proEditor.focus();
    }
  }

  // ---------- Interactive Table Grid Picker ----------
  function closeTablePicker() {
    if (tablePicker) {
      tablePicker.remove();
      tablePicker = null;
    }
  }

  function insertNewProTable(rowCount, colCount) {
    rowCount = Math.max(1, Math.min(30, Number(rowCount) || 3));
    colCount = Math.max(1, Math.min(16, Number(colCount) || 3));
    restoreProSelection();
    var bodyRowsCount = Math.max(1, rowCount - 1);
    var headCells = [];
    for (var c = 1; c <= colCount; c++) {
      headCells.push("<th>" + escapeHtml(tr("pro.tableHeading") + " " + c) + "</th>");
    }
    var bodyRows = [];
    for (var r = 0; r < bodyRowsCount; r++) {
      bodyRows.push("<tr>" + new Array(colCount + 1).join("<td><br></td>") + "</tr>");
    }
    var html = "<table><thead><tr>" + headCells.join("") + "</tr></thead><tbody>" + bodyRows.join("") + "</tbody></table><p><br></p>";
    insertProHtml(html);
    var tables = proEditor.querySelectorAll("table");
    var lastTable = tables[tables.length - 1];
    if (lastTable) {
      var firstTh = lastTable.querySelector("th, td");
      if (firstTh) focusProCell(firstTh, true);
    }
  }

  function openProTablePicker(anchorBtn) {
    if (tablePicker) { closeTablePicker(); return; }
    rememberProSelection();

    var pop = document.createElement("div");
    pop.className = "table-picker";
    var head = document.createElement("div");
    head.className = "tp-head";
    var titleSpan = document.createElement("span");
    titleSpan.textContent = tr("tp.title");
    var dimSpan = document.createElement("span");
    dimSpan.className = "tp-dim";
    dimSpan.textContent = "3 × 3";
    head.appendChild(titleSpan);
    head.appendChild(dimSpan);
    pop.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "tp-grid";
    var cells = [];

    function highlightGrid(rows, cols) {
      dimSpan.textContent = rows + " × " + cols;
      cells.forEach(function (item) {
        item.el.classList.toggle("active", item.r <= rows && item.c <= cols);
      });
    }

    for (var r = 1; r <= 8; r++) {
      for (var c = 1; c <= 8; c++) {
        (function (row, col) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "tp-cell";
          b.setAttribute("aria-label", row + " × " + col);
          b.addEventListener("mouseenter", function () {
            highlightGrid(row, col);
            inRows.value = String(row);
            inCols.value = String(col);
          });
          b.addEventListener("click", function (e) {
            e.stopPropagation();
            closeTablePicker();
            insertNewProTable(row, col);
          });
          grid.appendChild(b);
          cells.push({ el: b, r: row, c: col });
        })(r, c);
      }
    }
    pop.appendChild(grid);

    var custom = document.createElement("div");
    custom.className = "tp-custom";
    var inRows = document.createElement("input");
    inRows.type = "number";
    inRows.min = "1";
    inRows.max = "30";
    inRows.value = "3";
    inRows.setAttribute("aria-label", tr("tp.rowsAria"));
    var mul = document.createElement("span");
    mul.textContent = "×";
    var inCols = document.createElement("input");
    inCols.type = "number";
    inCols.min = "1";
    inCols.max = "16";
    inCols.value = "3";
    inCols.setAttribute("aria-label", tr("tp.colsAria"));
    var btnGo = document.createElement("button");
    btnGo.type = "button";
    btnGo.className = "btn btn-primary btn-small";
    btnGo.textContent = tr("tp.insert");
    btnGo.addEventListener("click", function (e) {
      e.stopPropagation();
      var rVal = parseInt(inRows.value, 10) || 3;
      var cVal = parseInt(inCols.value, 10) || 3;
      closeTablePicker();
      insertNewProTable(rVal, cVal);
    });
    custom.appendChild(inRows);
    custom.appendChild(mul);
    custom.appendChild(inCols);
    custom.appendChild(btnGo);
    pop.appendChild(custom);

    highlightGrid(3, 3);
    pop.addEventListener("mousedown", function (e) {
      if (e.target.tagName !== "INPUT") e.preventDefault();
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    document.body.appendChild(pop);

    var rect = (anchorBtn || $("toolbar")).getBoundingClientRect();
    var pW = pop.offsetWidth || 200;
    pop.style.top = (rect.bottom + 6) + "px";
    pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pW - 8)) + "px";
    tablePicker = pop;
  }

  function insertProHtml(html) {
    if (!document.execCommand("insertHTML", false, html)) {
      var selection = window.getSelection();
      if (selection && selection.rangeCount) {
        var range = selection.getRangeAt(0);
        range.deleteContents();
        var fragment = range.createContextualFragment(html);
        var last = fragment.lastChild;
        range.insertNode(fragment);
        if (last) {
          range.setStartAfter(last);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
    enhanceProNodes(proEditor);
    rememberProSelection();
    syncProToMarkdown();
  }

  function wrapProSelection(tag) {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    var range = selection.getRangeAt(0);
    var wrapper = document.createElement(tag);
    if (range.collapsed) {
      wrapper.textContent = tag === "code" ? "code" : "";
      range.insertNode(wrapper);
      range.setStartAfter(wrapper);
      range.collapse(true);
    } else {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
      range.selectNodeContents(wrapper);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    rememberProSelection();
  }

  function buildProAlertElement(typeKey, bodyHtml) {
    typeKey = (typeKey || "note").toLowerCase();
    var box = document.createElement("div");
    box.className = "markdown-alert markdown-alert-" + typeKey;
    box.setAttribute("data-alert", typeKey);
    var titleEl = document.createElement("p");
    titleEl.className = "markdown-alert-title";
    titleEl.setAttribute("contenteditable", "false");
    titleEl.title = tr("pro.alertClickTitle");
    titleEl.innerHTML = (ALERT_ICONS[typeKey] || ALERT_ICONS.note) + "<span>" + escapeHtml(tr("alert." + typeKey)) + "</span>";
    box.appendChild(titleEl);
    var contentP = document.createElement("p");
    contentP.innerHTML = bodyHtml || escapeHtml(tr("alert." + typeKey));
    box.appendChild(contentP);
    return box;
  }

  function cycleProAlert(alertBox) {
    var order = ["note", "tip", "important", "warning", "caution"];
    var cur = (alertBox.getAttribute("data-alert") || "note").toLowerCase();
    var next = order[(order.indexOf(cur) + 1) % order.length];
    alertBox.className = "markdown-alert markdown-alert-" + next;
    alertBox.setAttribute("data-alert", next);
    var titleEl = alertBox.querySelector(".markdown-alert-title");
    if (titleEl) {
      titleEl.innerHTML = (ALERT_ICONS[next] || ALERT_ICONS.note) + "<span>" + escapeHtml(tr("alert." + next)) + "</span>";
    }
    syncProToMarkdown();
  }

  function editProMathNode(mathEl) {
    var oldCode = mathEl.getAttribute("data-math") || "E = mc^2";
    var nextCode = window.prompt(tr("pro.mathPrompt"), oldCode);
    if (nextCode === null) return;
    if (!nextCode.trim()) {
      mathEl.remove();
      syncProToMarkdown();
      return;
    }
    mathEl.setAttribute("data-math", nextCode.trim());
    mathEl.classList.remove("math-error");
    renderMath(proEditor);
    syncProToMarkdown();
  }

  function runProCommand(name, value) {
    if (name === "table") {
      var tblBtn = $("toolbar").querySelector('[data-cmd="table"]');
      openProTablePicker(tblBtn);
      return;
    }
    restoreProSelection();
    if (name === "heading") {
      var selection = window.getSelection(), node = selection && selection.anchorNode;
      var block = node && (node.nodeType === 1 ? node : node.parentElement);
      while (block && block !== proEditor && !/^H[1-6]$/.test(block.tagName)) block = block.parentElement;
      var level = block && block !== proEditor ? +block.tagName.charAt(1) : 0;
      document.execCommand("formatBlock", false, level >= 3 ? "<p>" : "<h" + (level + 1) + ">");
    } else if (name === "bold" || name === "italic" || name === "underline" || name === "strike") {
      document.execCommand(name === "strike" ? "strikeThrough" : name, false, null);
    } else if (name === "code") {
      wrapProSelection("code");
    } else if (name === "codeblock") {
      document.execCommand("formatBlock", false, "<pre>");
    } else if (name === "quote") {
      document.execCommand("formatBlock", false, "<blockquote>");
    } else if (name === "alert") {
      var selAlert = window.getSelection();
      var anchorAlert = selAlert && selAlert.rangeCount ? selAlert.anchorNode : null;
      var elAlert = anchorAlert ? (anchorAlert.nodeType === 1 ? anchorAlert : anchorAlert.parentElement) : null;
      var existingAlert = elAlert && proEditor.contains(elAlert) ? elAlert.closest(".markdown-alert") : null;
      if (existingAlert) {
        cycleProAlert(existingAlert);
        return;
      }
      var selText = selAlert ? selAlert.toString().trim() : "";
      var newAlert = buildProAlertElement("note", selText ? escapeHtml(selText) : "");
      insertProHtml(newAlert.outerHTML + "<p><br></p>");
      return;
    } else if (name === "math") {
      var selMath = window.getSelection();
      var initialMath = (selMath && selMath.toString().trim()) || "E = mc^2";
      var formula = window.prompt(tr("pro.mathPrompt"), initialMath);
      if (!formula || !formula.trim()) return;
      var isBlockMath = formula.indexOf("\n") >= 0 || formula.indexOf("\\int") >= 0 || formula.indexOf("\\sum") >= 0;
      var tagMath = isBlockMath ? "div" : "span";
      var clsMath = isBlockMath ? "math-block" : "math-inline";
      var mathHtml = "<" + tagMath + ' class="' + clsMath + '" data-math="' + escapeHtml(formula.trim()) + '" contenteditable="false">' +
        escapeHtml(formula.trim()) + "</" + tagMath + ">" + (isBlockMath ? "<p><br></p>" : " ");
      insertProHtml(mathHtml);
      return;
    } else if (name === "ul" || name === "ol") {
      document.execCommand(name === "ul" ? "insertUnorderedList" : "insertOrderedList", false, null);
    } else if (name === "task") {
      insertProHtml('<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox"> </li></ul>');
      return;
    } else if (name === "link") {
      var url = window.prompt(tr("pro.linkPrompt"), "https://");
      if (!url) return;
      var safeLink = safePasteUrl(url, false);
      if (!safeLink) { toast(tr("pro.invalidUrl"), { type: "error" }); return; }
      var currentSelection = window.getSelection();
      if (currentSelection && currentSelection.isCollapsed) {
        insertProHtml('<a href="' + escapeHtml(safeLink) + '">' + escapeHtml(tr("ph.linkText")) + "</a>");
        return;
      }
      document.execCommand("createLink", false, safeLink);
    } else if (name === "image") {
      var src = window.prompt(tr("pro.imagePrompt"), "https://");
      if (!src) return;
      var safeSrc = safePasteUrl(src, true);
      if (!safeSrc) { toast(tr("pro.invalidUrl"), { type: "error" }); return; }
      var alt = window.prompt(tr("pro.imageAltPrompt"), "");
      if (alt === null) return;
      insertProHtml('<img src="' + escapeHtml(safeSrc) + '" alt="' + escapeHtml(alt || "") + '">');
      return;
    } else if (name === "hr") {
      document.execCommand("insertHorizontalRule", false, null);
    } else if (name === "fontName" || name === "fontSize" || name === "foreColor" || name === "hiliteColor") {
      if (value) document.execCommand(name, false, value);
    } else if (/^(justifyLeft|justifyCenter|justifyRight|indent|outdent|undo|redo)$/.test(name)) {
      document.execCommand(name, false, null);
    }
    rememberProSelection();
    syncProToMarkdown();
  }

  function pasteIntoPro(e) {
    if (app.dataset.mode !== "pro" || !e.clipboardData) return;
    var active = document.activeElement;
    if (e.target !== proEditor && e.target !== tabs.pro &&
        active !== proEditor && active !== tabs.pro) return;
    var html = e.clipboardData.getData("text/html");
    var richHtml = html ? sanitizePastedHtml(html) : "";
    var plain = e.clipboardData.getData("text/plain");
    var isTsv = !richHtml && plain.indexOf("\t") >= 0;
    if (!richHtml && !plain) return;
    e.preventDefault();
    restoreProSelection();
    if (richHtml) insertProHtml(richHtml);
    else if (isTsv) insertProHtml(plainPasteContent(plain));
    else {
      document.execCommand("insertText", false, plain);
      rememberProSelection();
      syncProToMarkdown();
    }
  }

  function runCommand(name) {
    if (name === "find") { openFindBar(); return; }
    if (app.dataset.mode === "pro") { runProCommand(name); return; }
    if (app.dataset.mode === "view") return;
    if (commands[name]) commands[name]();
  }

  // ---------- export ----------
  function fileName() {
    return getTitle(current).replace(/[\\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 100) || "document";
  }

  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  var WORD_CSS =
    "body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1f2328}" +
    "h1{font-size:20pt;border-bottom:1px solid #d0d7de}h2{font-size:16pt;border-bottom:1px solid #d0d7de}" +
    "h3{font-size:13pt}h4,h5,h6{font-size:11pt}" +
    "table{border-collapse:collapse;margin:8pt 0}th,td{border:1px solid #999;padding:4pt 8pt;vertical-align:top}" +
    "th{background:#f6f8fa;font-weight:bold}" +
    "pre{background:#f6f8fa;border:1px solid #d0d7de;padding:8pt;font-family:Consolas,monospace;font-size:9.5pt;white-space:pre-wrap}" +
    "code{font-family:Consolas,monospace;font-size:9.5pt;background:#f6f8fa}" +
    "blockquote{border-left:3px solid #d0d7de;margin-left:0;padding-left:10pt;color:#57606a}" +
    ".markdown-alert{border-left:3pt solid #0969da;padding:6pt 10pt;margin:8pt 0;background:#f6f8fa}" +
    ".markdown-alert-title{font-weight:bold;margin:0 0 4pt 0}" +
    ".markdown-alert-tip{border-left-color:#1a7f37}.markdown-alert-important{border-left-color:#8250df}" +
    ".markdown-alert-warning{border-left-color:#9a6700}.markdown-alert-caution{border-left-color:#cf222e}" +
    "img{max-width:100%}a{color:#0969da}";

  function exportMd() {
    download(new Blob([editor.value], { type: "text/markdown;charset=utf-8" }), fileName() + ".md");
  }

  // Standard uncompressed ZIP (STORE) builder in pure JS (UTF-8 filenames + CRC32)
  var crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildZip(entries) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    var dosDate = (((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

    entries.forEach(function (ent) {
      var nameBytes = enc.encode(ent.name);
      var dataBytes = enc.encode(ent.content);
      var crc = crc32(dataBytes);
      var len = dataBytes.length;

      var lhdr = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(lhdr.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 flag
      lv.setUint16(8, 0, true);      // STORE (no compression)
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, len, true);
      lv.setUint32(22, len, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lhdr.set(nameBytes, 30);

      var chdr = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(chdr.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, len, true);
      cv.setUint32(24, len, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      chdr.set(nameBytes, 46);

      parts.push(lhdr, dataBytes);
      central.push(chdr);
      offset += lhdr.length + len;
    });

    var cSize = central.reduce(function (s, b) { return s + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [eocd]), { type: "application/zip" });
  }

  function sanitizePathSegment(s, fallback) {
    return String(s || "").replace(/[\\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 80) || fallback;
  }

  function exportZip() {
    persist(true);
    var used = Object.create(null);
    var entries = sortedDocs().map(function (d) {
      var f = folderOf(d);
      var dir = f ? sanitizePathSegment(f.name, "folder") + "/" : "";
      var base = sanitizePathSegment(getTitle(d), "document");
      var path = dir + base + ".md", n = 2;
      while (used[path.toLowerCase()]) {
        path = dir + base + " (" + (n++) + ").md";
      }
      used[path.toLowerCase()] = true;
      return { name: path, content: d.content || "" };
    });
    var now = new Date();
    var stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
    download(buildZip(entries), "md-helper-docs-" + stamp + ".zip");
    toast(tr("zip.done", { n: entries.length }));
  }

  function exportWord() {
    var title = escapeHtml(getTitle(current));
    var name = fileName();
    buildHtmlWithDiagrams(editor.value, "png").then(function (body) {
      var html =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8"><title>' + title + "</title><style>" + WORD_CSS + "</style></head>" +
        "<body>" + body + "</body></html>";
      download(new Blob(["\ufeff", html], { type: "application/msword" }), name + ".doc");
    });
  }

  function exportHtml() {
    var title = escapeHtml(getTitle(current));
    var name = fileName();
    var body;
    var done = function (css) {
      var hasMath = body.indexOf("katex") >= 0;
      var katexLink = hasMath ? '<link rel="stylesheet" href="' + KATEX_CSS + '" crossorigin="anonymous">\n' : "";
      var html = '<!DOCTYPE html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + title + "</title>\n" +
        katexLink +
        "<style>\n" + css + "\nbody.markdown-body{box-sizing:border-box;max-width:900px;margin:0 auto;padding:40px 24px}" +
        "\n.markdown-body .markdown-alert .markdown-alert-title{display:flex;align-items:center;gap:8px;font-weight:600}" +
        "\n.markdown-body .markdown-alert .markdown-alert-title svg{width:16px;height:16px;fill:currentColor}" +
        "\n.math-block{margin:16px 0;text-align:center;overflow-x:auto}\n</style>\n" +
        '</head>\n<body class="markdown-body">\n' + body + "\n</body>\n</html>\n";
      download(new Blob([html], { type: "text/html;charset=utf-8" }), name + ".html");
    };
    var cssFallback = WORD_CSS.replace(/body\{/, ".markdown-body{");
    var css = Promise.all([
      fetch("lib/github-markdown-light.css").then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .catch(function () { return cssFallback; }),
      fetch("lib/github.min.css").then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; })
    ]).then(function (parts) {
      return parts.join("\n") + "\n.markdown-body pre code.hljs{background:transparent;padding:0}" +
        "\n.mermaid-diagram{text-align:center;margin:0 0 16px}.mermaid-diagram svg{max-width:100%;height:auto}";
    });
    Promise.all([css, buildHtmlWithDiagrams(editor.value, "svg")]).then(function (r) {
      body = r[1];
      done(r[0]);
    });
  }

  function exportPdf() {
    render();
    var dark = root.getAttribute("data-theme") === "dark";
    var hasDiagrams = !!preview.querySelector(".mermaid-wrap");
    // Print is always light; redraw diagrams in light colors before opening the dialog
    if (dark) root.setAttribute("data-theme", "light");
    var ready = hasDiagrams ? renderDiagrams() : Promise.resolve();
    ready.catch(function () {}).then(function () {
      // Browser uses document.title as the default PDF file name
      var old = document.title;
      document.title = fileName();
      window.addEventListener("afterprint", function restore() {
        document.title = old;
        window.removeEventListener("afterprint", restore);
      });
      window.print();
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  // Inline styles so pasted content keeps borders/backgrounds in Word, Outlook, Confluence…
  var PASTE_STYLES = {
    table: "border-collapse:collapse;margin:8px 0",
    th: "border:1px solid #d0d7de;padding:6px 12px;background:#f6f8fa;font-weight:600;text-align:left;vertical-align:top",
    td: "border:1px solid #d0d7de;padding:6px 12px;vertical-align:top",
    pre: "background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:12px;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.45;white-space:pre-wrap",
    code: "font-family:Consolas,'Courier New',monospace;font-size:90%;background:#eff1f3;padding:1px 4px;border-radius:4px",
    blockquote: "border-left:4px solid #d0d7de;margin:8px 0;padding:0 12px;color:#59636e",
    hr: "border:0;border-top:2px solid #d0d7de;margin:16px 0",
    img: "max-width:100%"
  };

  function pasteReady(container) {
    container.querySelectorAll(".code-copy, .block-copy").forEach(function (el) { el.remove(); });
    container.querySelectorAll(".code-wrap").forEach(function (w) {
      while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w);
      w.remove();
    });
    container.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      // Checkbox inputs get dropped by most editors; use visible symbols instead
      cb.replaceWith(document.createTextNode(cb.checked ? "☑ " : "☐ "));
    });
    container.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
    container.querySelectorAll("[data-src]").forEach(function (el) { el.removeAttribute("data-src"); });
    container.querySelectorAll(".copy-target, .search-flash").forEach(function (el) {
      el.classList.remove("copy-target", "search-flash");
      if (!el.className) el.removeAttribute("class");
    });
    // Keep only MathML for rich paste so Word/Docs don't duplicate KaTeX visual HTML spans
    container.querySelectorAll(".katex-html").forEach(function (el) { el.remove(); });
    var alertColors = { note: "#0969da", tip: "#1a7f37", important: "#8250df", warning: "#9a6700", caution: "#cf222e" };
    container.querySelectorAll(".markdown-alert").forEach(function (el) {
      var c = alertColors[el.getAttribute("data-alert")] || "#0969da";
      el.setAttribute("style", "border-left:4px solid " + c + ";padding:8px 14px;margin:10px 0;background:#f6f8fa");
      var t = el.querySelector(".markdown-alert-title");
      if (t) {
        t.querySelectorAll("svg").forEach(function (s) { s.remove(); });
        t.setAttribute("style", "font-weight:700;color:" + c + ";margin:0 0 4px 0");
      }
    });
    container.querySelectorAll("*").forEach(function (el) {
      var tag = el.tagName.toLowerCase();
      var st = PASTE_STYLES[tag];
      if (tag === "code" && el.parentNode && el.parentNode.tagName === "PRE") st = "font-family:inherit;font-size:inherit;background:transparent;padding:0";
      if (st) el.setAttribute("style", st + (el.getAttribute("style") ? ";" + el.getAttribute("style") : ""));
    });
    return container;
  }

  // Copy HTML with formatting (plus a plain-text version) to the clipboard
  // `content` is an HTML string, a container element, or a Promise of either
  // (diagrams are converted to PNG asynchronously before copying).
  function copyHtml(content, okMsg, plainOverride) {
    var tmp = document.createElement("div");
    var ready = Promise.resolve(content).then(function (c) {
      if (typeof c === "string") tmp.innerHTML = c;
      else while (c.firstChild) tmp.appendChild(c.firstChild);
      return Promise.all([embedDiagrams(tmp, "png"), renderMath(tmp)]);
    }).then(function () {
      pasteReady(tmp);
      tmp.style.cssText = "position:fixed;left:-9999px;top:0;white-space:normal";
      document.body.appendChild(tmp); // attached so innerText keeps line breaks
      return {
        html: tmp.innerHTML,
        plain: plainOverride != null ? plainOverride : (tmp.innerText || tmp.textContent || "")
      };
    });
    var ok = function () { tmp.remove(); toast(okMsg || tr("copy.richDone")); };
    if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      // Promise-valued items keep the user-gesture permission while diagrams render
      navigator.clipboard.write([new ClipboardItem({
        "text/html": ready.then(function (r) { return new Blob([r.html], { type: "text/html" }); }),
        "text/plain": ready.then(function (r) { return new Blob([r.plain], { type: "text/plain" }); })
      })]).then(ok, function () { ready.then(fallback); });
    } else ready.then(fallback);

    function fallback() {
      tmp.setAttribute("contenteditable", "true");
      var range = document.createRange();
      range.selectNodeContents(tmp);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) {}
      selection.removeAllRanges();
      if (done) ok();
      else { tmp.remove(); toast(tr("copyBlocked"), { type: "error" }); }
    }
  }

  function copyRich() { copyHtml(buildHtml(editor.value)); }

  // ---------- per-block copy in the preview ----------
  var blockBtn = document.createElement("button");
  blockBtn.type = "button";
  blockBtn.className = "block-copy";
  blockBtn.hidden = true;
  blockBtn.appendChild(icon("copy"));
  paneView.appendChild(blockBtn);
  var blockTarget = null;

  function topBlock(node) {
    while (node && node !== preview) {
      if (node.parentNode === preview) return node.nodeType === 1 ? node : null;
      node = node.parentNode;
    }
    return null;
  }

  var pasteBlock = null;
  var PASTE_HTML_TAGS = new Set((
    "a b blockquote br caption code col colgroup dd del div dl dt em font h1 h2 h3 h4 h5 h6 " +
    "hr i img ins li ol p pre s small span strong sub sup table tbody td tfoot th thead tr u ul"
  ).split(/\s+/));
  var PASTE_DROP_TAGS = new Set((
    "audio button canvas embed form iframe input link meta object script select style svg textarea video"
  ).split(/\s+/));
  var PASTE_CSS_PROPERTIES = new Set((
    "background background-color border border-bottom border-bottom-color border-bottom-style border-bottom-width " +
    "border-collapse border-color border-left border-left-color border-left-style border-left-width " +
    "border-right border-right-color border-right-style border-right-width border-spacing border-style " +
    "border-top border-top-color border-top-style border-top-width border-width color font-family font-size " +
    "font-style font-variant font-weight height letter-spacing line-height margin margin-bottom margin-left margin-right " +
    "margin-top max-height max-width min-height min-width padding padding-bottom padding-left padding-right " +
    "padding-top text-align text-decoration text-indent text-transform vertical-align white-space width word-break"
  ).split(/\s+/));

  function safePasteStyle(styleText) {
    var style = document.createElement("span").style;
    style.cssText = styleText || "";
    var declarations = [];
    Array.prototype.forEach.call(style, function (property) {
      var value = style.getPropertyValue(property).trim();
      if (PASTE_CSS_PROPERTIES.has(property) && value &&
          !/(?:url\s*\(|expression\s*\(|javascript:|@import|var\s*\(|[<>\\]|\/\*)/i.test(value)) {
        declarations.push(property + ":" + value);
      }
    });
    return declarations.join(";");
  }

  function pasteClassStyles(doc) {
    var rules = {};
    doc.querySelectorAll("style").forEach(function (styleNode) {
      var css = styleNode.textContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--|-->/g, "");
      var pattern = /([^{}]+)\{([^{}]*)\}/g, match;
      while ((match = pattern.exec(css))) {
        var style = safePasteStyle(match[2]);
        if (!style) continue;
        match[1].split(",").forEach(function (selector) {
          var classMatch = selector.trim().match(/^\.([A-Za-z_][\w-]*)$/);
          if (!classMatch) return;
          (rules[classMatch[1]] || (rules[classMatch[1]] = [])).push(style);
        });
      }
    });
    return rules;
  }

  function safePasteUrl(value, image) {
    var url = value.trim();
    if (image && /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(url) && url.length <= 1000000) {
      return url;
    }
    return (image ? /^https?:/i : /^(?:https?:|mailto:|#)/i).test(url) ? url : "";
  }

  function cleanPasteNode(node, classStyles) {
    if (node.nodeType === 3) return document.createTextNode(node.nodeValue);
    if (node.nodeType !== 1) return null;

    var tag = node.tagName.toLowerCase();
    if (PASTE_DROP_TAGS.has(tag)) return null;
    var children = Array.prototype.slice.call(node.childNodes);
    if (!PASTE_HTML_TAGS.has(tag)) {
      var fragment = document.createDocumentFragment();
      children.forEach(function (child) {
        var clean = cleanPasteNode(child, classStyles);
        if (clean) fragment.appendChild(clean);
      });
      return fragment;
    }

    var cleanNode = document.createElement(tag);
    var styles = [];
    Array.prototype.forEach.call(node.classList, function (name) {
      if (classStyles[name]) styles = styles.concat(classStyles[name]);
    });
    if (node.hasAttribute("style")) styles.push(node.getAttribute("style"));
    var cleanStyle = safePasteStyle(styles.join(";"));
    if (cleanStyle) cleanNode.setAttribute("style", cleanStyle);

    Array.prototype.forEach.call(node.attributes, function (attr) {
      var name = attr.name.toLowerCase(), value = attr.value.trim();
      if (name === "style" || name === "class") return;
      if (name === "href" && tag === "a") {
        var href = safePasteUrl(value, false);
        if (href) cleanNode.setAttribute("href", href);
      } else if (name === "src" && tag === "img") {
        var src = safePasteUrl(value, true);
        if (src) cleanNode.setAttribute("src", src);
      } else if (name === "alt" || name === "title") {
        cleanNode.setAttribute(name, value);
      } else if (/^(?:colspan|rowspan|span|start|width|height|cellpadding|cellspacing|border)$/.test(name) &&
          /^\d{1,5}(?:\.\d+)?%?$/.test(value)) {
        cleanNode.setAttribute(name, value);
      } else if (name === "scope" && /^(?:row|col|rowgroup|colgroup)$/i.test(value)) {
        cleanNode.setAttribute(name, value);
      } else if ((name === "align" && /^(?:left|center|right|justify)$/i.test(value)) ||
          (name === "valign" && /^(?:top|middle|bottom|baseline)$/i.test(value))) {
        cleanNode.setAttribute(name, value);
      } else if ((name === "color" || name === "bgcolor") &&
          /^(?:#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value)) {
        cleanNode.setAttribute(name, value);
      } else if (name === "face" && /^[\w ,'-]{1,120}$/.test(value)) {
        cleanNode.setAttribute(name, value);
      } else if (name === "size" && /^[1-7]$/.test(value)) {
        cleanNode.setAttribute(name, value);
      }
    });

    children.forEach(function (child) {
      var clean = cleanPasteNode(child, classStyles);
      if (clean) cleanNode.appendChild(clean);
    });
    return cleanNode;
  }

  function sanitizePastedHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var styles = pasteClassStyles(doc);
    var container = document.createElement("div");
    Array.prototype.slice.call(doc.body.childNodes).forEach(function (node) {
      var clean = cleanPasteNode(node, styles);
      if (clean) container.appendChild(clean);
    });
    return container.innerHTML.trim();
  }

  function plainPasteContent(text) {
    text = String(text || "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    if (text.indexOf("\t") < 0) return text;
    var rows = text.split("\n");
    return '<table style="' + PASTE_STYLES.table + '"><tbody>' + rows.map(function (row) {
      return "<tr>" + row.split("\t").map(function (cell) {
        return '<td style="' + PASTE_STYLES.td + '">' + escapeHtml(cell) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }

  function previewPasteOffset() {
    var selection = window.getSelection();
    var target = selection && preview.contains(selection.anchorNode) ? topBlock(selection.anchorNode) : null;
    target = target || pasteBlock;
    var blocks = Array.prototype.slice.call(preview.children);
    var index = blocks.indexOf(target);
    if (index >= 0) {
      for (var i = index + 1; i < blocks.length; i++) {
        if (blocks[i].hasAttribute("data-src")) return +blocks[i].getAttribute("data-src");
      }
    }
    return editor.value.length;
  }

  function pasteIntoPreview(e) {
    if (app.dataset.mode !== "view" || !e.clipboardData) return;
    var active = document.activeElement;
    if (e.target !== preview && e.target !== tabs.view &&
        active !== preview && active !== tabs.view && active !== editor) return;

    var html = e.clipboardData.getData("text/html");
    var content = html ? sanitizePastedHtml(html) : "";
    if (!content) content = plainPasteContent(e.clipboardData.getData("text/plain"));
    if (!content) return;
    e.preventDefault();

    var source = editor.value;
    var at = previewPasteOffset();
    var before = source.slice(0, at), after = source.slice(at);
    var prefix = before && !/\n{2}$/.test(before) ? "\n\n" : "";
    var suffix = after && !/^\n{2}/.test(after) ? "\n\n" : "";
    var insertion = prefix + content + suffix;
    applyEdit(at, at, insertion, at + insertion.length, at + insertion.length);
    pasteBlock = null;
  }

  preview.addEventListener("pointerdown", function (e) { pasteBlock = topBlock(e.target); });
  document.addEventListener("paste", pasteIntoPreview);

  // A heading copies its whole section: until the next heading of the same or higher level
  function blockGroup(el) {
    var m = /^H([1-6])$/.exec(el.tagName);
    if (!m) return [el];
    var level = +m[1], group = [el], n = el.nextElementSibling;
    while (n) {
      var hm = /^H([1-6])$/.exec(n.tagName);
      if (hm && +hm[1] <= level) break;
      group.push(n);
      n = n.nextElementSibling;
    }
    return group;
  }

  function markGroup(on) {
    preview.querySelectorAll(".copy-target").forEach(function (el) { el.classList.remove("copy-target"); });
    if (on && blockTarget) blockGroup(blockTarget).forEach(function (el) { el.classList.add("copy-target"); });
  }

  function showBlockBtn(el) {
    if (el === blockTarget && !blockBtn.hidden) return;
    blockTarget = el;
    var isHeading = /^H[1-6]$/.test(el.tagName);
    var label = isHeading ? tr("copy.sectionTitle") : tr("copy.blockTitle");
    blockBtn.title = label;
    blockBtn.setAttribute("aria-label", label);
    blockBtn.classList.toggle("is-section", isHeading);
    blockBtn.style.top = (el.offsetTop + (isHeading ? Math.max(0, (el.offsetHeight - 26) / 2) : 2)) + "px";
    blockBtn.style.left = Math.max(2, el.offsetLeft - 32) + "px";
    blockBtn.hidden = false;
  }

  function hideBlockBtn() {
    blockBtn.hidden = true;
    blockTarget = null;
    markGroup(false);
  }

  preview.addEventListener("mouseover", function (e) {
    var el = topBlock(e.target);
    if (el) showBlockBtn(el);
  });
  paneView.addEventListener("mouseleave", hideBlockBtn);
  blockBtn.addEventListener("mouseenter", function () { markGroup(true); });
  blockBtn.addEventListener("mouseleave", function () { markGroup(false); });
  blockBtn.addEventListener("focus", function () { markGroup(true); });
  blockBtn.addEventListener("blur", function () { markGroup(false); });
  blockBtn.addEventListener("click", function () {
    if (!blockTarget || !preview.contains(blockTarget)) { hideBlockBtn(); return; }
    var group = blockGroup(blockTarget);
    var div = document.createElement("div");
    group.forEach(function (el) {
      var clone = el.cloneNode(true);
      // cloneNode drops the diagram source kept on the element; copy it over
      var src = el.classList.contains("mermaid-wrap") ? [el] : Array.prototype.slice.call(el.querySelectorAll(".mermaid-wrap"));
      var dst = clone.classList.contains("mermaid-wrap") ? [clone] : Array.prototype.slice.call(clone.querySelectorAll(".mermaid-wrap"));
      dst.forEach(function (d, i) { if (src[i]) d._code = src[i]._code; });
      div.appendChild(clone);
    });
    // A code block alone copies as its exact code text for plain-text targets
    var code = group.length === 1 && blockTarget.classList.contains("code-wrap") ? blockTarget.querySelector("code") : null;
    copyHtml(div, group.length > 1 ? tr("copy.sectionDone", { title: blockTarget.textContent.trim().slice(0, 60) }) : tr("copy.blockDone"),
      code ? code.textContent : null);
    blockBtn.classList.add("done");
    setTimeout(function () { blockBtn.classList.remove("done"); }, 1200);
  });

  // ---------- global search (header) ----------
  // Folding keeps a map from each folded char back to its source index, so a match
  // found in "khong dau" text can be highlighted/selected in the original "không dấu" text.
  var FOLD_CH = Object.create(null);
  function foldChar(c) {
    var f = FOLD_CH[c];
    if (f === undefined) {
      f = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
      FOLD_CH[c] = f;
    }
    return f;
  }
  function foldMap(s) {
    var out = [], map = [];
    for (var i = 0; i < s.length; i++) {
      var f = foldChar(s.charAt(i));
      for (var k = 0; k < f.length; k++) { out.push(f.charAt(k)); map.push(i); }
    }
    return { text: out.join(""), map: map };
  }
  function foldQuery(s) { return foldMap(String(s).trim().replace(/\s+/g, " ")).text; }

  var searchIndex = Object.create(null);
  function docIndex(doc) {
    var c = doc.content || "";
    var ix = searchIndex[doc.id];
    if (ix && ix.content === c) return ix;
    var fm = foldMap(c);
    ix = { content: c, text: fm.text, map: fm.map, headings: scanHeadings(c) };
    searchIndex[doc.id] = ix;
    return ix;
  }
  function scanHeadings(c) {
    var out = [], pos = 0, inFence = false;
    c.split("\n").forEach(function (line) {
      if (/^ {0,3}(```|~~~)/.test(line)) inFence = !inFence;
      else if (!inFence) {
        var m = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t#]*$/);
        if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`~]/g, "").trim(), start: pos });
      }
      pos += line.length + 1;
    });
    return out;
  }

  var MAX_HITS_PER_DOC = 300, ITEMS_PER_DOC = 5, MAX_GROUPS = 30;
  var gsInput = $("gs-input"), gsPanel = $("gs-panel");
  var gsGroups = [], gsOptions = [], gsActive = -1, gsQuery = "", gsExpanded = {}, gsTimer;

  function searchAll(raw) {
    var q = foldQuery(raw);
    var groups = [];
    if (!q) return groups;
    sortedDocs().forEach(function (doc) {
      var title = getTitle(doc);
      var tf = foldMap(title);
      var ti = tf.text.indexOf(q);
      var ix = docIndex(doc);
      var items = [], total = 0;
      if (q.length >= 2 || ti >= 0) {
        var from = 0, idx, lastLine = -1, line = 1, scanned = 0, h = -1;
        while ((idx = ix.text.indexOf(q, from)) >= 0 && total < MAX_HITS_PER_DOC) {
          from = idx + q.length;
          total++;
          var s = ix.map[idx], e = ix.map[idx + q.length - 1] + 1;
          var ls = ix.content.lastIndexOf("\n", s - 1) + 1;
          if (ls === lastLine) { items[items.length - 1].extra++; continue; }
          lastLine = ls;
          for (; scanned < ls; scanned++) if (ix.content.charCodeAt(scanned) === 10) line++;
          while (h + 1 < ix.headings.length && ix.headings[h + 1].start <= s) h++;
          var le = ix.content.indexOf("\n", s);
          var heading = h >= 0 ? ix.headings[h] : null;
          items.push({
            doc: doc, q: q, s: s, e: e, fi: idx, ls: ls, le: le < 0 ? ix.content.length : le, line: line,
            isHeading: !!heading && heading.start === ls,
            section: heading && heading.start !== ls ? heading.text : (heading && h > 0 ? parentHeading(ix.headings, h) : ""),
            extra: 0
          });
        }
      }
      if (ti < 0 && !items.length) return;
      groups.push({
        doc: doc, title: title, total: total,
        titleHit: ti >= 0 ? [tf.map[ti], tf.map[ti + q.length - 1] + 1] : null,
        items: items
      });
    });
    groups.sort(function (a, b) { return (b.titleHit ? 1 : 0) - (a.titleHit ? 1 : 0); });
    return groups;
  }
  function parentHeading(hs, h) {
    for (var i = h - 1; i >= 0; i--) if (hs[i].level < hs[h].level) return hs[i].text;
    return "";
  }

  function markText(parent, text, a, b) {
    if (a > 0) parent.appendChild(document.createTextNode(text.slice(0, a)));
    var m = document.createElement("mark");
    m.textContent = text.slice(a, b);
    parent.appendChild(m);
    if (b < text.length) parent.appendChild(document.createTextNode(text.slice(b)));
  }

  function snippetInto(el, it) {
    var c = docIndex(it.doc).content;
    var line = c.slice(it.ls, it.le);
    var a = it.s - it.ls, b = Math.min(it.e - it.ls, line.length);
    var lead = (line.match(/^\s*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)*/) || [""])[0].length;
    if (lead > a) lead = 0;
    var start = Math.max(lead, a - 45);
    if (start > lead) { var sp = line.lastIndexOf(" ", a - 1); if (sp >= start - 15 && sp < a) start = sp + 1; }
    var end = Math.min(line.length, b + 100);
    var text = (start > lead ? "…" : "") + line.slice(start, end) + (end < line.length ? "…" : "");
    var off = start > lead ? 1 : 0;
    markText(el, text, a - start + off, b - start + off);
  }

  function makeOption(cls, onGo, completion) {
    var el = document.createElement("div");
    el.className = cls;
    el.setAttribute("role", "option");
    el.id = "gs-opt-" + gsOptions.length;
    var idx = gsOptions.length;
    el.addEventListener("mousedown", function (e) { e.preventDefault(); });
    el.addEventListener("mousemove", function () { if (gsActive !== idx) setActive(idx, false); });
    el.addEventListener("click", function () { onGo(); });
    gsOptions.push({ el: el, go: onGo, completion: completion });
    return el;
  }

  function wordAround(text, s, e) {
    var W = /[\p{L}\p{M}\p{N}_]/u;
    while (s > 0 && W.test(text.charAt(s - 1))) s--;
    while (e < text.length && W.test(text.charAt(e))) e++;
    return text.slice(s, e);
  }

  function renderSearch() {
    var raw = gsInput.value;
    gsQuery = foldQuery(raw);
    gsPanel.innerHTML = "";
    gsOptions = [];
    gsActive = -1;
    if (!gsQuery) { closeSearch(); return; }
    gsGroups = searchAll(raw);

    var hits = 0;
    gsGroups.forEach(function (g) { hits += g.total; });
    var sum = document.createElement("div");
    sum.className = "gs-summary";
    sum.textContent = gsGroups.length
      ? tr("gs.summary", { hits: hits, plus: hits >= MAX_HITS_PER_DOC ? "+" : "", docs: gsGroups.length, short: gsQuery.length < 2 })
      : "";
    if (gsGroups.length) gsPanel.appendChild(sum);
    else {
      var empty = document.createElement("div");
      empty.className = "gs-empty";
      empty.textContent = tr("gs.none", { q: raw.trim() });
      gsPanel.appendChild(empty);
    }

    gsGroups.slice(0, MAX_GROUPS).forEach(function (g) {
      var head = makeOption("gs-doc", function () { goToDoc(g.doc); },
        g.titleHit ? wordAround(g.title, g.titleHit[0], g.titleHit[1]) : null);
      head.appendChild(icon("file"));
      var t = document.createElement("span");
      t.className = "gs-title";
      if (g.titleHit) markText(t, g.title, g.titleHit[0], g.titleHit[1]); else t.textContent = g.title;
      head.appendChild(t);
      var f = folderOf(g.doc);
      if (f) {
        var fl = document.createElement("span");
        fl.className = "gs-folder";
        fl.appendChild(icon("folder"));
        fl.appendChild(document.createTextNode(f.name));
        head.appendChild(fl);
      }
      if (g.total) {
        var cnt = document.createElement("span");
        cnt.className = "gs-count";
        cnt.textContent = g.total + (g.total >= MAX_HITS_PER_DOC ? "+" : "");
        cnt.title = tr("gs.occurrences", { n: g.total });
        head.appendChild(cnt);
      }
      gsPanel.appendChild(head);

      var limit = gsExpanded[g.doc.id] ? g.items.length : ITEMS_PER_DOC;
      g.items.slice(0, limit).forEach(function (it) {
        var c = docIndex(it.doc).content;
        var row = makeOption("gs-item" + (it.isHeading ? " is-heading" : ""), function () { goToHit(it); },
          wordAround(c, it.s, it.e));
        var sn = document.createElement("div");
        sn.className = "gs-snip";
        if (it.isHeading) {
          var hs = document.createElement("span");
          hs.className = "gs-hash";
          hs.textContent = "#";
          sn.appendChild(hs);
        }
        snippetInto(sn, it);
        row.appendChild(sn);
        var meta = document.createElement("div");
        meta.className = "gs-meta";
        var parts = [];
        if (it.section) parts.push("§ " + it.section);
        parts.push(tr("gs.line", { n: it.line }));
        if (it.extra) parts.push(tr("gs.onLine", { n: it.extra + 1 }));
        meta.textContent = parts.join(" · ");
        row.appendChild(meta);
        gsPanel.appendChild(row);
      });
      if (g.items.length > limit) {
        var more = makeOption("gs-more", function () {
          gsExpanded[g.doc.id] = true;
          var keep = gsPanel.scrollTop;
          renderSearch();
          gsPanel.scrollTop = keep;
        }, null);
        more.textContent = tr("gs.more", { n: g.items.length - limit });
        gsPanel.appendChild(more);
      }
    });
    if (gsGroups.length > MAX_GROUPS) {
      var rest = document.createElement("div");
      rest.className = "gs-empty";
      rest.textContent = tr("gs.rest", { n: gsGroups.length - MAX_GROUPS });
      gsPanel.appendChild(rest);
    }

    var foot = document.createElement("div");
    foot.className = "gs-foot";
    foot.innerHTML = tr("gs.foot"); // static markup from i18n.js
    gsPanel.appendChild(foot);

    gsPanel.hidden = false;
    gsInput.setAttribute("aria-expanded", "true");
    if (gsOptions.length) setActive(0, false);
  }

  function completionFor(opt) {
    if (!opt || !opt.completion) return "";
    var c = opt.completion.trim();
    var fc = foldQuery(c);
    // Only offer it when it extends (or adds diacritics to) what the user typed
    if (!c || c === gsInput.value.trim() || fc.indexOf(gsQuery) < 0) return "";
    return c;
  }

  function setActive(i, scroll) {
    if (gsActive >= 0 && gsOptions[gsActive]) gsOptions[gsActive].el.removeAttribute("aria-selected");
    gsActive = i;
    var opt = gsOptions[i];
    if (!opt) { gsInput.removeAttribute("aria-activedescendant"); return; }
    opt.el.setAttribute("aria-selected", "true");
    gsInput.setAttribute("aria-activedescendant", opt.el.id);
    if (scroll !== false) opt.el.scrollIntoView({ block: "nearest" });
    var hint = $("gs-complete");
    var comp = completionFor(opt);
    if (hint) {
      hint.textContent = "";
      if (comp) {
        var k = document.createElement("kbd");
        k.textContent = "Tab";
        hint.appendChild(k);
        hint.appendChild(document.createTextNode(tr("gs.complete", { w: comp })));
      }
    }
  }

  function closeSearch() {
    gsPanel.hidden = true;
    gsInput.setAttribute("aria-expanded", "false");
    gsInput.removeAttribute("aria-activedescendant");
  }

  function goToDoc(doc) {
    closeSearch();
    gsInput.blur();
    if (current !== doc) open(doc);
    else { paneView.scrollTop = 0; editor.scrollTop = 0; }
  }

  function goToHit(it) {
    closeSearch();
    gsInput.blur();
    if (docs.indexOf(it.doc) < 0) return;
    if (current !== it.doc) open(it.doc);
    var mode = app.dataset.mode;
    var len = editor.value.length;
    var s = Math.min(it.s, len), e = Math.min(it.e, len);
    syncLock = "restore"; // our own scrolling below must not trigger sync-scroll
    clearTimeout(syncTimer);
    if (mode === "pro") {
      editor.setSelectionRange(s, e);
      proEditor.focus();
    } else if (mode !== "view") {
      editor.blur();
      editor.setSelectionRange(s, e);
      editor.focus(); // focusing scrolls the selection into view
    } else {
      editor.setSelectionRange(s, e);
    }
    if (mode === "view") revealInPreview(it);
    syncTimer = setTimeout(function () { syncLock = null; }, 400);
    updateCursor();
  }

  // Locate the match inside the rendered preview: block via data-src, then the n-th occurrence inside it
  function revealInPreview(it) {
    var blocks = preview.querySelectorAll(":scope > [data-src]");
    var block = null;
    for (var i = 0; i < blocks.length; i++) {
      if (+blocks[i].getAttribute("data-src") <= it.s) block = blocks[i]; else break;
    }
    if (!block) return;
    var ix = docIndex(current);
    var bStart = +block.getAttribute("data-src");
    var lo = 0, hi = ix.map.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (ix.map[mid] < bStart) lo = mid + 1; else hi = mid; }
    var nth = 0, p = lo, f;
    while ((f = ix.text.indexOf(gsQueryFor(it), p)) >= 0 && f < it.fi) { nth++; p = f + 1; }

    var range = findInBlock(block, gsQueryFor(it), nth);
    block.classList.remove("search-flash");
    void block.offsetWidth; // restart the animation
    block.classList.add("search-flash");
    setTimeout(function () { block.classList.remove("search-flash"); }, 1800);

    var pr = paneView.getBoundingClientRect();
    var r = range ? range.getBoundingClientRect() : block.getBoundingClientRect();
    paneView.scrollTop += r.top - pr.top - paneView.clientHeight / 3;
    if (range && window.CSS && CSS.highlights && window.Highlight) {
      CSS.highlights.set("md-search", new Highlight(range));
      clearTimeout(hlTimer);
      hlTimer = setTimeout(clearSearchHighlight, 4000);
    }
  }
  function gsQueryFor(it) { return it.q; }

  var hlTimer;
  function clearSearchHighlight() {
    clearTimeout(hlTimer);
    if (window.CSS && CSS.highlights) CSS.highlights.delete("md-search");
  }

  function findInBlock(block, q, nth) {
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return n.parentNode.closest(".code-copy, .block-copy") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var text = [], nodes = [], offs = [], n;
    while ((n = walker.nextNode())) {
      var v = n.nodeValue;
      for (var i = 0; i < v.length; i++) {
        var fch = foldChar(v.charAt(i));
        for (var k = 0; k < fch.length; k++) { text.push(fch.charAt(k)); nodes.push(n); offs.push(i); }
      }
    }
    var str = text.join(""), found = -1, from = 0, count = 0, at;
    while ((at = str.indexOf(q, from)) >= 0) {
      if (found < 0) found = at; // fallback: first occurrence
      if (count === nth) { found = at; break; }
      count++;
      from = at + 1;
    }
    if (found < 0) return null;
    var last = found + q.length - 1;
    var range = document.createRange();
    range.setStart(nodes[found], offs[found]);
    range.setEnd(nodes[last], offs[last] + 1);
    return range;
  }

  gsInput.addEventListener("input", function () {
    gsExpanded = {};
    clearTimeout(gsTimer);
    gsTimer = setTimeout(renderSearch, 90);
  });
  gsInput.addEventListener("focus", function () {
    if (gsInput.value.trim()) renderSearch();
  });
  gsInput.addEventListener("blur", function () { setTimeout(closeSearch, 120); });
  gsInput.addEventListener("keydown", function (e) {
    var open = !gsPanel.hidden && gsOptions.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (gsPanel.hidden) renderSearch();
      else if (open) setActive((gsActive + 1) % gsOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (open) setActive((gsActive - 1 + gsOptions.length) % gsOptions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(gsTimer);
      if (gsPanel.hidden || foldQuery(gsInput.value) !== gsQuery) renderSearch();
      var opt = gsOptions[gsActive];
      if (opt) opt.go();
    } else if (e.key === "Tab" && !e.shiftKey && open) {
      var comp = completionFor(gsOptions[gsActive]);
      if (comp) {
        e.preventDefault();
        gsInput.value = comp;
        gsExpanded = {};
        renderSearch();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!gsPanel.hidden) closeSearch();
      else if (gsInput.value) gsInput.value = "";
      else gsInput.blur();
    }
  });

  // ---------- backup / restore ----------
  function backup() {
    persist(true);
    var d = new Date();
    var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
    var data = { app: "md.local", version: 2, exported: d.toISOString(), folders: folders, docs: docs };
    download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "md-helper-backup-" + stamp + ".json");
    toast(tr("backup.done", { n: docs.length }));
  }

  function restore(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { toast(tr("backup.invalid"), { type: "error" }); return; }
    var list = Array.isArray(data) ? data : data && data.docs;
    if (!Array.isArray(list)) { toast(tr("backup.badFormat"), { type: "error" }); return; }
    var added = 0, updated = 0;
    var rawFolders = data && Array.isArray(data.folders) ? data.folders : [];
    rawFolders.forEach(function (raw) {
      if (!raw || typeof raw.id !== "string" || !raw.id || typeof raw.name !== "string") return;
      if (findFolder(raw.id)) return;
      folders.push({ id: raw.id, name: raw.name.slice(0, 80) || tr("folder.default"), collapsed: !!raw.collapsed, created: Number(raw.created) || Date.now() });
    });
    list.forEach(function (raw) {
      if (!raw || typeof raw.content !== "string") return;
      var doc = {
        id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
        title: typeof raw.title === "string" ? raw.title : "",
        titleAuto: raw.titleAuto !== false,
        pinned: !!raw.pinned,
        folderId: typeof raw.folderId === "string" && raw.folderId ? raw.folderId : null,
        content: normalizeEol(raw.content),
        updated: Number(raw.updated) || Date.now()
      };
      var existing = docs.find(function (d) { return d.id === doc.id; });
      if (!existing) { docs.push(doc); added++; }
      else if (doc.updated > existing.updated) { Object.assign(existing, doc); updated++; }
    });
    if (!persist()) return;
    open(docs.indexOf(current) >= 0 ? current : sortedDocs()[0]);
    toast(tr("restore.done", { added: added, updated: updated }), { timeout: 4000 });
  }

  // ---------- file open ----------
  function readFiles(fileList, folderId) {
    var folder = findFolder(folderId);
    var files = Array.prototype.filter.call(fileList, function (f) {
      return /\.(md|markdown|mdown|mkd|txt)$/i.test(f.name) || /^text\//.test(f.type);
    });
    var skipped = fileList.length - files.length;
    if (!files.length) {
      toast(tr("file.unsupported"), { type: "error" });
      return;
    }
    Promise.all(files.map(function (f) {
      return f.text().then(function (content) { return { name: f.name, content: normalizeEol(content) }; });
    })).then(function (items) {
      var last;
      items.forEach(function (it) {
        // Use file name as title only when the content has no heading
        var hasHeading = /^ {0,3}#{1,6}[ \t]+\S/m.test(it.content);
        last = create(it.content, hasHeading ? "" : it.name.replace(/\.[^.]+$/, ""), true, folder && folder.id);
      });
      persist();
      if (searchInput.value) searchInput.value = "";
      open(last);
      toast((items.length === 1 ? tr("file.opened1", { name: items[0].name }) : tr("file.openedN", { n: items.length })) +
        (folder ? tr("file.into", { folder: folder.name }) : "") +
        (skipped ? tr("file.skipped", { n: skipped }) : ""));
    }, function () { toast(tr("file.readFail"), { type: "error" }); });
  }

  // ---------- toasts ----------
  function toast(msg, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "toast" + (opts.type ? " toast-" + opts.type : "");
    el.setAttribute("role", opts.type === "error" ? "alert" : "status");
    var m = document.createElement("span");
    m.className = "toast-msg";
    m.textContent = msg;
    el.appendChild(m);
    var timer;
    var close = function () {
      clearTimeout(timer);
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 200);
    };
    if (opts.action) {
      var a = document.createElement("button");
      a.className = "toast-action";
      a.textContent = opts.action.label;
      a.addEventListener("click", function () { close(); opts.action.fn(); });
      el.appendChild(a);
    }
    var x = document.createElement("button");
    x.className = "toast-close";
    x.setAttribute("aria-label", tr("toast.close"));
    x.textContent = "×";
    x.addEventListener("click", close);
    el.appendChild(x);
    var box = $("toasts");
    while (box.children.length >= 3) box.firstChild.remove();
    box.appendChild(el);
    timer = setTimeout(close, opts.timeout || 2500);
  }

  // ---------- menus ----------
  function setSort(sortBy) {
    prefs.sort = sortBy;
    savePrefs();
    applySortMenu();
    renderList();
  }

  function applySortMenu() {
    var s = prefs.sort || "updated";
    var m = $("menu-sort");
    if (!m) return;
    m.querySelectorAll("[data-action^='sort-']").forEach(function (b) {
      var k = b.dataset.action.slice(5);
      var checked = k === s;
      b.setAttribute("aria-checked", String(checked));
      var old = b.querySelector("svg.i");
      if (old) old.remove();
      if (checked) b.appendChild(icon("check"));
    });
  }

  var actions = {
    "export-md": exportMd,
    "export-html": exportHtml,
    "export-doc": exportWord,
    "export-pdf": exportPdf,
    "export-zip": exportZip,
    "copy-rich": copyRich,
    "copy-md": function () {
      copyText(editor.value).then(function () { toast(tr("copy.mdDone")); },
        function () { toast(tr("copyFail"), { type: "error" }); });
    },
    backup: backup,
    restore: function () { $("backup-input").click(); },
    "empty-trash": emptyTrash,
    "tpl-meeting": function () { createFromTemplate("meeting"); },
    "tpl-readme": function () { createFromTemplate("readme"); },
    "tpl-spec": function () { createFromTemplate("spec"); },
    "tpl-tasks": function () { createFromTemplate("tasks"); },
    "tpl-math": function () { createFromTemplate("math"); },
    "sort-updated": function () { setSort("updated"); },
    "sort-title": function () { setSort("title"); },
    "sort-length": function () { setSort("length"); }
  };

  function closeMenus() {
    document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
    document.querySelectorAll("[aria-haspopup='menu']").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    if (moveMenu) { moveMenu.remove(); moveMenu = null; }
    closeTablePicker();
  }

  function menuKeys(e, menu, btn) {
    var items = Array.prototype.slice.call(menu.querySelectorAll("button"));
    var i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      closeMenus();
      if (btn && document.body.contains(btn)) btn.focus();
    }
  }

  function setupMenu(btn, menu) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = menu.hidden;
      closeMenus();
      if (willOpen) {
        menu.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        var first = menu.querySelector("button");
        if (first) first.focus();
      }
    });
    menu.addEventListener("click", function (e) {
      var item = e.target.closest("[data-action]");
      if (!item) return;
      closeMenus();
      btn.focus();
      actions[item.dataset.action]();
    });
    menu.addEventListener("keydown", function (e) { menuKeys(e, menu, btn); });
  }

  // ---------- find & replace in editor ----------
  var findBar = $("find-bar"), frFind = $("fr-find"), frReplace = $("fr-replace");
  var frCount = $("fr-count"), frCaseBtn = $("fr-case");
  var frCase = false, frMatches = [], frIndex = -1;

  function computeFindMatches() {
    frMatches = [];
    var q = frFind.value;
    if (!q) {
      frIndex = -1;
      frCount.textContent = "";
      frCount.classList.remove("no-match");
      return;
    }
    var src = editor.value || "";
    if (frCase) {
      var pos = 0, at;
      while ((at = src.indexOf(q, pos)) >= 0) {
        frMatches.push({ s: at, e: at + q.length });
        pos = at + Math.max(1, q.length);
      }
    } else {
      var fq = foldMap(q).text;
      if (fq) {
        var fm = foldMap(src);
        var fpos = 0, fat;
        while ((fat = fm.text.indexOf(fq, fpos)) >= 0) {
          frMatches.push({ s: fm.map[fat], e: fm.map[fat + fq.length - 1] + 1 });
          fpos = fat + Math.max(1, fq.length);
        }
      }
    }
    if (!frMatches.length) {
      frIndex = -1;
      frCount.textContent = "0 / 0";
      frCount.classList.add("no-match");
      return;
    }
    frCount.classList.remove("no-match");
    if (frIndex < 0 || frIndex >= frMatches.length) {
      var cur = editor.selectionStart;
      frIndex = 0;
      for (var i = 0; i < frMatches.length; i++) {
        if (frMatches[i].s >= cur) { frIndex = i; break; }
      }
    }
    frCount.textContent = (frIndex + 1) + " / " + frMatches.length;
  }

  function selectFindMatch(focusEditor) {
    if (frIndex < 0 || frIndex >= frMatches.length) return;
    var m = frMatches[frIndex];
    frCount.textContent = (frIndex + 1) + " / " + frMatches.length;
    var active = document.activeElement;
    editor.blur();
    editor.setSelectionRange(m.s, m.e);
    editor.focus();
    if (!focusEditor && active && active !== editor) active.focus();
    updateCursor();
  }

  function openFindBar(focusReplace) {
    if (app.dataset.mode === "view" || app.dataset.mode === "pro") setMode("split");
    findBar.hidden = false;
    var sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (sel && sel.indexOf("\n") < 0 && sel.length <= 120) frFind.value = sel;
    computeFindMatches();
    if (focusReplace && frFind.value) {
      frReplace.focus();
      frReplace.select();
    } else {
      frFind.focus();
      frFind.select();
    }
  }

  function closeFindBar() {
    if (findBar.hidden) return;
    findBar.hidden = true;
    editor.focus();
  }

  function findStep(dir) {
    computeFindMatches();
    if (!frMatches.length) return;
    frIndex = (frIndex + dir + frMatches.length) % frMatches.length;
    selectFindMatch(false);
  }

  function replaceOne() {
    computeFindMatches();
    if (!frMatches.length) return;
    if (frIndex < 0 || frIndex >= frMatches.length) frIndex = 0;
    var m = frMatches[frIndex];
    var rep = frReplace.value;
    applyEdit(m.s, m.e, rep, m.s, m.s + rep.length);
    computeFindMatches();
    if (frMatches.length) {
      if (frIndex >= frMatches.length) frIndex = 0;
      selectFindMatch(false);
    }
  }

  function replaceAllMatches() {
    computeFindMatches();
    if (!frMatches.length) return;
    var count = frMatches.length;
    var rep = frReplace.value;
    var src = editor.value;
    var out = [], last = 0;
    for (var i = 0; i < frMatches.length; i++) {
      out.push(src.slice(last, frMatches[i].s), rep);
      last = frMatches[i].e;
    }
    out.push(src.slice(last));
    var nextVal = out.join("");
    applyEdit(0, src.length, nextVal, editor.selectionStart, editor.selectionStart);
    computeFindMatches();
    toast(tr("fr.replaced", { n: count }));
  }

  frFind.addEventListener("input", function () {
    frIndex = -1;
    computeFindMatches();
    if (frMatches.length) selectFindMatch(false);
  });
  frFind.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFindBar(); }
  });
  frReplace.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); if (e.ctrlKey || e.metaKey) replaceAllMatches(); else replaceOne(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFindBar(); }
  });
  frCaseBtn.addEventListener("click", function () {
    frCase = !frCase;
    frCaseBtn.setAttribute("aria-pressed", String(frCase));
    frIndex = -1;
    computeFindMatches();
    if (frMatches.length) selectFindMatch(false);
  });
  $("fr-prev").addEventListener("click", function () { findStep(-1); });
  $("fr-next").addEventListener("click", function () { findStep(1); });
  $("fr-replace-one").addEventListener("click", replaceOne);
  $("fr-replace-all").addEventListener("click", replaceAllMatches);
  $("fr-close").addEventListener("click", closeFindBar);

  // ---------- events: editor ----------
  function isCursorInFence(val, pos) {
    var lines = val.slice(0, pos).split("\n"), inFence = false;
    for (var i = 0; i < lines.length; i++) {
      if (/^ {0,3}(```|~~~)/.test(lines[i])) inFence = !inFence;
    }
    return inFence;
  }

  function rowsToMarkdownTable(rows) {
    if (!rows || rows.length < 2) return "";
    var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    if (cols < 2) return "";
    var clean = function (s) {
      return String(s || "").replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
    };
    var fmtRow = function (r) {
      var cells = [];
      for (var c = 0; c < cols; c++) cells.push(clean(r[c]));
      return "| " + cells.join(" | ") + " |";
    };
    var sep = [];
    for (var c = 0; c < cols; c++) sep.push("---");
    var out = [fmtRow(rows[0]), "| " + sep.join(" | ") + " |"];
    for (var i = 1; i < rows.length; i++) out.push(fmtRow(rows[i]));
    return out.join("\n");
  }

  editor.addEventListener("paste", function (e) {
    var cd = e.clipboardData;
    if (!cd) return;
    var s = editor.selectionStart, en = editor.selectionEnd, v = editor.value;
    var text = cd.getData("text/plain") || "";

    // 1. Smart URL paste over selected text -> [selected](url)
    if (s < en && /^https?:\/\/\S+$/i.test(text.trim())) {
      var sel = v.slice(s, en);
      if (sel.indexOf("\n") < 0 && !/^https?:\/\//i.test(sel.trim())) {
        e.preventDefault();
        var url = text.trim();
        var md = "[" + sel + "](" + url + ")";
        applyEdit(s, en, md, s + 1, s + 1 + sel.length);
        return;
      }
    }

    // 2. Smart Table paste (from Excel / Google Sheets TSV or HTML <table>) when outside code fences
    if (!isCursorInFence(v, s)) {
      var html = cd.getData("text/html") || "";
      if (/<table[\s>]/i.test(html)) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var tbl = doc.querySelector("table");
        if (tbl && !tbl.querySelector("table")) {
          var rows = Array.prototype.slice.call(tbl.querySelectorAll("tr")).map(function (trEl) {
            return Array.prototype.slice.call(trEl.querySelectorAll("th, td")).map(function (cell) {
              return cell.textContent || "";
            });
          }).filter(function (r) { return r.length > 0; });
          var mdTbl = rowsToMarkdownTable(rows);
          if (mdTbl) {
            e.preventDefault();
            insertBlock(mdTbl, mdTbl.length, mdTbl.length);
            return;
          }
        }
      }
      if (text.indexOf("\t") >= 0 && text.indexOf("\n") >= 0) {
        var lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
        if (lines.length >= 2) {
          var tabCounts = lines.map(function (l) { return (l.match(/\t/g) || []).length; });
          if (tabCounts[0] >= 1 && tabCounts.every(function (n) { return n === tabCounts[0]; })) {
            var tsvRows = lines.map(function (l) { return l.split("\t"); });
            var tsvMd = rowsToMarkdownTable(tsvRows);
            if (tsvMd) {
              e.preventDefault();
              insertBlock(tsvMd, tsvMd.length, tsvMd.length);
              return;
            }
          }
        }
      }
    }
  });

  editor.addEventListener("input", function () {
    onContentChange();
    if (!findBar.hidden) computeFindMatches();
  });
  editor.addEventListener("scroll", function () { syncScroll(editor, paneView); });
  ["keyup", "click", "select"].forEach(function (ev) { editor.addEventListener(ev, updateCursor); });
  proEditor.addEventListener("input", function () {
    syncProToMarkdown();
    if (activeProTable) positionProTableUi();
    if (activeProMedia) positionProMediaUi();
  });
  proEditor.addEventListener("change", syncProToMarkdown);
  document.addEventListener("paste", pasteIntoPro);
  proEditor.addEventListener("click", function (e) {
    var alertTitle = e.target.closest(".markdown-alert-title");
    if (alertTitle && proEditor.contains(alertTitle)) {
      e.preventDefault();
      var alertBox = alertTitle.closest(".markdown-alert");
      if (alertBox) cycleProAlert(alertBox);
      return;
    }
    var mathNode = e.target.closest("[data-math]");
    if (mathNode && proEditor.contains(mathNode)) {
      e.preventDefault();
      editProMathNode(mathNode);
      return;
    }
    var imgNode = e.target.closest("img");
    if (imgNode && proEditor.contains(imgNode)) {
      showProMediaBarFor(imgNode);
    } else if (activeProMedia && activeProMedia.tagName === "IMG") {
      clearProMediaHighlights();
      activeProMedia = null;
      if (proMediaBar) proMediaBar.hidden = true;
    }
    var linkNode = e.target.closest("a[href]");
    if (linkNode && proEditor.contains(linkNode)) {
      e.preventDefault();
      showProMediaBarFor(linkNode);
    }
    rememberProSelection();
  });
  ["keyup", "mouseup"].forEach(function (ev) { proEditor.addEventListener(ev, rememberProSelection); });
  document.addEventListener("selectionchange", rememberProSelection);

  proTableBar.addEventListener("mousedown", function (e) { e.preventDefault(); });
  proTableBar.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-table-cmd]");
    if (btn) runProTableAction(btn.getAttribute("data-table-cmd"));
  });
  proAddRowEdge.addEventListener("mousedown", function (e) { e.preventDefault(); });
  proAddRowEdge.addEventListener("click", function () { runProTableAction("row-end"); });
  proAddColEdge.addEventListener("mousedown", function (e) { e.preventDefault(); });
  proAddColEdge.addEventListener("click", function () { runProTableAction("col-end"); });
  proMediaBar.addEventListener("mousedown", function (e) { e.preventDefault(); });

  proEditor.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey) {
      var k = e.key.toLowerCase();
      var proMap = { b: "bold", i: "italic", u: "underline", k: "link", e: "code" };
      if (proMap[k]) {
        e.preventDefault();
        runProCommand(proMap[k]);
        return;
      }
    }
    var sel = window.getSelection();
    var node = sel && sel.rangeCount ? sel.anchorNode : null;
    var el = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
    var cell = el && proEditor.contains(el) ? el.closest("td, th") : null;
    if (!cell) return;
    var table = cell.closest("table");
    if (!table || !proEditor.contains(table)) return;
    activeProCell = cell;
    activeProTable = table;

    if (e.key === "Tab" && !mod && !e.altKey) {
      e.preventDefault();
      var allCells = Array.prototype.slice.call(table.querySelectorAll("th, td"));
      var idx = allCells.indexOf(cell);
      if (idx < 0) return;
      if (!e.shiftKey) {
        if (idx + 1 < allCells.length) {
          focusProCell(allCells[idx + 1], true);
        } else {
          // At the very last cell of the table: append a new row and focus its first cell
          runProTableAction("row-end");
        }
      } else if (idx > 0) {
        focusProCell(allCells[idx - 1], true);
      }
      return;
    }

    if (e.key === "Enter" && mod && !e.altKey) {
      e.preventDefault();
      runProTableAction(e.shiftKey ? "row-above" : "row-below");
      return;
    }

    if (e.key === "Enter" && !mod && !e.altKey && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      var rows = Array.prototype.slice.call(table.rows);
      var rIdx = rows.indexOf(cell.parentElement);
      var cIdx = cell.cellIndex;
      if (rIdx + 1 < rows.length && rows[rIdx + 1].cells[cIdx]) {
        focusProCell(rows[rIdx + 1].cells[cIdx], false);
      } else {
        runProTableAction("row-below");
      }
      return;
    }

    if (e.altKey && !mod && !e.shiftKey) {
      var arrowMap = {
        ArrowUp: "row-up",
        ArrowDown: "row-down",
        ArrowLeft: "col-left-move",
        ArrowRight: "col-right-move"
      };
      if (arrowMap[e.key]) {
        e.preventDefault();
        runProTableAction(arrowMap[e.key]);
      }
    }
  });

  var WRAP_PAIRS = {
    "*": ["*", "*"], "_": ["_", "_"], "`": ["`", "`"], "~": ["~~", "~~"],
    "[": ["[", "]"], "(": ["(", ")"], "{": ["{", "}"], '"': ['"', '"'], "'": ["'", "'"], "$": ["$", "$"]
  };

  var tabEscape = false;
  editor.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      if (!findBar.hidden) { e.preventDefault(); closeFindBar(); return; }
      tabEscape = true;
      return;
    }

    if (!mod && !e.altKey && !e.isComposing && editor.selectionStart < editor.selectionEnd && WRAP_PAIRS[e.key]) {
      var pair = WRAP_PAIRS[e.key];
      var ws = editor.selectionStart, we = editor.selectionEnd;
      var wsel = editor.value.slice(ws, we);
      if (wsel.indexOf("\n") < 0) {
        e.preventDefault();
        applyEdit(ws, we, pair[0] + wsel + pair[1], ws + pair[0].length, we + pair[0].length);
        return;
      }
    }

    if (mod && !e.altKey && !e.shiftKey) {
      var k = e.key.toLowerCase();
      var map = { b: "bold", i: "italic", k: "link", e: "code" };
      if (map[k]) { e.preventDefault(); runCommand(map[k]); return; }
    }

    if (e.key === "Tab" && !mod && !e.altKey) {
      if (tabEscape) { tabEscape = false; return; } // let focus leave the editor
      e.preventDefault();
      var s = editor.selectionStart, en = editor.selectionEnd, v = editor.value;
      var r = lineRange();
      var multi = v.slice(s, en).indexOf("\n") >= 0;
      if (multi || e.shiftKey || LIST_RE.test(r.text)) {
        var lines = r.text.split("\n");
        var out = lines.map(function (l) {
          return e.shiftKey ? l.replace(/^( {1,2}|\t)/, "") : (l || lines.length === 1 ? "  " + l : l);
        }).join("\n");
        if (multi) applyEdit(r.start, r.end, out, r.start, r.start + out.length);
        else {
          var shift = out.length - r.text.length;
          applyEdit(r.start, r.end, out, Math.max(r.start, s + shift), Math.max(r.start, en + shift));
        }
      } else {
        applyEdit(s, en, "  ");
      }
      return;
    }
    tabEscape = false;

    if (e.key === "Enter" && !mod && !e.shiftKey && !e.altKey && !e.isComposing) {
      var pos = editor.selectionStart;
      if (pos !== editor.selectionEnd) return;
      var val = editor.value;
      var ls = val.lastIndexOf("\n", pos - 1) + 1;
      var before = val.slice(ls, pos);
      var m = before.match(/^((?:[ \t]*>)*[ \t]*)(?:([-*+])|(\d+)([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/);
      if (!m) return;
      var lineEnd = val.indexOf("\n", pos);
      if (lineEnd < 0) lineEnd = val.length;
      e.preventDefault();
      if (!before.slice(m[0].length).trim() && !val.slice(pos, lineEnd).trim()) {
        // Enter on an empty list item ends the list
        applyEdit(ls, lineEnd, "");
        return;
      }
      var marker = m[3] ? (parseInt(m[3], 10) + 1) + m[4] : m[2];
      applyEdit(pos, pos, "\n" + m[1] + marker + m[5] + (m[6] ? "[ ] " : ""));
    }
  });

  // ---------- events: title ----------
  titleInput.addEventListener("input", function () {
    current.title = titleInput.value;
    current.titleAuto = false;
    current.updated = Date.now();
    titleInput.classList.remove("auto");
    btnAutoTitle.hidden = false;
    document.title = getTitle(current) + " - " + appName();
    persistSoon();
    renderList();
  });
  titleInput.addEventListener("blur", function () {
    // Empty title falls back to auto-detection
    if (!titleInput.value.trim()) {
      current.titleAuto = true;
      current.title = "";
      persistSoon();
      renderTitle();
      renderList();
    }
  });
  titleInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && app.dataset.mode !== "view") {
      e.preventDefault();
      if (app.dataset.mode === "pro") proEditor.focus(); else editor.focus();
    }
  });
  btnAutoTitle.addEventListener("click", function () {
    current.titleAuto = true;
    current.title = "";
    persist();
    renderTitle();
    renderList();
  });

  // ---------- events: chrome ----------
  Object.keys(tabs).forEach(function (k) {
    tabs[k].addEventListener("click", function () { setMode(k); });
  });

  $("toolbar").addEventListener("mousedown", function (e) {
    if (app.dataset.mode === "pro") rememberProSelection();
    if (e.target.closest("[data-cmd], [data-pro-command]")) e.preventDefault();
  });
  $("toolbar").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cmd]");
    if (b) runCommand(b.dataset.cmd);
    var pro = e.target.closest("[data-pro-command]");
    if (pro) runProCommand(pro.dataset.proCommand);
  });
  $("pro-font-family").addEventListener("change", function () {
    runProCommand("fontName", this.value);
    this.value = "";
  });
  $("pro-font-size").addEventListener("change", function () {
    runProCommand("fontSize", this.value);
    this.value = "";
  });
  $("pro-text-color").addEventListener("change", function () {
    runProCommand("foreColor", this.value);
  });
  $("pro-highlight-color").addEventListener("change", function () {
    runProCommand("hiliteColor", this.value);
  });

  $("btn-sync").addEventListener("click", function () {
    prefs.sync = !prefs.sync;
    this.setAttribute("aria-pressed", String(prefs.sync));
    savePrefs();
    if (prefs.sync) syncScroll(editor, paneView);
  });

  paneView.addEventListener("scroll", function () {
    syncScroll(paneView, editor);
    if (!outlineRaf) outlineRaf = requestAnimationFrame(updateOutlineCurrent);
    if (app.dataset.mode === "pro") {
      if (activeProTable) positionProTableUi();
      if (activeProMedia) positionProMediaUi();
    }
  });

  $("btn-new").addEventListener("click", function () { create(""); });
  $("btn-sidebar").addEventListener("click", function () { setSidebar(!sidebarVisible()); });
  $("scrim").addEventListener("click", function () { setSidebar(false); });
  $("btn-outline").addEventListener("click", function () { setOutline(outline.hidden); });
  $("btn-outline-close").addEventListener("click", function () { setOutline(false); });
  $("btn-theme").addEventListener("click", cycleTheme);
  $("btn-lang").addEventListener("click", switchLanguage);
  $("btn-help").addEventListener("click", function () { $("help").showModal(); });
  $("font-dec").addEventListener("click", function () { changeFont(-0.1); });
  $("font-inc").addEventListener("click", function () { changeFont(0.1); });

  $("btn-open").addEventListener("click", function () { $("file-input").click(); });
  $("file-input").addEventListener("change", function (e) {
    if (e.target.files.length) readFiles(e.target.files);
    e.target.value = "";
  });
  $("backup-input").addEventListener("change", function (e) {
    var f = e.target.files[0];
    e.target.value = "";
    if (f) f.text().then(restore);
  });

  setupMenu($("btn-export"), $("menu-export"));
  setupMenu($("btn-more"), $("menu-more"));
  setupMenu($("btn-templates"), $("menu-templates"));
  setupMenu($("btn-sort"), $("menu-sort"));
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-wrap, .menu-floating, .table-picker, [data-cmd='table']")) closeMenus();
  });
  $("btn-new-folder").addEventListener("click", function () { createFolder(true); });
  $("doc-folder").addEventListener("click", function (e) {
    e.stopPropagation();
    openMoveMenu(current, $("doc-folder"));
  });
  window.addEventListener("resize", function () {
    if (moveMenu || tablePicker) closeMenus();
    if (app.dataset.mode === "pro") {
      if (activeProTable) positionProTableUi();
      if (activeProMedia) positionProMediaUi();
    }
  });
  docList.addEventListener("scroll", function () { if (moveMenu) closeMenus(); });

  var searchTimer;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 80);
  });
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && searchInput.value) { e.stopPropagation(); searchInput.value = ""; renderList(); }
    else if (e.key === "ArrowDown" || e.key === "Enter") {
      var first = docList.querySelector(".doc-item");
      if (first) { e.preventDefault(); if (e.key === "Enter") first.click(); else first.focus(); }
    }
  });
  docList.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    var items = Array.prototype.slice.call(docList.querySelectorAll(".doc-item, .folder-toggle"))
      .filter(function (el) { return el.offsetParent !== null; });
    var i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    var next = items[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) next.focus(); else if (e.key === "ArrowUp") searchInput.focus();
  });

  // Split handle: drag, keyboard, double-click reset
  var handle = $("split-handle");
  handle.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
    document.body.classList.add("resizing");
  });
  handle.addEventListener("pointermove", function (e) {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    var rect = app.getBoundingClientRect();
    prefs.split = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
    applySplit();
  });
  function endDrag(e) {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    handle.classList.remove("dragging");
    document.body.classList.remove("resizing");
    prefs.split = Math.round(prefs.split * 10) / 10;
    savePrefs();
  }
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  handle.addEventListener("dblclick", function () { prefs.split = 50; applySplit(); savePrefs(); });
  handle.addEventListener("keydown", function (e) {
    var d = e.key === "ArrowLeft" ? -2 : e.key === "ArrowRight" ? 2 : 0;
    if (!d) return;
    e.preventDefault();
    prefs.split = Math.min(80, Math.max(20, prefs.split + d));
    applySplit();
    savePrefs();
  });

  // Sidebar handle: drag to resize, keyboard arrows, double-click resets
  var sbHandle = $("sidebar-handle");
  var SB_MIN = 200, SB_DEFAULT = 280;
  function sbMax() { return Math.max(SB_MIN, Math.min(720, window.innerWidth * 0.7)); }
  function applySidebarWidth() {
    prefs.sidebarWidth = Math.round(Math.min(sbMax(), Math.max(SB_MIN, prefs.sidebarWidth || SB_DEFAULT)));
    root.style.setProperty("--sidebar-w", prefs.sidebarWidth + "px");
  }
  sbHandle.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    sbHandle.setPointerCapture(e.pointerId);
    sbHandle.classList.add("dragging");
    document.body.classList.add("resizing");
  });
  sbHandle.addEventListener("pointermove", function (e) {
    if (!sbHandle.hasPointerCapture(e.pointerId)) return;
    prefs.sidebarWidth = e.clientX - $("sidebar").getBoundingClientRect().left;
    applySidebarWidth();
  });
  function endSbDrag(e) {
    if (!sbHandle.hasPointerCapture(e.pointerId)) return;
    sbHandle.releasePointerCapture(e.pointerId);
    sbHandle.classList.remove("dragging");
    document.body.classList.remove("resizing");
    savePrefs();
  }
  sbHandle.addEventListener("pointerup", endSbDrag);
  sbHandle.addEventListener("pointercancel", endSbDrag);
  sbHandle.addEventListener("dblclick", function () {
    prefs.sidebarWidth = SB_DEFAULT;
    applySidebarWidth();
    savePrefs();
  });
  sbHandle.addEventListener("keydown", function (e) {
    var d = e.key === "ArrowLeft" ? -20 : e.key === "ArrowRight" ? 20 : 0;
    if (!d) return;
    e.preventDefault();
    prefs.sidebarWidth += d;
    applySidebarWidth();
    savePrefs();
  });
  window.addEventListener("resize", applySidebarWidth);

  // Drag & drop files anywhere
  var dragDepth = 0;
  var overlay = $("drop-overlay");
  function hasFiles(e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0;
  }
  window.addEventListener("dragenter", function (e) {
    if (!hasFiles(e)) return;
    dragDepth++;
    overlay.hidden = false;
  });
  window.addEventListener("dragleave", function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) { overlay.hidden = true; setDropTarget(null); }
  });
  window.addEventListener("dragover", function (e) {
    if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  });
  window.addEventListener("drop", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    var target = e.target.closest ? e.target.closest(".folder[data-drop]") : null;
    setDropTarget(null);
    if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files, target && target.dataset.drop);
  });

  function isTyping(el) {
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  // Global shortcuts
  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    var k = e.key.toLowerCase();
    if (mod && !e.altKey && !e.shiftKey && k === "s") {
      e.preventDefault();
      if (persist()) toast(tr("savedToast"));
    } else if (mod && !e.altKey && !e.shiftKey && k === "o") {
      e.preventDefault();
      $("file-input").click();
    } else if (mod && !e.altKey && !e.shiftKey && k === "p") {
      e.preventDefault();
      exportPdf();
    } else if (mod && !e.altKey && e.key === "\\") {
      e.preventDefault();
      setSidebar(!sidebarVisible());
    } else if (mod && !e.altKey && (e.key === "/" || e.code === "Slash")) {
      e.preventDefault();
      var dlg = $("help");
      if (dlg.open) dlg.close(); else dlg.showModal();
    } else if (mod && !e.altKey && !e.shiftKey && (k === "f" || k === "h") && app.dataset.mode !== "view") {
      e.preventDefault();
      openFindBar(k === "h");
    } else if ((mod && e.shiftKey && !e.altKey && k === "f") ||
        (e.key === "/" && !mod && !e.altKey && !isTyping(e.target))) {
      e.preventDefault();
      gsInput.focus();
      gsInput.select();
    } else if (e.altKey && !mod && !e.shiftKey) {
      var modes = { Digit1: "edit", Digit2: "split", Digit3: "view", Digit4: "pro" };
      if (modes[e.code]) { e.preventDefault(); setMode(modes[e.code]); }
      else if (e.code === "KeyN") { e.preventDefault(); create(""); }
    } else if (e.key === "Escape") {
      closeMenus();
      if (!findBar.hidden) closeFindBar();
      if (isMobile()) { setSidebar(false); if (!outline.hidden) setOutline(false); }
    }
  });

  // Keep this tab in sync when another tab edits the documents
  window.addEventListener("storage", function (e) {
    if (e.key === KEY_FOLDERS && e.newValue) {
      try {
        var fs = JSON.parse(e.newValue);
        if (Array.isArray(fs)) { folders = fs; if (!renamingId) renderList(); renderTitle(); }
      } catch (x) {}
      return;
    }
    if (e.key !== KEY_DOCS || !e.newValue) return;
    var fresh;
    try { fresh = JSON.parse(e.newValue); } catch (x) { return; }
    if (!Array.isArray(fresh) || !fresh.length) return;
    docs = fresh;
    var same = current && docs.find(function (d) { return d.id === current.id; });
    if (same) {
      current = same;
      if (same.content !== editor.value) {
        var s = editor.selectionStart, en = editor.selectionEnd;
        editor.value = same.content;
        editor.setSelectionRange(Math.min(s, editor.value.length), Math.min(en, editor.value.length));
        if (app.dataset.mode === "pro") refreshProEditor();
        render();
        updateStats();
      }
      renderTitle();
      renderList();
    } else {
      current = null;
      open(sortedDocs()[0]);
    }
  });

  // Print always uses the light theme
  window.addEventListener("beforeprint", function () { root.setAttribute("data-theme", "light"); });
  window.addEventListener("afterprint", applyTheme);

  mqDark.addEventListener("change", function () { if (prefs.theme === "auto") applyTheme(); });
  mqMobile.addEventListener("change", function () {
    root.classList.remove("sidebar-open");
    root.classList.toggle("sidebar-collapsed", !prefs.sidebar);
  });

  window.addEventListener("beforeunload", function () {
    clearTimeout(persistTimer);
    persist(true);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { clearTimeout(persistTimer); persist(true); }
  });
  setInterval(function () {
    if (document.visibilityState === "visible" && document.activeElement !== editor &&
        !renamingId && !draggingDoc && !moveMenu) renderList();
  }, 60000);

  // ---------- init ----------
  applyLanguage();
  applyTheme();
  applyFont();
  applySplit();
  applySidebarWidth();
  applySortMenu();
  $("btn-sync").setAttribute("aria-pressed", String(prefs.sync));
  root.classList.toggle("sidebar-collapsed", !prefs.sidebar && !isMobile());
  load();
  setMode(prefs.mode);
  open(current);
  setOutline(!!prefs.outline && !isMobile());

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
