(function () {
  "use strict";

  const STORAGE_KEY = "jd.theme";
  const root = document.documentElement;

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function writeStored(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {
      /* Safari private mode and storage-disabled browsers throw — ignore */
    }
  }

  function resolveInitial() {
    const stored = readStored();
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(next) {
    root.dataset.theme = next;
    const btn = document.querySelector("[data-theme-toggle]");
    if (btn) {
      btn.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
      btn.setAttribute("aria-pressed", String(next === "dark"));
    }
  }

  applyTheme(resolveInitial());

  document.addEventListener("DOMContentLoaded", function () {
    const btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      writeStored(next);
      applyTheme(next);
    });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
    if (!readStored()) {
      applyTheme(e.matches ? "dark" : "light");
    }
  });
})();
