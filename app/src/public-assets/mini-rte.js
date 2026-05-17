// Mini rich-text editor.
// - Wraps a hidden textarea with a contenteditable shell + a toolbar.
// - Syncs the contenteditable back to the textarea on every input.
// - Server-side sanitize-html is the source of truth for what survives a save.
// - Image insertion opens a picker that fetches /admin/api/media.json.

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

  function makeToolbar(editor, area) {
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
      ["Image", "Insert image from media library", "rte-image", () => openImagePicker(editor, area)],
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
    return bar;
  }

  function wrapSelectionWith(tagName) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const wrapper = document.createElement(tagName);
    try {
      range.surroundContents(wrapper);
    } catch (_) {
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

  function openImagePicker(editor, area) {
    fetch(`${ADMIN_BASE}/api/media.json`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then(({ media }) => {
        if (!media || media.length === 0) {
          alert("No media uploaded yet. Visit Media to upload first.");
          return;
        }
        const overlay = elt("div", { class: "rte-modal-overlay", onclick: (e) => { if (e.target === overlay) document.body.removeChild(overlay); } });
        const modal = elt("div", { class: "rte-modal" });
        modal.appendChild(elt("h3", { text: "Insert image" }));
        const grid = elt("div", { class: "rte-modal-grid" });
        media.forEach((m) => {
          const card = elt("button", { type: "button", class: "rte-modal-card" });
          const img = elt("img", { src: `${ADMIN_BASE}/uploads/${m.filename}`, alt: m.alt || "" });
          card.appendChild(img);
          const label = elt("span", { class: "rte-modal-name", text: m.alt || m.original_filename || m.filename });
          card.appendChild(label);
          card.addEventListener("click", () => {
            editor.focus();
            const altSafe = (m.alt || "").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const publicHref = `assets/img/${m.filename}`;
            runCmd("insertHTML", `<img src="${publicHref}" alt="${altSafe}" />`);
            syncToTextarea(editor, area);
            document.body.removeChild(overlay);
          });
          grid.appendChild(card);
        });
        modal.appendChild(grid);
        const close = elt("button", { type: "button", class: "btn btn-ghost", text: "Cancel", onclick: () => document.body.removeChild(overlay) });
        modal.appendChild(close);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
      })
      .catch(() => alert("Failed to load media list."));
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
      wrap.appendChild(makeToolbar(editor, area));
      wrap.appendChild(editor);
      wrap.appendChild(area);

      editor.addEventListener("input", () => syncToTextarea(editor, area));
      editor.addEventListener("blur", () => syncToTextarea(editor, area));
      editor.addEventListener("paste", (e) => {
        const text = e.clipboardData?.getData("text/plain");
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
