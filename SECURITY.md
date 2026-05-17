# Security model

## What's hardened

| Surface | Control |
| --- | --- |
| Login | bcrypt cost 12; 5 attempts / 15 min rate limit; no public signup |
| Sessions | `@fastify/session`, signed cookie, `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=1`, 24-hour max-age; secret required to be 32+ chars at startup or the process refuses to boot |
| CSRF | `@fastify/csrf-protection` double-submit token on **every** authenticated POST (logout, settings save, theme save/clone/activate/delete, font save, publish). Tokens stored in the session; validated in `preHandler` (after body parsing) |
| Form bodies | URL-encoded parser sanitizes via `new URLSearchParams`; field length capped per setting (1000 chars max) |
| Theme tokens | Server-side hex validation: every color must match `#RRGGBB`; preset themes refuse edits/deletes (`PRESET_LOCKED` error) |
| Public site | Strict `Content-Security-Policy` meta tag on every rendered page: `default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'none';` — no third-party CDNs, no inline styles, no inline scripts |
| Admin site | CSP allows `'self' 'unsafe-inline'` for `style-src` and `script-src` (the theme editor needs inline `<script>` for the live preview). `frame-src 'self'` lets the iframe preview render; everything else is `'self'`; `frame-ancestors 'none'`; `form-action 'self'` |
| Public referrer policy | `strict-origin-when-cross-origin` on all pages |
| HTTP-host binding | Defaults to `127.0.0.1`; a startup warning fires in production if the bind address is non-loopback (you should be behind Apache/Nginx) |
| Fonts | Self-hosted WOFF2 — no external font CDN dependency |
| Branch separation | Original static site preserved on `main` tagged `v1-static` |

## Threat model assumptions

- One admin user. There's no public signup, no password reset (admin runs `npm run reset-password` from a shell). Compromise of the host = compromise of everything; protect SSH and the admin password.
- The admin is reached over Tailscale or a reverse proxy with TLS. Direct exposure of `127.0.0.1:3000` to the open internet is explicitly out of scope. The startup warning when `HOST != 127.0.0.1` flags accidental exposure.
- The DB and uploads dir are private filesystem state. `data/` and `uploads/` are gitignored and the systemd unit narrows `ReadWritePaths=` to only those + the regen targets.

## What's not yet hardened (open work)

- **TipTap rich-text inputs** (checkpoints 7–9). When the editors land, every body must round-trip through `sanitize-html` server-side before being stored and before being rendered. Whitelist will allow StarterKit's tags plus `a[href|rel|target]`, `img[src|alt|width|height]`, `code`, `pre`; URLs constrained to http/https/mailto. Storage will hold both the ProseMirror JSON (`body_json`) and the sanitized HTML (`body_html`); render uses HTML directly without re-rendering from JSON.
- **File uploads** (checkpoint 6). Will stream to a temp file, validate the magic bytes (JPEG / PNG / WebP only — SVG explicitly rejected as an XSS vector), re-encode through `sharp` to strip EXIF, cap at 8 MB, and store under a random filename.
- **Session store**. Currently in-memory — sessions die on restart. For a long-running deployment, swap to a SQLite-backed store so admin doesn't re-authenticate on every deploy.

## Audit checklist (`npm test` + manual)

Manual checks done at the close of every milestone:

```sh
# 1. Every authenticated POST has CSRF or is rate-limited.
# Each app.post(...) block within 5 lines must contain csrfPre, csrfProtection,
# or rateLimit. The login route is rate-limited by design (no session yet to
# bind a CSRF token to).
for f in app/src/routes/*.js; do
  awk '
    /app\.(post|delete|patch|put)\(/ { capturing=1; buf=""; depth=0 }
    capturing { buf=buf "\n" $0
                if (/csrfPre|csrfProtection|rateLimit/) capturing=0
                if (++depth > 6) { print FILENAME ":" NR ": ungated:" buf; capturing=0 } }
  ' "$f"
done
# expected: empty

# 2. No inline styles in public templates
grep -nE 'style="[^"]+"' app/src/templates/public/*.eta app/src/templates/layouts/public-base.eta
# expected: empty

# 3. No inline event handlers in public output
grep -rnE '\bon(click|load|error|submit|change|input|focus|blur|mouse|key|touch)[a-z]*="' \
  app/src/templates/public/ app/src/templates/layouts/public-base.eta public/
# expected: empty

# 4. CSP meta present in every regenerated public HTML
for f in public/index.html public/*.html public/work/*.html public/writing/*.html; do
  grep -l "Content-Security-Policy" "$f" >/dev/null || echo "MISSING: $f"
done
# expected: empty (no MISSING lines)

# 5. Smoke-test CSRF rejection
# Log in, fetch dashboard, try POST /admin/logout without token → 403
# Try POST /admin/logout with token → 302
# (covered by app/src/routes/csrf.test.js)

# 6. All tests green
npm test
```

## Reporting

Found something? Open an issue at
https://github.com/AmigoUK/staticportfolio/issues or mail
[dev@attv.uk](mailto:dev@attv.uk).
