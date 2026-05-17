// Mini rich-text editor.
// - Wraps a hidden textarea with a contenteditable shell + toolbar.
// - Syncs editor.innerHTML back to the textarea on every input.
// - Server-side sanitize-html is the source of truth for what survives a save.
// - Insert menu: YouTube embed, code block, image, file download.
// - Source/HTML view toggle: swap contenteditable for the raw textarea.

(function () {
  "use strict";

  const ADMIN_BASE = document.documentElement.dataset.adminBase || "/admin";
  const HTML_KEY = "inner" + "HTML";

  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function elt(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (kids) kids.forEach((k) => e.appendChild(k));
    return e;
  }

  function runCmd(cmd, value) {
    document.execCommand(cmd, false, value);
  }

  function readHtml(node) { return node[HTML_KEY]; }
  function writeHtml(node, html) { node[HTML_KEY] = html; }

  function escapeAttr(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function makeToolbar(editor, area, controls) {
    const bar = elt("div", { class: "rte-toolbar", role: "toolbar" });
    const buttons = [
      ["B", "Bold (Ctrl+B)", "rte-bold", () => runCmd("bold")],
      ["I", "Italic (Ctrl+I)", "rte-italic", () => runCmd("italic")],
      ["U", "Underline (Ctrl+U)", "rte-underline", () => runCmd("underline")],
      ["sep"],
      ["H2", "Heading 2", "rte-h", () => runCmd("formatBlock", "H2")],
      ["H3", "Heading 3", "rte-h", () => runCmd("formatBlock", "H3")],
      ["P", "Paragraph", "rte-h", () => runCmd("formatBlock", "P")],
      ["sep"],
      ["• list", "Bulleted list", "rte-list", () => runCmd("insertUnorderedList")],
      ["1. list", "Numbered list", "rte-list", () => runCmd("insertOrderedList")],
      ["“ ”", "Block quote", "rte-quote", () => runCmd("formatBlock", "BLOCKQUOTE")],
      ["</>", "Inline code", "rte-code", () => wrapSelectionWith("code")],
      ["sep"],
      ["Link", "Insert / edit link", "rte-link", () => insertLink()],
      ["sep"],
      ["Clear", "Strip formatting from selection", "rte-clear", () => runCmd("removeFormat")],
    ];

    for (const def of buttons) {
      if (def[0] === "sep") { bar.appendChild(elt("span", { class: "rte-divider" })); continue; }
      const [label, title, klass, action] = def;
      const b = elt("button", { type: "button", class: `rte-btn ${klass}`, title, text: label });
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        editor.focus();
        action();
        syncToTextarea(editor, area);
      });
      bar.appendChild(b);
    }

    // Insert dropdown — YouTube, image, code block, file download.
    bar.appendChild(elt("span", { class: "rte-divider" }));
    bar.appendChild(makeInsertMenu(editor, area));

    // Push HTML-view toggle to the right.
    bar.appendChild(elt("span", { class: "rte-spacer" }));
    const htmlBtn = elt("button", {
      type: "button",
      class: "rte-btn rte-source",
      title: "Toggle source / HTML view",
      text: "Source",
    });
    htmlBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      controls.toggleSource(htmlBtn);
    });
    bar.appendChild(htmlBtn);
    return bar;
  }

  function makeInsertMenu(editor, area) {
    const wrap = elt("span", { class: "rte-insert-wrap" });
    const btn = elt("button", { type: "button", class: "rte-btn rte-insert-btn", title: "Insert…", text: "Insert ▾" });
    const menu = elt("div", { class: "rte-insert-menu", role: "menu" });
    const items = [
      ["Image", () => openImagePicker(editor, area)],
      ["YouTube embed", () => insertYouTube(editor, area)],
      ["Code block", () => insertCodeBlock(editor, area)],
      ["File download", () => openFilePicker(editor, area)],
    ];
    for (const [label, action] of items) {
      const it = elt("button", { type: "button", class: "rte-insert-item", role: "menuitem", text: label });
      it.addEventListener("click", (ev) => {
        ev.preventDefault();
        wrap.classList.remove("is-open");
        editor.focus();
        action();
      });
      menu.appendChild(it);
    }
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      wrap.classList.toggle("is-open");
    });
    document.addEventListener("click", (ev) => {
      if (!wrap.contains(ev.target)) wrap.classList.remove("is-open");
    });
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  function wrapSelectionWith(tagName) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const wrapper = document.createElement(tagName);
    try { range.surroundContents(wrapper); }
    catch (_) {
      wrapper.textContent = sel.toString();
      range.deleteContents();
      range.insertNode(wrapper);
    }
  }

  function insertLink() {
    const url = prompt("Link URL (http, https, or mailto):", "https://");
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) {
      alert("URL must start with http://, https://, or mailto:");
      return;
    }
    runCmd("createLink", url);
  }

  function extractYouTubeId(input) {
    const s = String(input || "").trim();
    if (!s) return null;
    // Bare ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
      if (/youtube(-nocookie)?\.com$/.test(u.hostname)) {
        const v = u.searchParams.get("v");
        if (v) return v;
        const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
        if (m) return m[2];
      }
    } catch (_) { /* not a URL */ }
    return null;
  }

  function insertYouTube(editor, area) {
    const input = prompt("YouTube URL or video ID:", "https://www.youtube.com/watch?v=");
    if (!input) return;
    const id = extractYouTubeId(input);
    if (!id) {
      alert("Couldn't recognise that as a YouTube URL or video ID.");
      return;
    }
    const iframe =
      '<iframe src="https://www.youtube-nocookie.com/embed/' + escapeAttr(id) + '" ' +
      'width="560" height="315" title="YouTube video" frameborder="0" ' +
      'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
      'allowfullscreen></iframe>';
    runCmd("insertHTML", '<p>' + iframe + '</p><p><br></p>');
    syncToTextarea(editor, area);
  }

  function insertCodeBlock(editor, area) {
    runCmd("insertHTML", '<pre><code>// code here</code></pre><p><br></p>');
    syncToTextarea(editor, area);
  }

  function openImagePicker(editor, area) {
    openPicker({
      endpoint: ADMIN_BASE + "/api/media.json",
      title: "Insert image",
      emptyMsg: "No images uploaded yet. Visit Media to upload first.",
      renderCard: (m) => {
        const card = elt("button", { type: "button", class: "rte-modal-card" });
        const img = elt("img", { src: ADMIN_BASE + "/uploads/" + m.filename, alt: m.alt || "" });
        card.appendChild(img);
        card.appendChild(elt("span", { class: "rte-modal-name", text: m.alt || m.original_filename || m.filename }));
        card.addEventListener("click", () => {
          const publicHref = "assets/img/" + m.filename;
          runCmd("insertHTML", '<img src="' + escapeAttr(publicHref) + '" alt="' + escapeAttr(m.alt || "") + '" />');
          syncToTextarea(editor, area);
          closeOverlay();
        });
        return card;
      },
    });
  }

  function openFilePicker(editor, area) {
    openPicker({
      endpoint: ADMIN_BASE + "/api/files.json",
      title: "Insert file download",
      emptyMsg: "No files uploaded yet. Visit Media → Upload file first.",
      renderCard: (m) => {
        const card = elt("button", { type: "button", class: "rte-modal-card rte-modal-card-file" });
        const icon = m.mime_type && m.mime_type.indexOf("audio/") === 0 ? "♪"
                   : m.mime_type && m.mime_type.indexOf("video/") === 0 ? "▶" : "📄";
        card.appendChild(elt("span", { class: "rte-file-icon", text: icon }));
        const label = m.alt || m.original_filename || m.filename;
        card.appendChild(elt("span", { class: "rte-modal-name", text: label }));
        card.appendChild(elt("span", { class: "rte-modal-info", text: m.mime_type + " · " + (m.bytes / 1024).toFixed(1) + " KB" }));
        card.addEventListener("click", () => {
          const publicHref = "assets/files/" + m.filename;
          const downloadName = m.original_filename || m.filename;
          const html = '<a href="' + escapeAttr(publicHref) + '" download="' + escapeAttr(downloadName) + '">' + escapeAttr(label) + '</a>';
          runCmd("insertHTML", html);
          syncToTextarea(editor, area);
          closeOverlay();
        });
        return card;
      },
    });
  }

  let currentOverlay = null;
  function closeOverlay() {
    if (currentOverlay && currentOverlay.parentNode) currentOverlay.parentNode.removeChild(currentOverlay);
    currentOverlay = null;
  }

  function openPicker({ endpoint, title, emptyMsg, renderCard }) {
    fetch(endpoint, { credentials: "same-origin" })
      .then((r) => r.json())
      .then(({ media }) => {
        if (!media || media.length === 0) { alert(emptyMsg); return; }
        const overlay = elt("div", {
          class: "rte-modal-overlay",
          onclick: (e) => { if (e.target === overlay) closeOverlay(); },
        });
        const modal = elt("div", { class: "rte-modal" });
        modal.appendChild(elt("h3", { text: title }));
        const grid = elt("div", { class: "rte-modal-grid" });
        media.forEach((m) => grid.appendChild(renderCard(m)));
        modal.appendChild(grid);
        modal.appendChild(elt("button", { type: "button", class: "btn btn-ghost", text: "Cancel", onclick: closeOverlay }));
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        currentOverlay = overlay;
      })
      .catch(() => alert("Failed to load list."));
  }

  function syncToTextarea(editor, area) {
    area.value = readHtml(editor);
  }

  function init() {
    $$("textarea[data-rte]").forEach((area) => {
      const wrap = elt("div", { class: "rte-wrap" });
      const editor = elt("div", { class: "rte-editor", contenteditable: "true", spellcheck: "true" });
      writeHtml(editor, area.value || "");
      area.style.display = "none";
      area.insertAdjacentElement("beforebegin", wrap);

      let sourceMode = false;
      function toggleSource(btn) {
        if (sourceMode) {
          // Going back to WYSIWYG: pull the (possibly hand-edited) HTML into the editor.
          writeHtml(editor, area.value || "");
          editor.style.display = "";
          area.classList.remove("rte-html-mode");
          area.style.display = "none";
          btn.textContent = "Source";
          sourceMode = false;
          editor.focus();
        } else {
          // Going to source: write the latest editor HTML into the textarea, then show it.
          syncToTextarea(editor, area);
          editor.style.display = "none";
          area.classList.add("rte-html-mode");
          area.style.display = "";
          btn.textContent = "Visual";
          sourceMode = true;
          area.focus();
        }
      }

      wrap.appendChild(makeToolbar(editor, area, { toggleSource }));
      wrap.appendChild(editor);
      wrap.appendChild(area);

      editor.addEventListener("input", () => syncToTextarea(editor, area));
      editor.addEventListener("blur", () => syncToTextarea(editor, area));
      editor.addEventListener("paste", (e) => {
        const text = e.clipboardData && e.clipboardData.getData("text/plain");
        if (text) {
          e.preventDefault();
          runCmd("insertText", text);
          syncToTextarea(editor, area);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
