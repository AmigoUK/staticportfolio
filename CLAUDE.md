# Project Overview

Static portfolio site for **John Doe**, a (fictional) ML engineer specializing in LLMs / GenAI evaluation infrastructure. Pure HTML + CSS + JS — no framework, no build step. Deployable to any static host (GitHub Pages, Cloudflare Pages, Netlify, plain Nginx).

# Tech Stack

- **Markup:** HTML5 (vanilla, hand-written, one file per page)
- **Styles:** CSS3 with custom properties (CSS variables), no preprocessor, no Tailwind
- **Scripts:** Vanilla JavaScript (ES2022), no bundler, no transpile
- **Fonts:** Geist Sans + Geist Mono via Bunny Fonts CDN (privacy-friendly Google Fonts mirror) — self-hostable later if needed
- **Hosting target:** any static host; tested locally with `python3 -m http.server`

# Naming & Coding Conventions

- File naming: **kebab-case** for everything (`why-most-rag-evals-are-broken.html`, `tokens.css`).
- HTML: 2-space indent, lowercase element and attribute names, double-quoted attributes, self-close void elements with `/>` for clarity.
- CSS: 2-space indent, one selector per line, properties alphabetized within a block where practical. All colors and spacing flow through CSS custom properties in `assets/css/tokens.css` — no hex values inline.
- JavaScript: 2-space indent, no semicolons-optional debate — **use semicolons**. `const` by default, `let` only when reassigning. No frameworks, no jQuery.
- Theme tokens live on `:root[data-theme="light"]` and `:root[data-theme="dark"]`. Toggle by mutating `document.documentElement.dataset.theme`.
- Folder layout: pages at root or under topical dirs (`work/`, `writing/`); shared assets under `assets/{css,js,fonts,img}`.

# Protected Files

- `CLAUDE.md` — this file. Update structure only with explicit user request.
- `assets/css/tokens.css` color tokens — do not rename or remove existing tokens; new ones can be added. Renaming requires sweeping every consuming file.
- Anything under `assets/fonts/` once populated — those are vendor-shipped artifacts.
