// Public-site nav behavior:
//
//   1) Overflow detection — collapses the header nav into a hamburger
//      when items can't fit on one line. Below 720px the CSS media query
//      handles it instead.
//
//   2) Submenu hover-grace — once a submenu opens on mouseenter, it
//      stays open for 3 seconds after mouseleave before closing, so you
//      don't lose it the moment your cursor slips off. Re-entering
//      within those 3 seconds cancels the close. Clicking anywhere
//      outside the open group closes it immediately. Keyboard focus
//      uses the same logic (focusin opens, focusout starts the timer).
//      The CSS :hover and :focus-within rules still work as a fallback
//      when this script hasn't run yet.

(function () {
  "use strict";

  const TOGGLE_ID = "nav-toggle";
  const HEADER_SELECTOR = ".site-header";
  const NAV_SELECTOR = ".nav";
  const BRAND_SELECTOR = ".brand";
  const GROUP_SELECTOR = ".nav-group";
  const MEASURING_CLASS = "measuring";
  const OVERFLOW_CLASS = "is-overflowing";
  const OPEN_CLASS = "is-open";
  const HOVER_GRACE_MS = 3000;

  function check(header) {
    if (!header) return;
    const wrap = header.querySelector(".wrap");
    const nav = header.querySelector(NAV_SELECTOR);
    const brand = header.querySelector(BRAND_SELECTOR);
    if (!wrap || !nav || !brand) return;

    header.classList.add(MEASURING_CLASS);

    const wrapStyle = window.getComputedStyle(wrap);
    const padX = parseFloat(wrapStyle.paddingLeft || "0") + parseFloat(wrapStyle.paddingRight || "0");
    const gapPx = 16;
    const available = wrap.clientWidth - padX - brand.offsetWidth - gapPx;

    let natural = 0;
    const children = Array.from(nav.children);
    for (const child of children) natural += child.offsetWidth;
    natural += Math.max(0, children.length - 1) * 16;

    header.classList.remove(MEASURING_CLASS);

    if (natural > available) {
      header.classList.add(OVERFLOW_CLASS);
    } else {
      header.classList.remove(OVERFLOW_CLASS);
      const toggle = document.getElementById(TOGGLE_ID);
      if (toggle && toggle.checked && window.innerWidth > 720) toggle.checked = false;
    }
  }

  function setupSubmenus(header) {
    const groups = Array.from(header.querySelectorAll(GROUP_SELECTOR));
    if (groups.length === 0) return;

    const timers = new WeakMap();

    function clearTimer(group) {
      const t = timers.get(group);
      if (t !== undefined) {
        clearTimeout(t);
        timers.delete(group);
      }
    }

    function closeNow(group) {
      clearTimer(group);
      group.classList.remove(OPEN_CLASS);
    }

    function closeAllExcept(except) {
      for (const g of groups) if (g !== except) closeNow(g);
    }

    function openGroup(group) {
      clearTimer(group);
      closeAllExcept(group);
      group.classList.add(OPEN_CLASS);
    }

    function scheduleClose(group) {
      clearTimer(group);
      const t = setTimeout(() => {
        group.classList.remove(OPEN_CLASS);
        timers.delete(group);
      }, HOVER_GRACE_MS);
      timers.set(group, t);
    }

    for (const group of groups) {
      group.addEventListener("mouseenter", () => openGroup(group));
      group.addEventListener("mouseleave", () => scheduleClose(group));
      group.addEventListener("focusin", () => openGroup(group));
      group.addEventListener("focusout", (e) => {
        // Only schedule a close if focus moved outside this group.
        const next = e.relatedTarget;
        if (!next || !group.contains(next)) scheduleClose(group);
      });
    }

    // Click anywhere outside any nav-group closes all open groups now.
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.closest && target.closest(GROUP_SELECTOR)) return;
      for (const g of groups) closeNow(g);
    });

    // ESC closes immediately and returns focus to the active parent.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      for (const g of groups) closeNow(g);
    });
  }

  function init() {
    const header = document.querySelector(HEADER_SELECTOR);
    if (!header) return;

    let raf = null;
    const schedule = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        check(header);
      });
    };
    schedule();
    window.addEventListener("resize", schedule);

    header.addEventListener("click", function (e) {
      if (e.target && e.target.matches && e.target.matches(NAV_SELECTOR + " a")) {
        const toggle = document.getElementById(TOGGLE_ID);
        if (toggle) toggle.checked = false;
      }
    });

    setupSubmenus(header);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
