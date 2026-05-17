// Hamburger detection: collapses the header nav when it would otherwise
// wrap to a second line. Below 720px the CSS media query handles it
// instead; this script targets the desktop-overflow case (lots of menu
// items + narrow non-mobile viewport).

(function () {
  "use strict";

  const TOGGLE_ID = "nav-toggle";
  const HEADER_SELECTOR = ".site-header";
  const NAV_SELECTOR = ".nav";
  const BRAND_SELECTOR = ".brand";
  const MEASURING_CLASS = "measuring";
  const OVERFLOW_CLASS = "is-overflowing";

  function check(header) {
    if (!header) return;
    const wrap = header.querySelector(".wrap");
    const nav = header.querySelector(NAV_SELECTOR);
    const brand = header.querySelector(BRAND_SELECTOR);
    if (!wrap || !nav || !brand) return;

    // Force the natural row layout for measurement.
    header.classList.add(MEASURING_CLASS);

    const wrapStyle = window.getComputedStyle(wrap);
    const padX = parseFloat(wrapStyle.paddingLeft || "0") + parseFloat(wrapStyle.paddingRight || "0");
    const gapPx = 16; // matches --space-4 gap between brand and nav
    const available = wrap.clientWidth - padX - brand.offsetWidth - gapPx;

    // Sum each nav child's actual rendered width including margins / gaps.
    let natural = 0;
    const children = Array.from(nav.children);
    for (const child of children) {
      natural += child.offsetWidth;
    }
    natural += Math.max(0, children.length - 1) * 16;

    header.classList.remove(MEASURING_CLASS);

    if (natural > available) {
      header.classList.add(OVERFLOW_CLASS);
    } else {
      header.classList.remove(OVERFLOW_CLASS);
      // When the viewport grows wide enough to fit everything, also close
      // any panel that was left open from a smaller size.
      const toggle = document.getElementById(TOGGLE_ID);
      if (toggle && toggle.checked && window.innerWidth > 720) toggle.checked = false;
    }
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
    // Close the panel when a nav link is clicked (mobile + collapsed alike).
    header.addEventListener("click", function (e) {
      if (e.target && e.target.matches && e.target.matches(NAV_SELECTOR + " a")) {
        const toggle = document.getElementById(TOGGLE_ID);
        if (toggle) toggle.checked = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
