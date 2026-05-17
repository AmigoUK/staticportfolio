# Project Overview

Portfolio site for **John Doe**, a (fictional) ML engineer specializing in LLMs / GenAI evaluation infrastructure.

This repo has two long-lived branches:

- **`main`** — pure-static HTML + CSS + JS, no build step. Deployable to any static host. Tag `v1-static` marks the final state before the CMS variant.
- **`cms`** — same site, but content is driven by a SQLite-backed admin app. A "Publish" action in the admin regenerates static HTML into `public/`, which Apache continues to serve. The admin runs as a Node/Fastify process behind an Apache reverse proxy at `/admin/`.

Both branches stay in sync visually — the CMS regenerates HTML that should be pixel-equivalent to the static branch.

# Tech Stack — main branch

- **Markup:** HTML5 (vanilla, hand-written, one file per page)
- **Styles:** CSS3 with custom properties, no preprocessor
- **Scripts:** Vanilla JavaScript (ES2022), no bundler
- **Fonts:** Geist Sans + Geist Mono via Bunny Fonts CDN (slated for self-host)
- **Hosting:** any static host; tested locally with `python3 -m http.server`

# Tech Stack — cms branch

- **Runtime:** Node 20.11+ LTS (the system runs Node 22.x; both compatible)
- **Framework:** Fastify 4 + `@fastify/cookie` + `@fastify/session` + `@fastify/csrf-protection` + `@fastify/static` + `@fastify/multipart` + `@fastify/rate-limit`
- **DB:** SQLite via `better-sqlite3` 11
- **Templates:** Eta 3 (used for both admin pages and the regenerated public site)
- **RTE:** TipTap 2 (StarterKit + Link + Image) — body content stored as ProseMirror JSON plus sanitized HTML
- **Sanitization:** `sanitize-html` 2.x (server-side, on every RTE body before store + before render)
- **Image processing:** `sharp` 0.33.x (re-encode, strip EXIF, magic-byte check)
- **Auth:** `bcrypt` 5, signed session cookie, single admin user
- **Fonts:** ~6 self-hosted WOFF2 families committed to `source-assets/fonts/` (Geist, Inter, IBM Plex Sans + Geist Mono, JetBrains Mono, IBM Plex Mono) plus 2 system stacks; no external API
- **Test:** native `node --test`; no transpile, no bundler
- **Hosting:** Apache reverse-proxies `/staticportfolio/admin/*` to Node on `127.0.0.1:3000`; Apache serves `/staticportfolio/*` from `public/` directly

# Naming & Coding Conventions

- File naming: **kebab-case** for everything.
- HTML: 2-space indent, lowercase element and attribute names, double-quoted attributes, self-close void elements with `/>` for clarity.
- CSS: 2-space indent, one selector per line, properties alphabetized within a block where practical. All colors and spacing flow through CSS custom properties — no hex values inline.
- JavaScript: 2-space indent, **use semicolons**, `const` by default, `let` only when reassigning.
- Theme tokens live on `:root[data-theme="light"]` and `:root[data-theme="dark"]`. Toggle by mutating `document.documentElement.dataset.theme`.
- Node code (`cms` branch): ES modules (`type: module`), no transpile. Path separator: always `node:path`. Async/await; no callback-based code.

# Folder layout (cms branch)

```
/                          repo root
├── app/                   Fastify app source
│   └── src/
│       ├── server.js                  entry
│       ├── routes/        admin pages + admin API + auth
│       ├── db/            schema.sql, connect.js, queries/
│       ├── services/      publish, themes, fonts, media, sanitize
│       ├── templates/     eta for public/ and for admin/
│       ├── lib/           auth, csrf, slug helpers
│       └── public-assets/ admin static (tiptap bundle, admin css)
├── source-assets/         canonical CSS/JS/fonts copied to public/ on publish
│   ├── css/{reset,site}.css
│   ├── js/theme.js
│   └── fonts/             bundled WOFF2s + LICENSES/
├── scripts/               create-admin.js, reset-password.js, publish.js
├── seed/                  one-time importer + legacy/ (copy of main-branch HTML)
├── deploy/                apache config snippet
├── data/                  SQLite DB (gitignored)
├── uploads/               raw uploaded media (gitignored)
├── public/                regenerated static site (gitignored)
├── package.json
├── .env / .env.example
└── CLAUDE.md
```

# Protected Files

- `CLAUDE.md` — update structure only with explicit user request.
- `source-assets/css/site.css` (main visual style) — change only via direct user request.
- Anything under `source-assets/fonts/` — vendor-shipped artifacts; licenses in `source-assets/fonts/LICENSES/`.
- `seed/legacy/**` — read-only snapshot of the main-branch HTML; never modify (it's the migration reference).
- Existing color tokens in the active theme — adding tokens is fine; renaming or removing requires sweeping every template.

# Operational notes (cms branch)

- Run `npm install` once at repo root.
- `npm run create-admin` then `npm run dev` to get a local instance.
- `npm run seed` (once) imports the legacy static content into the DB.
- `npm run publish` regenerates `public/` from current DB state.
- Apache must have `mod_proxy_http` enabled; see `deploy/apache-staticportfolio.conf` for the vhost snippet.
- Backups = `data/portfolio.db` + `uploads/`. Everything else is regenerable.
