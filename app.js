(function () {
  "use strict";

  var KEY_DOCS = "md.local:docs";
  var KEY_ACTIVE = "md.local:active";
  var KEY_PREFS = "md.local:prefs";
  var KEY_FOLDERS = "md.local:folders";
  var DOC_MIME = "text/x-md-doc";
  var KEY_MODE = "md.local:mode"; // legacy, migrated into prefs
  var KEY_OLD = "md.local:doc";   // single-document storage from the first version
  var MD_OPTS = { gfm: true, breaks: false };

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var editor = $("editor");
  var preview = $("preview");
  var paneView = $("pane-view");
  var app = $("app");
  var titleInput = $("title-input");
  var btnAutoTitle = $("btn-auto-title");
  var docList = $("doc-list");
  var searchInput = $("search");
  var outline = $("outline");
  var outlineList = $("outline-list");
  var saveState = $("save-state");
  var tabs = { edit: $("tab-edit"), split: $("tab-split"), view: $("tab-view") };
  var mqDark = window.matchMedia("(prefers-color-scheme: dark)");
  var mqMobile = window.matchMedia("(max-width: 760px)");

  var tr = window.I18N.t; // UI strings live in i18n.js (English default, Vietnamese optional)
  function appName() { return tr("app.name"); }

  var docs = [];
  var folders = [];   // { id, name, collapsed, created }
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
      outline: false, sync: true, split: 50, fontScale: 1, sidebarWidth: 280, lang: window.I18N.lang
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
    return docs.slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.updated - a.updated;
    });
  }

  // ---------- markdown rendering ----------
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
    highlight(div);
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
    return embedDiagrams(div, format).then(function (d) { return d.innerHTML; });
  }

  function render() {
    hideBlockBtn(); // block references become stale after re-render
    clearSearchHighlight();
    var src = editor.value || "";
    var tokens = src.trim() ? marked.lexer(src, MD_OPTS) : [];
    preview.innerHTML = tokens.length ? marked.parser(tokens, MD_OPTS) : "";
    mapBlocks(src, tokens);
    addHeadingIds(preview);
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
    outlineHeadings = Array.prototype.slice.call(preview.querySelectorAll("h1,h2,h3,h4,h5,h6"));
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

    $("doc-empty").hidden = docList.children.length > 0;
    $("doc-count").textContent = (q ? shown + " / " : "") + tr("count.docs", { n: docs.length }) +
      (folders.length ? " · " + tr("count.folders", { n: folders.length }) : "");
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
    render();
    updateStats();
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
    if (app.dataset.mode !== "view") editor.focus();
    return doc;
  }

  function remove(doc) {
    var title = getTitle(doc);
    docs = docs.filter(function (d) { return d !== doc; });
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
          if (docs.indexOf(doc) < 0) docs.push(doc);
          persist();
          open(doc);
        }
      }
    });
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
    app.dataset.mode = mode;
    root.setAttribute("data-mode", mode);
    Object.keys(tabs).forEach(function (k) {
      tabs[k].setAttribute("aria-selected", String(k === mode));
    });
    prefs.mode = mode;
    savePrefs();
    if (mode === "split") syncScroll(editor, paneView);
    updateOutlineCurrent();
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
    if (current) { renderTitle(); render(); updateStats(); }
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
    hr: function () { insertBlock("---", 3, 3); }
  };

  function runCommand(name) {
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
    "img{max-width:100%}a{color:#0969da}";

  function exportMd() {
    download(new Blob([editor.value], { type: "text/markdown;charset=utf-8" }), fileName() + ".md");
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
      var html = '<!DOCTYPE html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + title + "</title>\n" +
        "<style>\n" + css + "\nbody.markdown-body{box-sizing:border-box;max-width:900px;margin:0 auto;padding:40px 24px}\n</style>\n" +
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
      return embedDiagrams(tmp, "png");
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
    return /^(?:https?:|mailto:)/i.test(url) ? url : "";
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
    if (mode !== "view") {
      editor.blur();
      editor.setSelectionRange(s, e);
      editor.focus(); // focusing scrolls the selection into view
    } else {
      editor.setSelectionRange(s, e);
    }
    if (mode !== "edit") revealInPreview(it);
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
  var actions = {
    "export-md": exportMd,
    "export-html": exportHtml,
    "export-doc": exportWord,
    "export-pdf": exportPdf,
    "copy-rich": copyRich,
    "copy-md": function () {
      copyText(editor.value).then(function () { toast(tr("copy.mdDone")); },
        function () { toast(tr("copyFail"), { type: "error" }); });
    },
    backup: backup,
    restore: function () { $("backup-input").click(); }
  };

  function closeMenus() {
    document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
    document.querySelectorAll("[aria-haspopup='menu']").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    if (moveMenu) { moveMenu.remove(); moveMenu = null; }
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

  // ---------- events: editor ----------
  editor.addEventListener("input", onContentChange);
  editor.addEventListener("scroll", function () { syncScroll(editor, paneView); });
  ["keyup", "click", "select"].forEach(function (ev) { editor.addEventListener(ev, updateCursor); });

  var tabEscape = false;
  editor.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") { tabEscape = true; return; }

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
    if (e.key === "Enter" && app.dataset.mode !== "view") { e.preventDefault(); editor.focus(); }
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
    // Keep the editor selection when clicking toolbar buttons
    if (e.target.closest("[data-cmd]")) e.preventDefault();
  });
  $("toolbar").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cmd]");
    if (b) runCommand(b.dataset.cmd);
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
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-wrap, .menu-floating")) closeMenus();
  });
  $("btn-new-folder").addEventListener("click", function () { createFolder(true); });
  $("doc-folder").addEventListener("click", function (e) {
    e.stopPropagation();
    openMoveMenu(current, $("doc-folder"));
  });
  window.addEventListener("resize", function () { if (moveMenu) closeMenus(); });
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
    } else if ((mod && e.shiftKey && !e.altKey && k === "f") ||
        (e.key === "/" && !mod && !e.altKey && !isTyping(e.target))) {
      e.preventDefault();
      gsInput.focus();
      gsInput.select();
    } else if (e.altKey && !mod && !e.shiftKey) {
      var modes = { Digit1: "edit", Digit2: "split", Digit3: "view" };
      if (modes[e.code]) { e.preventDefault(); setMode(modes[e.code]); }
      else if (e.code === "KeyN") { e.preventDefault(); create(""); }
    } else if (e.key === "Escape") {
      closeMenus();
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
  $("btn-sync").setAttribute("aria-pressed", String(prefs.sync));
  root.classList.toggle("sidebar-collapsed", !prefs.sidebar && !isMobile());
  load();
  setMode(prefs.mode);
  open(current);
  setOutline(!!prefs.outline && !isMobile());
})();
