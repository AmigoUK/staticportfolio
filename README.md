# staticportfolio (cms branch)

A small SQLite-backed CMS that publishes a static portfolio site. The public site stays static — Apache serves regenerated HTML from `public/` — and a Fastify admin app behind `/admin/` handles editing, theming, fonts, media, and the rich text editor.

The static-only variant lives on the `main` branch (tag `v1-static`).

## Setup

Requires Node 20.11+ (tested on Node 22) and Apache 2.4 with `mod_proxy_http` enabled.

```sh
cp .env.example .env
# edit .env — set SESSION_SECRET to a long random hex string

npm install
npm run create-admin     # interactive: pick a username + password
npm run dev              # starts Fastify on 127.0.0.1:3000
```

First-time content import (from the legacy `main`-branch HTML in `seed/legacy/`):

```sh
npm run seed
npm run publish          # writes public/
```

## Apache

See `deploy/apache-staticportfolio.conf` for the reverse-proxy snippet. The summary:

```
ProxyPass        /staticportfolio/admin/ http://127.0.0.1:3000/admin/
ProxyPassReverse /staticportfolio/admin/ http://127.0.0.1:3000/admin/
DocumentRoot pointing public/
```

## Backup

Two paths are precious: `data/portfolio.db` and `uploads/`. Everything else regenerates from them. Recommended: nightly `sqlite3 portfolio.db ".backup …"` + rsync of `uploads/`.

## Branches

- `main` — pure static; deploys anywhere.
- `cms` — this branch; CMS-driven static publisher.

The two stay visually identical: the CMS regenerates HTML that should be pixel-equivalent to `main`.
