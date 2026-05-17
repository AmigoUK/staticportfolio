// One-click copy for every <pre> block on the public site.
// Button is hidden by default, fades in on hover or keyboard focus
// (always visible on touch devices). 2-second "Copied!" / "Error" feedback.

(function () {
  "use strict";

  function init() {
    const pres = document.querySelectorAll("pre");
    for (const pre of pres) {
      if (pre.querySelector(".code-copy-btn")) continue; // already enhanced
      const code = pre.querySelector("code") || pre;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy-btn";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.textContent = "Copy";
      btn.addEventListener("click", function () {
        copy(code.textContent.replace(/^\s+|\s+$/g, ""))
          .then(() => flash(btn, "Copied!", "is-copied"))
          .catch(() => flash(btn, "Error", "is-error"));
      });
      pre.appendChild(btn);
    }
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for very old browsers / non-HTTPS contexts.
    return new Promise(function (resolve, reject) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("execCommand failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  function flash(btn, label, klass) {
    btn.textContent = label;
    btn.classList.add(klass);
    setTimeout(function () {
      btn.textContent = "Copy";
      btn.classList.remove("is-copied", "is-error");
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
