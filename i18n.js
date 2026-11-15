/* MD Helper - UI strings. English is the default language; Vietnamese is optional.
 * Values are strings with {placeholders}, or functions(vars) when plurals are needed. */
(function () {
  "use strict";

  var KEY_PREFS = "md.local:prefs";
  var DEFAULT_LANG = "en";

  function plural(n, one, many) {
    n = Number(n);
    return n.toLocaleString("en-US") + " " + (n === 1 ? one : many);
  }

  var helpEn =
    '<div class="help-cols">' +
    "<section><h3>General</h3><dl class=\"keys\">" +
    "<dt><kbd>Ctrl</kbd> <kbd>S</kbd></dt><dd>Save now (autosave is always on)</dd>" +
    "<dt><kbd>Alt</kbd> <kbd>N</kbd></dt><dd>New document</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>O</kbd></dt><dd>Open file</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>P</kbd></dt><dd>Export PDF</dd>" +
    "<dt><kbd>/</kbd> or <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>F</kbd></dt><dd>Search all documents</dd>" +
    "<dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></dt><dd>Pick a result and jump to it</dd>" +
    "<dt><kbd>Tab</kbd> (in search)</dt><dd>Complete the suggested word</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>\\</kbd></dt><dd>Show/hide document list</dd>" +
    "<dt><kbd>Alt</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></dt><dd>Edit / Split / Preview / Pro</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>/</kbd></dt><dd>Open this panel</dd>" +
    "</dl></section>" +
    "<section><h3>Editing</h3><dl class=\"keys\">" +
    "<dt><kbd>Ctrl</kbd> <kbd>B</kbd></dt><dd>Bold</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>I</kbd></dt><dd>Italic</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Insert link</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>E</kbd></dt><dd>Inline code</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>F</kbd> / <kbd>Ctrl</kbd> <kbd>H</kbd></dt><dd>Find / Replace in document</dd>" +
    "<dt><kbd>Tab</kbd> / <kbd>Shift</kbd> <kbd>Tab</kbd></dt><dd>Indent / outdent</dd>" +
    "<dt><kbd>Enter</kbd></dt><dd>Continue the current list</dd>" +
    "<dt><kbd>Esc</kbd> then <kbd>Tab</kbd></dt><dd>Leave the editor with the keyboard</dd>" +
    "</dl></section></div>" +
    "<h3>Tips</h3><ul class=\"tips\">" +
    "<li>Drop one or more <code>.md</code> files onto the window to open them.</li>" +
    "<li>Click a checkbox in the preview to tick a task; the Markdown updates itself.</li>" +
    "<li>Use Pro mode to edit the rendered document directly with rich-text tools.</li>" +
    "<li>Use <code>&gt; [!NOTE]</code>, <code>&gt; [!TIP]</code>, <code>&gt; [!IMPORTANT]</code>, <code>&gt; [!WARNING]</code>, or <code>&gt; [!CAUTION]</code> for GitHub-style alert callouts.</li>" +
    "<li>Write LaTeX math with <code>$inline$</code> or <code>$$block$$</code> formulas (rendered with KaTeX).</li>" +
    "<li>Select text and paste a URL to turn it into a link, or paste cells from Excel/Sheets to create a Markdown table automatically.</li>" +
    "<li>Pin documents you use often to keep them at the top of the list, or sort by date, title, or length.</li>" +
    "<li>Drag a document onto a folder to file it; drop it on empty space to take it out. Drop <code>.md</code> files on a folder to open them straight into it.</li>" +
    "<li>Double-click a folder name to rename it.</li>" +
    "<li>Hover the preview: a copy button appears left of each block (paragraph, table, list, code…) to copy it with formatting. The button on a heading copies the whole section.</li>" +
    "<li>Code blocks with a language (<code>```js</code>, <code>```java</code>, <code>```sql</code>…) are highlighted. <code>```mermaid</code> blocks are drawn as diagrams and become images when exported to Word or copied.</li>" +
    "<li>Drag the right edge of the document list to widen it and read long titles. Double-click the edge to reset.</li>" +
    "<li>Search ignores accents, so plain letters also find accented text (e.g. <i>tieng viet</i> finds <i>tiếng Việt</i>).</li>" +
    "<li>Deleted documents are kept in the <b>Trash</b> at the bottom of the list so you can restore them anytime.</li>" +
    "<li>Data is stored only in this browser. Use <b>Back up</b> or <b>Export all as Markdown (.zip)</b> (the ⋮ button below the list) to keep a safe copy.</li>" +
    "</ul>" +
    "<h3>About</h3><p class=\"about\"><b>MD Helper</b> (<a href=\"https://hotromd.github.io/\">hotromd.github.io</a>) is a product of " +
    "<a href=\"https://hotroso.github.io/\" target=\"_blank\" rel=\"noopener\">Hỗ Trợ Giải Pháp Số</a> (hotroso.github.io). " +
    "Your documents stay in this browser on this device and are never sent to a server.</p>" +
    "<p class=\"about\">© 2026 Hỗ Trợ Giải Pháp Số. All rights reserved.</p>";

  var helpVi =
    '<div class="help-cols">' +
    "<section><h3>Chung</h3><dl class=\"keys\">" +
    "<dt><kbd>Ctrl</kbd> <kbd>S</kbd></dt><dd>Lưu ngay (vẫn tự lưu khi gõ)</dd>" +
    "<dt><kbd>Alt</kbd> <kbd>N</kbd></dt><dd>Tài liệu mới</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>O</kbd></dt><dd>Mở file</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>P</kbd></dt><dd>Xuất PDF</dd>" +
    "<dt><kbd>/</kbd> hoặc <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>F</kbd></dt><dd>Tìm trong tất cả tài liệu</dd>" +
    "<dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></dt><dd>Chọn và nhảy tới kết quả</dd>" +
    "<dt><kbd>Tab</kbd> (trong ô tìm)</dt><dd>Hoàn tất từ gợi ý (có dấu)</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>\\</kbd></dt><dd>Ẩn/hiện danh sách</dd>" +
    "<dt><kbd>Alt</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></dt><dd>Soạn thảo / Song song / Xem / Chuyên nghiệp</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>/</kbd></dt><dd>Mở bảng này</dd>" +
    "</dl></section>" +
    "<section><h3>Soạn thảo</h3><dl class=\"keys\">" +
    "<dt><kbd>Ctrl</kbd> <kbd>B</kbd></dt><dd>Đậm</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>I</kbd></dt><dd>Nghiêng</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Chèn liên kết</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>E</kbd></dt><dd>Code trong dòng</dd>" +
    "<dt><kbd>Ctrl</kbd> <kbd>F</kbd> / <kbd>Ctrl</kbd> <kbd>H</kbd></dt><dd>Tìm / Thay thế trong tài liệu</dd>" +
    "<dt><kbd>Tab</kbd> / <kbd>Shift</kbd> <kbd>Tab</kbd></dt><dd>Thụt / bỏ thụt dòng</dd>" +
    "<dt><kbd>Enter</kbd></dt><dd>Tự tiếp tục danh sách</dd>" +
    "<dt><kbd>Esc</kbd> rồi <kbd>Tab</kbd></dt><dd>Rời ô soạn thảo bằng bàn phím</dd>" +
    "</dl></section></div>" +
    "<h3>Mẹo</h3><ul class=\"tips\">" +
    "<li>Kéo thả một hoặc nhiều file <code>.md</code> vào cửa sổ để mở.</li>" +
    "<li>Nhấp ô checkbox trong bản xem để đánh dấu việc đã xong, nội dung markdown tự cập nhật.</li>" +
    "<li>Dùng chế độ Chuyên nghiệp để sửa trực tiếp nội dung đã hiển thị bằng các công cụ định dạng.</li>" +
    "<li>Dùng <code>&gt; [!NOTE]</code>, <code>&gt; [!TIP]</code>, <code>&gt; [!IMPORTANT]</code>, <code>&gt; [!WARNING]</code>, hoặc <code>&gt; [!CAUTION]</code> để tạo khung thông báo chuẩn GitHub.</li>" +
    "<li>Viết công thức toán học LaTeX bằng <code>$inline$</code> hoặc <code>$$block$$</code> (hiển thị với KaTeX).</li>" +
    "<li>Bôi đen văn bản rồi dán URL để tự tạo liên kết, hoặc dán bảng từ Excel/Google Sheets để tự chuyển thành bảng Markdown.</li>" +
    "<li>Ghim tài liệu hay dùng để luôn nằm đầu danh sách, hoặc sắp xếp theo thời gian, tên A→Z, độ dài.</li>" +
    "<li>Kéo một tài liệu thả vào thư mục để sắp xếp; thả ra vùng trống để đưa ra ngoài thư mục. Thả file <code>.md</code> lên thư mục để mở thẳng vào đó.</li>" +
    "<li>Nhấp đúp tên thư mục để đổi tên.</li>" +
    "<li>Rê chuột lên bản xem: nút sao chép hiện ở lề trái mỗi khối (đoạn văn, bảng, danh sách, code…) để chép có định dạng. Nút trên heading chép cả mục đó.</li>" +
    "<li>Khối code ghi ngôn ngữ (<code>```js</code>, <code>```java</code>, <code>```sql</code>…) được tô màu. Khối <code>```mermaid</code> được vẽ thành sơ đồ; khi xuất Word hoặc sao chép, sơ đồ được chuyển thành ảnh.</li>" +
    "<li>Kéo mép phải của danh sách tài liệu để nới rộng, xem được tiêu đề dài. Nhấp đúp mép để về độ rộng mặc định.</li>" +
    "<li>Tìm kiếm hỗ trợ gõ không dấu: <i>tieng viet</i> tìm được <i>tiếng Việt</i>.</li>" +
    "<li>Tài liệu đã xoá được lưu trong mục <b>Thùng rác</b> ở cuối danh sách để bạn khôi phục bất cứ lúc nào.</li>" +
    "<li>Dữ liệu chỉ lưu trong trình duyệt này. Dùng <b>Sao lưu</b> hoặc <b>Xuất tất cả file .md (.zip)</b> (nút ⋮ cuối danh sách) để giữ bản an toàn.</li>" +
    "</ul>" +
    "<h3>Giới thiệu</h3><p class=\"about\"><b>MD Helper</b> (<a href=\"https://hotromd.github.io/\">hotromd.github.io</a>) là một sản phẩm của " +
    "<a href=\"https://hotroso.github.io/\" target=\"_blank\" rel=\"noopener\">Hỗ Trợ Giải Pháp Số</a> (hotroso.github.io). " +
    "Tài liệu của bạn chỉ lưu trong trình duyệt trên máy này, không gửi lên máy chủ nào.</p>" +
    "<p class=\"about\">© 2026 Hỗ Trợ Giải Pháp Số. Bảo lưu mọi quyền.</p>";

  var welcomeEn = "# Welcome to MD Helper\n\n" +
    "> A product of [Hỗ Trợ Giải Pháp Số](https://hotroso.github.io/) (hotroso.github.io). All rights reserved. " +
    "Your documents are stored only in this browser.\n\n" +
    "Paste or type Markdown on the left; the preview appears on the right.\n\n" +
    "## Highlights\n\n" +
    "- [x] Light / dark theme (sun button at the top right)\n" +
    "- [x] Formatting toolbar and shortcuts (`Ctrl+B`, `Ctrl+I`, `Ctrl+K`…)\n" +
    "- [x] Automatic outline: click to jump to a section\n" +
    "- [x] Folders, pinning, duplicating; delete with **Undo**\n" +
    "- [x] Search every document from the top bar (press `/`)\n" +
    "- [x] Drop `.md` files onto the window to open them\n" +
    "- [ ] Click this box in the preview to tick it\n\n" +
    "> [!TIP]\n" +
    "> Use `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` for callout blocks, and `$E = mc^2$` for LaTeX math!\n\n" +
    "## Diagrams\n\n" +
    "```mermaid\nflowchart LR\n  A[Write Markdown] --> B[Preview]\n  B --> C{Share}\n  C --> D[Word / PDF / HTML]\n  C --> E[Copy with formatting]\n```\n\n" +
    "## Export\n\n" +
    "Use **Export** in the top bar: Markdown, HTML, Word, PDF, or copy with formatting.\n\n" +
    "```js\nconsole.log('hello');\n```\n\n" +
    "> Press `Ctrl+/` to see every shortcut.\n";

  var welcomeVi = "# Chào mừng đến MD Helper\n\n" +
    "> Một sản phẩm của [Hỗ Trợ Giải Pháp Số](https://hotroso.github.io/) (hotroso.github.io). Bảo lưu mọi quyền. " +
    "Tài liệu chỉ lưu trong trình duyệt trên máy bạn.\n\n" +
    "Dán hoặc gõ markdown vào khung bên trái, bản xem trước hiện bên phải.\n\n" +
    "## Có gì\n\n" +
    "- [x] Giao diện sáng / tối (nút mặt trời ở góc phải)\n" +
    "- [x] Thanh công cụ định dạng và phím tắt (`Ctrl+B`, `Ctrl+I`, `Ctrl+K`…)\n" +
    "- [x] Mục lục tự động, nhấp để nhảy tới phần tương ứng\n" +
    "- [x] Thư mục, ghim, nhân bản tài liệu; xoá có **Hoàn tác**\n" +
    "- [x] Tìm trong mọi tài liệu ở thanh trên (nhấn `/`), gõ không dấu được\n" +
    "- [x] Kéo thả file `.md` vào cửa sổ để mở\n" +
    "- [ ] Nhấp vào ô này trong bản xem để đánh dấu xong\n\n" +
    "> [!TIP]\n" +
    "> Dùng `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, hoặc `[!CAUTION]` để tạo khung lưu ý, và `$E = mc^2$` cho công thức toán học!\n\n" +
    "## Sơ đồ\n\n" +
    "```mermaid\nflowchart LR\n  A[Viết Markdown] --> B[Xem trước]\n  B --> C{Chia sẻ}\n  C --> D[Word / PDF / HTML]\n  C --> E[Sao chép có định dạng]\n```\n\n" +
    "## Xuất file\n\n" +
    "Nút **Xuất** ở thanh trên: Markdown, HTML, Word, PDF hoặc sao chép có định dạng.\n\n" +
    "```js\nconsole.log('hello');\n```\n\n" +
    "> Nhấn `Ctrl+/` để xem toàn bộ phím tắt.\n";

  var STR = {
    en: {
      "lang.name": "English",
      "lang.switch": "Language: English. Click to switch to Tiếng Việt",
      "lang.switched": "Language: English",
      "app.name": "MD Helper",
      "brand.title": "MD Helper - a product of Hỗ Trợ Giải Pháp Số",
      "sidebar.toggle": "Show/hide document list (Ctrl+\\)",
      "sidebar.toggleAria": "Show/hide document list",
      "mode.aria": "Display mode",
      "mode.edit": "Edit", "mode.editTitle": "Edit (Alt+1)",
      "mode.split": "Split", "mode.splitTitle": "Split view (Alt+2)",
      "mode.view": "Preview", "mode.viewTitle": "Preview (Alt+3)",
      "mode.pro": "Pro", "mode.proTitle": "Professional editing (Alt+4)",
      "gs.placeholder": "Search all documents…",
      "gs.aria": "Search all documents",
      "gs.kbdTitle": "Shortcut: / or Ctrl+Shift+F",
      "gs.results": "Search results",
      "open.title": "Open .md files (Ctrl+O), or drop them onto the window",
      "open.label": "Open",
      "export.label": "Export",
      "export.html": "Web page",
      "export.copyRich": "Copy with formatting",
      "export.copyRichHint": "paste into Word, email…",
      "export.copyMd": "Copy Markdown",
      "theme.aria": "Switch light/dark theme",
      "help.title": "Shortcuts & tips (Ctrl+/)",
      "help.aria": "Shortcuts & tips",
      "help.heading": "Shortcuts & tips",
      "help.body": helpEn,
      "close": "Close",
      "sidebar.aria": "Documents",
      "new.title": "New document (Alt+N)",
      "new.label": "New document",
      "newFolder": "New folder",
      "filter.placeholder": "Filter list…",
      "filter.aria": "Filter document list",
      "docEmpty": "No matching documents",
      "more": "Back up / restore",
      "backup": "Back up all documents",
      "restore": "Restore from backup…",
      "sbHandle.aria": "Resize document list",
      "handle.title": "Drag to resize, double-click to reset",
      "folderChip.title": "Move this document to another folder",
      "title.label": "Title",
      "title.placeholder": "Title (taken from the first heading automatically)",
      "autoTitle.title": "Use the automatic title from the content",
      "autoTitle.label": "Auto",
      "outline.toggle": "Show/hide outline",
      "outline.label": "Outline",
      "outline.close": "Close outline",
      "outline.empty": "This document has no headings yet (#, ##, ###…)",
      "toolbar.aria": "Formatting",
      "tb.heading": "Heading H1 → H2 → H3 (press repeatedly)",
      "tb.bold": "Bold (Ctrl+B)", "tb.italic": "Italic (Ctrl+I)", "tb.strike": "Strikethrough",
      "tb.underline": "Underline", "tb.fontFamily": "Font family", "tb.fontSize": "Font size",
      "tb.textColor": "Text color", "tb.highlight": "Highlight color",
      "tb.alignLeft": "Align left", "tb.alignCenter": "Center", "tb.alignRight": "Align right",
      "tb.indent": "Indent", "tb.outdent": "Outdent", "tb.undo": "Undo", "tb.redo": "Redo",
      "tb.code": "Inline code (Ctrl+E)", "tb.codeblock": "Code block", "tb.link": "Link (Ctrl+K)",
      "tb.image": "Image", "tb.quote": "Quote", "tb.ul": "Bulleted list", "tb.ol": "Numbered list",
      "tb.task": "Task list", "tb.table": "Insert table", "tb.hr": "Horizontal rule",
      "sync.title": "Sync scrolling between editor and preview",
      "sync.label": "Sync scroll",
      "editor.label": "Markdown content",
      "editor.placeholder": "Paste or type Markdown here… (drop .md files onto the window to open them)",
      "split.aria": "Resize panes",
      "preview.label": "Markdown preview. Click here to paste formatted content.",
      "preview.empty": "Nothing here yet. Type Markdown in the editor to preview it here.",
      "pro.editorLabel": "Professional rich-text editor",
      "pro.empty": "Type or paste formatted content here.",
      "pro.linkPrompt": "Enter the link URL:",
      "pro.imagePrompt": "Enter the image URL:",
      "pro.imageAltPrompt": "Enter alternative text for the image:",
      "pro.tableRowsPrompt": "Number of table rows (1-20):",
      "pro.tableColsPrompt": "Number of table columns (1-12):",
      "pro.tableHeading": "Heading",
      "pro.tableCell": "Cell",
      "pro.invalidTableSize": "Choose a whole number within the allowed table size.",
      "pro.invalidUrl": "Use an http, https, or mailto URL.",
      "zoom.aria": "Font size", "zoom.dec": "Smaller text", "zoom.inc": "Larger text",
      "maker": "© 2026 · A product of Hỗ Trợ Giải Pháp Số (hotroso.github.io). All rights reserved.",
      "drop": "Drop Markdown files here to open them",

      "welcome": welcomeEn,
      "untitled": "Untitled",
      "empty": "Empty",
      "saved": "Saved {time}",
      "saving": "Saving…",
      "saveFull": "Save failed: browser storage is full",
      "saveFullToast": "Could not save: browser storage is full. Back up and delete some documents.",
      "savedToast": "Saved",
      "mermaid.initFail": "Mermaid failed to initialize",
      "mermaid.loadFail": "Could not load the Mermaid library from the CDN (check your connection)",
      "mermaid.error": "Mermaid diagram error: {msg}",
      "mermaid.drawing": "Drawing diagram…",
      "mermaid.alt": "Mermaid diagram",
      "copy": "Copy",
      "copied": "Copied ✓",
      "copyFail": "Could not copy",
      "copyBlocked": "The browser blocked copying",
      "task.title": "Click to tick",
      "time.now": "Just now",
      "time.min": function (v) { return plural(v.n, "minute ago", "minutes ago"); },
      "time.today": "Today {hm}",
      "time.yesterday": "Yesterday {hm}",
      "noFolder": "Not in a folder",
      "count.docs": function (v) { return plural(v.n, "document", "documents"); },
      "count.folders": function (v) { return plural(v.n, "folder", "folders"); },
      "folder.nameAria": "Folder name",
      "folder.dblRename": "{name} (double-click to rename)",
      "folder.newDoc": "New document in this folder",
      "folder.rename": "Rename folder",
      "folder.delete": "Delete folder (keeps its documents)",
      "folder.empty": "Empty folder. Drag documents here.",
      "folder.new": "New folder",
      "folder.default": "Folder",
      "folder.deleted": "Deleted folder \"{name}\"",
      "folder.deletedKept": function (v) { return "Deleted folder \"" + v.name + "\"; " + plural(v.n, "document was", "documents were") + " moved out"; },
      "doc.updated": "Updated: {time}",
      "doc.unpin": "Unpin", "doc.pin": "Pin to top",
      "doc.move": "Move to folder…",
      "doc.duplicate": "Duplicate",
      "doc.delete": "Delete {title}",
      "doc.deleted": "Deleted \"{title}\"",
      "doc.copySuffix": " (copy)",
      "doc.duplicated": "Copy created",
      "undo": "Undo",
      "moved.in": "Moved \"{title}\" to \"{folder}\"",
      "moved.out": "Moved \"{title}\" out of its folder",
      "move.heading": "Move to folder",
      "move.newFolder": "New folder…",
      "theme.auto": "System", "theme.light": "Light", "theme.dark": "Dark",
      "theme.title": "Theme: {name} (click to change)",
      "theme.toast": "Theme: {name}",
      "stat.words": function (v) { return plural(v.n, "word", "words"); },
      "stat.chars": function (v) { return plural(v.n, "character", "characters"); },
      "stat.read": "~{n} min read",
      "stat.cursor": "Ln {line}, Col {col}",
      "stat.sel": " ({n} selected)",
      "ph.bold": "bold text", "ph.italic": "italic text", "ph.strike": "strikethrough",
      "ph.linkText": "link text", "ph.alt": "description",
      "ph.table": "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",
      "ph.tableSel": "Column 1",
      "copy.richDone": "Copied with formatting",
      "copy.blockTitle": "Copy this block (with formatting)",
      "copy.sectionTitle": "Copy this whole section (with formatting)",
      "copy.blockDone": "Block copied",
      "copy.sectionDone": "Copied section \"{title}\"",
      "copy.mdDone": "Markdown copied",
      "gs.summary": function (v) {
        return (v.hits ? plural(v.hits, "result", "results").replace(/^(\d+)/, "$1" + v.plus) + " in " : "") +
          plural(v.docs, "document", "documents") + (v.short ? " · keep typing to search content" : "");
      },
      "gs.none": "No results for \"{q}\"",
      "gs.occurrences": function (v) { return plural(v.n, "occurrence", "occurrences"); },
      "gs.line": "Line {n}",
      "gs.onLine": "{n} times on this line",
      "gs.more": function (v) { return "Show " + plural(v.n, "more line", "more lines") + " in this document"; },
      "gs.rest": function (v) { return plural(v.n, "more document", "more documents") + "; try a more specific search"; },
      "gs.foot": "<span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>Enter</kbd> open</span><span id=\"gs-complete\"></span><span><kbd>Esc</kbd> close</span>",
      "gs.complete": " complete \"{w}\"",
      "backup.done": function (v) { return "Backed up " + plural(v.n, "document", "documents"); },
      "backup.invalid": "Invalid backup file",
      "backup.badFormat": "The backup file has an unexpected format",
      "restore.done": "Restore finished: {added} added, {updated} updated",
      "file.unsupported": "Only .md, .markdown and .txt files are supported",
      "file.opened1": "Opened \"{name}\"",
      "file.openedN": "Opened {n} files",
      "file.into": " into \"{folder}\"",
      "file.skipped": function (v) { return " (skipped " + plural(v.n, "unsupported file", "unsupported files") + ")"; },
      "file.readFail": "Could not read the file",
      "toast.close": "Dismiss notification",
      "export.zip": "All documents",
      "export.zipAll": "Export all as Markdown",
      "zip.done": function (v) { return "Exported " + plural(v.n, "document", "documents") + " (.zip)"; },
      "tb.alert": "Alert callout [!NOTE] → [!TIP] → [!IMPORTANT]… (press repeatedly)",
      "tb.math": "Math formula ($…$ or $$…$$)",
      "tb.find": "Find & replace in document (Ctrl+F / Ctrl+H)",
      "alert.note": "Note", "alert.tip": "Tip", "alert.important": "Important", "alert.warning": "Warning", "alert.caution": "Caution",
      "fr.aria": "Find and replace",
      "fr.findPlaceholder": "Find in document…",
      "fr.replacePlaceholder": "Replace with…",
      "fr.caseTitle": "Match exact case & accents",
      "fr.prev": "Previous match (Shift+Enter)",
      "fr.next": "Next match (Enter)",
      "fr.replace": "Replace",
      "fr.replaceTitle": "Replace current match",
      "fr.replaceAll": "All",
      "fr.replaceAllTitle": "Replace all matches",
      "fr.replaced": function (v) { return "Replaced " + plural(v.n, "occurrence", "occurrences"); },
      "sort.title": "Sort documents",
      "sort.heading": "Sort by",
      "sort.updated": "Recently updated",
      "sort.name": "Title (A → Z)",
      "sort.length": "Length",
      "trash.heading": "Trash",
      "trash.restore": "Restore document",
      "trash.deletePerm": "Delete permanently",
      "trash.restored": "Restored \"{title}\"",
      "trash.deletedPerm": "Permanently deleted \"{title}\"",
      "trash.emptyAction": "Empty trash",
      "trash.emptied": "Trash emptied",
      "tpl.title": "New from template…",
      "tpl.heading": "New from template",
      "tpl.meeting": "Meeting notes",
      "tpl.readme": "Project README",
      "tpl.spec": "Technical spec & alerts",
      "tpl.tasks": "Task tracker",
      "tpl.math": "Math & diagrams",
      "tpl.created": "Created from template \"{name}\"",
      "tpl.content.meeting": "# Meeting Notes\n\n- **Date:** {date}\n- **Participants:** @team\n- **Goal:** Weekly sync & decisions\n\n## Agenda\n\n1. Review last week's progress\n2. Key blockers & solutions\n3. Next steps\n\n## Discussion Notes\n\n> [!NOTE]\n> Key decision: prioritize offline support and fast search.\n\n| Topic | Owner | Status |\n| --- | --- | --- |\n| UI Polish | Alice | Done |\n| Export Engine | Bob | In Progress |\n\n## Action Items\n\n- [ ] Share updated roadmap\n- [ ] Finalize release checklist\n",
      "tpl.content.readme": "# Project Name\n\nA concise description of what this project does and who it is for.\n\n> [!TIP]\n> Built for speed, privacy, and simplicity.\n\n## Features\n\n- Fast live preview with synchronized scrolling\n- Diagrams with **Mermaid** and math with **KaTeX**\n- Export to HTML, Word, PDF, or ZIP\n\n## Quick Start\n\n```bash\ngit clone https://github.com/username/project.git\ncd project\n```\n\n## Architecture\n\n```mermaid\nflowchart LR\n  User[User Browser] --> App[Web App]\n  App --> Store[(LocalStorage)]\n  App --> Export[HTML / Word / PDF]\n```\n\n## License\n\nMIT © {year}\n",
      "tpl.content.spec": "# Technical Specification: Feature X\n\n## 1. Overview\n\nSummarize the problem statement and proposed solution.\n\n> [!IMPORTANT]\n> All data must remain client-side with zero external server dependencies.\n\n## 2. System Flow\n\n```mermaid\nsequenceDiagram\n  participant U as User\n  participant E as Editor\n  participant P as Preview\n  U->>E: Type Markdown\n  E->>P: Render AST + Diagrams + Math\n```\n\n## 3. Risks & Mitigations\n\n> [!WARNING]\n> Large documents may increase render time; debounce updates to 150ms.\n\n> [!CAUTION]\n> Clearing browser site data will erase local storage unless backed up.\n",
      "tpl.content.tasks": "# Task Tracker\n\n## High Priority\n\n- [ ] Complete core feature implementation\n- [ ] Verify dark mode contrast and accessibility\n\n## In Progress\n\n- [x] Set up document folder structure\n- [ ] Write user documentation\n\n## Backlog\n\n| Task | Priority | Estimate |\n| --- | --- | --- |\n| Offline PWA caching | High | 2h |\n| Template library | Medium | 1h |\n",
      "tpl.content.math": "# Math & Diagrams Showcase\n\n## 1. LaTeX Math (KaTeX)\n\nInline formula: Euler's identity $e^{i\\pi} + 1 = 0$ and the quadratic formula $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.\n\nDisplay equation (Gaussian integral):\n\n$$\n\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\n$$\n\nMatrix & summation:\n\n$$\n\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}\n$$\n\n## 2. Mermaid State Diagram\n\n```mermaid\nstateDiagram-v2\n  [*] --> Draft\n  Draft --> Review : Submit\n  Review --> Published : Approve\n  Review --> Draft : Request changes\n```\n"
    },

    vi: {
      "lang.name": "Tiếng Việt",
      "lang.switch": "Ngôn ngữ: Tiếng Việt. Nhấp để chuyển sang English",
      "lang.switched": "Ngôn ngữ: Tiếng Việt",
      "app.name": "MD Helper",
      "brand.title": "MD Helper - một sản phẩm của Hỗ Trợ Giải Pháp Số",
      "sidebar.toggle": "Ẩn/hiện danh sách tài liệu (Ctrl+\\)",
      "sidebar.toggleAria": "Ẩn/hiện danh sách tài liệu",
      "mode.aria": "Chế độ hiển thị",
      "mode.edit": "Soạn thảo", "mode.editTitle": "Soạn thảo (Alt+1)",
      "mode.split": "Song song", "mode.splitTitle": "Song song (Alt+2)",
      "mode.view": "Xem", "mode.viewTitle": "Xem (Alt+3)",
      "mode.pro": "Chuyên nghiệp", "mode.proTitle": "Chế độ soạn thảo chuyên nghiệp (Alt+4)",
      "gs.placeholder": "Tìm trong tất cả tài liệu (gõ không dấu được)…",
      "gs.aria": "Tìm trong tất cả tài liệu",
      "gs.kbdTitle": "Phím tắt: / hoặc Ctrl+Shift+F",
      "gs.results": "Kết quả tìm kiếm",
      "open.title": "Mở file .md (Ctrl+O), hoặc kéo thả file vào cửa sổ",
      "open.label": "Mở file",
      "export.label": "Xuất",
      "export.html": "Trang web",
      "export.copyRich": "Sao chép có định dạng",
      "export.copyRichHint": "dán vào Word, email…",
      "export.copyMd": "Sao chép markdown",
      "theme.aria": "Đổi giao diện sáng/tối",
      "help.title": "Phím tắt và mẹo (Ctrl+/)",
      "help.aria": "Phím tắt và mẹo",
      "help.heading": "Phím tắt & mẹo",
      "help.body": helpVi,
      "close": "Đóng",
      "sidebar.aria": "Danh sách tài liệu",
      "new.title": "Tài liệu mới (Alt+N)",
      "new.label": "Tài liệu mới",
      "newFolder": "Thư mục mới",
      "filter.placeholder": "Lọc danh sách…",
      "filter.aria": "Lọc danh sách tài liệu",
      "docEmpty": "Không tìm thấy tài liệu phù hợp",
      "more": "Sao lưu / khôi phục",
      "backup": "Sao lưu tất cả tài liệu",
      "restore": "Khôi phục từ bản sao lưu…",
      "sbHandle.aria": "Thay đổi độ rộng danh sách tài liệu",
      "handle.title": "Kéo để đổi độ rộng, nhấp đúp để đặt lại",
      "folderChip.title": "Chuyển tài liệu sang thư mục khác",
      "title.label": "Tiêu đề",
      "title.placeholder": "Tiêu đề (tự động lấy từ heading đầu tiên)",
      "autoTitle.title": "Lấy lại tiêu đề tự động từ nội dung",
      "autoTitle.label": "Tự động",
      "outline.toggle": "Ẩn/hiện mục lục",
      "outline.label": "Mục lục",
      "outline.close": "Đóng mục lục",
      "outline.empty": "Tài liệu chưa có heading (#, ##, ###…)",
      "toolbar.aria": "Định dạng",
      "tb.heading": "Tiêu đề H1 → H2 → H3 (nhấn nhiều lần)",
      "tb.bold": "Đậm (Ctrl+B)", "tb.italic": "Nghiêng (Ctrl+I)", "tb.strike": "Gạch ngang",
      "tb.underline": "Gạch chân", "tb.fontFamily": "Phông chữ", "tb.fontSize": "Cỡ chữ",
      "tb.textColor": "Màu chữ", "tb.highlight": "Màu tô sáng",
      "tb.alignLeft": "Căn trái", "tb.alignCenter": "Căn giữa", "tb.alignRight": "Căn phải",
      "tb.indent": "Thụt vào", "tb.outdent": "Thụt ra", "tb.undo": "Hoàn tác", "tb.redo": "Làm lại",
      "tb.code": "Code trong dòng (Ctrl+E)", "tb.codeblock": "Khối code", "tb.link": "Liên kết (Ctrl+K)",
      "tb.image": "Hình ảnh", "tb.quote": "Trích dẫn", "tb.ul": "Danh sách", "tb.ol": "Danh sách đánh số",
      "tb.task": "Danh sách việc cần làm", "tb.table": "Chèn bảng", "tb.hr": "Đường kẻ ngang",
      "sync.title": "Cuộn đồng bộ giữa soạn thảo và bản xem",
      "sync.label": "Cuộn đồng bộ",
      "editor.label": "Nội dung markdown",
      "editor.placeholder": "Dán hoặc gõ markdown vào đây… (kéo thả file .md vào cửa sổ để mở)",
      "split.aria": "Thay đổi độ rộng khung",
      "preview.label": "Bản xem trước markdown. Nhấp vào đây để dán nội dung có định dạng.",
      "preview.empty": "Chưa có nội dung. Gõ markdown ở khung soạn thảo để xem trước tại đây.",
      "pro.editorLabel": "Khung soạn thảo định dạng chuyên nghiệp",
      "pro.empty": "Gõ hoặc dán nội dung có định dạng vào đây.",
      "pro.linkPrompt": "Nhập địa chỉ liên kết:",
      "pro.imagePrompt": "Nhập địa chỉ ảnh:",
      "pro.imageAltPrompt": "Nhập văn bản thay thế cho ảnh:",
      "pro.tableRowsPrompt": "Số dòng của bảng (1-20):",
      "pro.tableColsPrompt": "Số cột của bảng (1-12):",
      "pro.tableHeading": "Tiêu đề",
      "pro.tableCell": "Ô",
      "pro.invalidTableSize": "Hãy chọn số nguyên trong giới hạn kích thước bảng.",
      "pro.invalidUrl": "Hãy dùng địa chỉ http, https hoặc mailto.",
      "zoom.aria": "Cỡ chữ", "zoom.dec": "Giảm cỡ chữ", "zoom.inc": "Tăng cỡ chữ",
      "maker": "© 2026 · Một sản phẩm của Hỗ Trợ Giải Pháp Số (hotroso.github.io). Bảo lưu mọi quyền.",
      "drop": "Thả file markdown vào đây để mở",

      "welcome": welcomeVi,
      "untitled": "Không tiêu đề",
      "empty": "Trống",
      "saved": "Đã lưu {time}",
      "saving": "Đang lưu…",
      "saveFull": "Lưu lỗi: bộ nhớ trình duyệt đầy",
      "saveFullToast": "Không lưu được: bộ nhớ trình duyệt đã đầy. Hãy sao lưu và xoá bớt tài liệu.",
      "savedToast": "Đã lưu",
      "mermaid.initFail": "Mermaid không khởi tạo được",
      "mermaid.loadFail": "Không tải được thư viện Mermaid từ CDN (kiểm tra kết nối mạng)",
      "mermaid.error": "Lỗi sơ đồ Mermaid: {msg}",
      "mermaid.drawing": "Đang vẽ sơ đồ…",
      "mermaid.alt": "Sơ đồ Mermaid",
      "copy": "Sao chép",
      "copied": "Đã chép ✓",
      "copyFail": "Không sao chép được",
      "copyBlocked": "Trình duyệt không cho phép sao chép",
      "task.title": "Nhấp để đánh dấu",
      "time.now": "Vừa xong",
      "time.min": "{n} phút trước",
      "time.today": "Hôm nay {hm}",
      "time.yesterday": "Hôm qua {hm}",
      "noFolder": "Không thuộc thư mục",
      "count.docs": "{n} tài liệu",
      "count.folders": "{n} thư mục",
      "folder.nameAria": "Tên thư mục",
      "folder.dblRename": "{name} (nhấp đúp để đổi tên)",
      "folder.newDoc": "Tài liệu mới trong thư mục này",
      "folder.rename": "Đổi tên thư mục",
      "folder.delete": "Xoá thư mục (giữ lại tài liệu)",
      "folder.empty": "Thư mục trống. Kéo tài liệu vào đây.",
      "folder.new": "Thư mục mới",
      "folder.default": "Thư mục",
      "folder.deleted": "Đã xoá thư mục \"{name}\"",
      "folder.deletedKept": "Đã xoá thư mục \"{name}\", {n} tài liệu được giữ lại bên ngoài",
      "doc.updated": "Cập nhật: {time}",
      "doc.unpin": "Bỏ ghim", "doc.pin": "Ghim lên đầu",
      "doc.move": "Chuyển vào thư mục…",
      "doc.duplicate": "Nhân bản",
      "doc.delete": "Xoá {title}",
      "doc.deleted": "Đã xoá \"{title}\"",
      "doc.copySuffix": " (bản sao)",
      "doc.duplicated": "Đã tạo bản sao",
      "undo": "Hoàn tác",
      "moved.in": "Đã chuyển \"{title}\" vào \"{folder}\"",
      "moved.out": "Đã đưa \"{title}\" ra ngoài thư mục",
      "move.heading": "Chuyển vào thư mục",
      "move.newFolder": "Thư mục mới…",
      "theme.auto": "Theo hệ thống", "theme.light": "Sáng", "theme.dark": "Tối",
      "theme.title": "Giao diện: {name} (nhấp để đổi)",
      "theme.toast": "Giao diện: {name}",
      "stat.words": "{n} từ",
      "stat.chars": "{n} ký tự",
      "stat.read": "~{n} phút đọc",
      "stat.cursor": "Dòng {line}, cột {col}",
      "stat.sel": " (chọn {n})",
      "ph.bold": "chữ đậm", "ph.italic": "chữ nghiêng", "ph.strike": "gạch ngang",
      "ph.linkText": "văn bản", "ph.alt": "mô tả",
      "ph.table": "| Cột 1 | Cột 2 | Cột 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",
      "ph.tableSel": "Cột 1",
      "copy.richDone": "Đã sao chép nội dung có định dạng",
      "copy.blockTitle": "Sao chép khối này (có định dạng)",
      "copy.sectionTitle": "Sao chép cả mục này (có định dạng)",
      "copy.blockDone": "Đã sao chép khối",
      "copy.sectionDone": "Đã sao chép cả mục \"{title}\"",
      "copy.mdDone": "Đã sao chép markdown",
      "gs.summary": function (v) {
        return (v.hits ? v.hits + v.plus + " kết quả trong " : "") + v.docs + " tài liệu" +
          (v.short ? " · gõ thêm để tìm trong nội dung" : "");
      },
      "gs.none": "Không tìm thấy \"{q}\"",
      "gs.occurrences": "{n} lần xuất hiện",
      "gs.line": "Dòng {n}",
      "gs.onLine": "{n} lần trên dòng này",
      "gs.more": "Xem thêm {n} dòng trong tài liệu này",
      "gs.rest": "Còn {n} tài liệu khác, hãy gõ cụ thể hơn",
      "gs.foot": "<span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span id=\"gs-complete\"></span><span><kbd>Esc</kbd> đóng</span>",
      "gs.complete": " hoàn tất \"{w}\"",
      "backup.done": "Đã sao lưu {n} tài liệu",
      "backup.invalid": "File sao lưu không hợp lệ",
      "backup.badFormat": "File sao lưu không đúng định dạng",
      "restore.done": "Khôi phục xong: thêm {added}, cập nhật {updated} tài liệu",
      "file.unsupported": "Chỉ hỗ trợ file .md, .markdown, .txt",
      "file.opened1": "Đã mở \"{name}\"",
      "file.openedN": "Đã mở {n} file",
      "file.into": " vào \"{folder}\"",
      "file.skipped": " (bỏ qua {n} file không hỗ trợ)",
      "file.readFail": "Không đọc được file",
      "toast.close": "Đóng thông báo",
      "export.zip": "Tất cả tài liệu",
      "export.zipAll": "Xuất tất cả file .md",
      "zip.done": "Đã xuất {n} tài liệu (.zip)",
      "tb.alert": "Khung thông báo [!NOTE] → [!TIP] → [!IMPORTANT]… (nhấn nhiều lần)",
      "tb.math": "Công thức toán học ($…$ hoặc $$…$$)",
      "tb.find": "Tìm & thay thế trong tài liệu (Ctrl+F / Ctrl+H)",
      "alert.note": "Ghi chú", "alert.tip": "Mẹo", "alert.important": "Quan trọng", "alert.warning": "Cảnh báo", "alert.caution": "Thận trọng",
      "fr.aria": "Tìm và thay thế",
      "fr.findPlaceholder": "Tìm trong tài liệu…",
      "fr.replacePlaceholder": "Thay thế bằng…",
      "fr.caseTitle": "Phân biệt chữ hoa/thường & dấu",
      "fr.prev": "Kết quả trước (Shift+Enter)",
      "fr.next": "Kết quả tiếp theo (Enter)",
      "fr.replace": "Thay thế",
      "fr.replaceTitle": "Thay thế kết quả hiện tại",
      "fr.replaceAll": "Tất cả",
      "fr.replaceAllTitle": "Thay thế tất cả kết quả",
      "fr.replaced": "Đã thay thế {n} vị trí",
      "sort.title": "Sắp xếp tài liệu",
      "sort.heading": "Sắp xếp theo",
      "sort.updated": "Mới cập nhật",
      "sort.name": "Tiêu đề (A → Z)",
      "sort.length": "Độ dài nội dung",
      "trash.heading": "Thùng rác",
      "trash.restore": "Khôi phục tài liệu",
      "trash.deletePerm": "Xoá vĩnh viễn",
      "trash.restored": "Đã khôi phục \"{title}\"",
      "trash.deletedPerm": "Đã xoá vĩnh viễn \"{title}\"",
      "trash.emptyAction": "Dọn sạch thùng rác",
      "trash.emptied": "Đã dọn sạch thùng rác",
      "tpl.title": "Tạo từ mẫu…",
      "tpl.heading": "Tạo từ mẫu có sẵn",
      "tpl.meeting": "Biên bản cuộc họp",
      "tpl.readme": "README dự án",
      "tpl.spec": "Tài liệu kỹ thuật & lưu ý",
      "tpl.tasks": "Quản lý công việc",
      "tpl.math": "Toán học & sơ đồ",
      "tpl.created": "Đã tạo từ mẫu \"{name}\"",
      "tpl.content.meeting": "# Biên bản cuộc họp\n\n- **Ngày:** {date}\n- **Thành viên:** @nhom\n- **Mục tiêu:** Họp định kỳ & chốt phương án\n\n## Nội dung chính\n\n1. Điểm lại tiến độ tuần qua\n2. Các vướng mắc & hướng xử lý\n3. Kế hoạch tiếp theo\n\n## Ghi chú thảo luận\n\n> [!NOTE]\n> Quyết định quan trọng: ưu tiên trải nghiệm offline và tốc độ tìm kiếm.\n\n| Hạng mục | Phụ trách | Trạng thái |\n| --- | --- | --- |\n| Giao diện | An | Hoàn thành |\n| Xuất tài liệu | Bình | Đang làm |\n\n## Việc cần làm\n\n- [ ] Gửi lộ trình cập nhật cho nhóm\n- [ ] Chốt danh sách kiểm tra trước khi phát hành\n",
      "tpl.content.readme": "# Tên Dự Án\n\nMô tả ngắn gọn về mục đích của dự án và đối tượng sử dụng.\n\n> [!TIP]\n> Thiết kế gọn nhẹ, nhanh chóng và bảo mật dữ liệu.\n\n## Tính năng nổi bật\n\n- Xem trước trực tiếp kèm cuộn đồng bộ mượt mà\n- Hỗ trợ vẽ sơ đồ **Mermaid** và công thức toán **KaTeX**\n- Xuất ra HTML, Word, PDF hoặc gói ZIP\n\n## Cài đặt nhanh\n\n```bash\ngit clone https://github.com/username/project.git\ncd project\n```\n\n## Kiến trúc\n\n```mermaid\nflowchart LR\n  User[Trình duyệt] --> App[Ứng dụng Web]\n  App --> Store[(LocalStorage)]\n  App --> Export[HTML / Word / PDF]\n```\n\n## Giấy phép\n\nMIT © {year}\n",
      "tpl.content.spec": "# Đặc tả Kỹ thuật: Tính năng X\n\n## 1. Tổng quan\n\nTóm tắt bài toán cần giải quyết và giải pháp đề xuất.\n\n> [!IMPORTANT]\n> Toàn bộ dữ liệu phải được xử lý tại trình duyệt, không phụ thuộc máy chủ ngoài.\n\n## 2. Luồng hoạt động\n\n```mermaid\nsequenceDiagram\n  participant U as Người dùng\n  participant E as Trình soạn thảo\n  participant P as Bản xem trước\n  U->>E: Gõ Markdown\n  E->>P: Hiển thị HTML + Sơ đồ + Toán học\n```\n\n## 3. Rủi ro & Giải pháp\n\n> [!WARNING]\n> Tài liệu quá dài có thể gây trễ khi vẽ lại; cần debounce ở mức 150ms.\n\n> [!CAUTION]\n> Xoá dữ liệu duyệt web sẽ làm mất dữ liệu cục bộ nếu chưa sao lưu.\n",
      "tpl.content.tasks": "# Quản lý Công việc\n\n## Ưu tiên cao\n\n- [ ] Hoàn thiện các tính năng cốt lõi\n- [ ] Kiểm tra độ tương phản giao diện tối (Dark mode)\n\n## Đang thực hiện\n\n- [x] Tổ chức cấu trúc thư mục tài liệu\n- [ ] Viết hướng dẫn sử dụng\n\n## Dự kiến (Backlog)\n\n| Công việc | Độ ưu tiên | Ước lượng |\n| --- | --- | --- |\n| Bộ nhớ đệm Offline PWA | Cao | 2h |\n| Thư viện mẫu tài liệu | Trung bình | 1h |\n",
      "tpl.content.math": "# Công thức Toán học & Sơ đồ\n\n## 1. Toán học LaTeX (KaTeX)\n\nCông thức trong dòng: Đồng nhất thức Euler $e^{i\\pi} + 1 = 0$ và nghiệm phương trình bậc hai $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.\n\nCông thức khối (Tích phân Gauss):\n\n$$\n\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\n$$\n\nTổng chuỗi:\n\n$$\n\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}\n$$\n\n## 2. Sơ đồ trạng thái Mermaid\n\n```mermaid\nstateDiagram-v2\n  [*] --> BanNhap\n  BanNhap --> Duyet : Gửi duyệt\n  Duyet --> XuatBan : Phê duyệt\n  Duyet --> BanNhap : Yêu cầu sửa\n```\n"
    }
  };

  var LOCALES = { en: "en-US", vi: "vi-VN" };

  function readLang() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY_PREFS) || "{}") || {};
      if (STR[p.lang]) return p.lang;
    } catch (e) {}
    return DEFAULT_LANG;
  }

  var lang = readLang();

  function t(key, vars) {
    var v = STR[lang][key];
    if (v === undefined) v = STR.en[key];
    if (v === undefined) return key;
    if (typeof v === "function") return v(vars || {});
    if (!vars) return v;
    return v.replace(/\{(\w+)\}/g, function (m, k) {
      var x = vars[k];
      if (x === undefined) return m;
      return typeof x === "number" ? x.toLocaleString(LOCALES[lang]) : x;
    });
  }

  // Static markup: data-i18n (text), data-i18n-html, data-i18n-title, data-i18n-placeholder,
  // data-i18n-aria (aria-label), data-i18n-empty (data-empty)
  function apply(rootEl) {
    var r = rootEl || document;
    var map = [
      ["data-i18n", function (el, s) { el.textContent = s; }],
      ["data-i18n-html", function (el, s) { el.innerHTML = s; }],
      ["data-i18n-title", function (el, s) { el.title = s; }],
      ["data-i18n-placeholder", function (el, s) { el.placeholder = s; }],
      ["data-i18n-aria", function (el, s) { el.setAttribute("aria-label", s); }],
      ["data-i18n-empty", function (el, s) { el.setAttribute("data-empty", s); }]
    ];
    map.forEach(function (m) {
      r.querySelectorAll("[" + m[0] + "]").forEach(function (el) { m[1](el, t(el.getAttribute(m[0]))); });
    });
    document.documentElement.setAttribute("lang", lang);
  }

  window.I18N = {
    t: t,
    apply: apply,
    get lang() { return lang; },
    get locale() { return LOCALES[lang]; },
    languages: Object.keys(STR),
    setLang: function (l) { if (STR[l]) lang = l; return lang; }
  };

  document.documentElement.setAttribute("lang", lang);
})();
