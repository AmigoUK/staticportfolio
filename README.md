# staticportfolio (cms branch)

SQLite-backed CMS that publishes a static portfolio site.

The public site stays static — Apache serves regenerated HTML from
`public/` — and a Fastify admin app behind `/admin/` handles editing,
theming, fonts, media, and (when the TipTap editors land) the rich
text editor. The static-only variant lives on the `main` branch
(tag `v1-static`); the two stay visually equivalent.

## Quick start

Requires Node 20.11+ and Apache 2.4 with `mod_proxy_http` enabled.

```sh
cp .env.example .env
# edit .env: set SESSION_SECRET to a long random hex string
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm install
npm run create-admin     # interactive: pick a username + a 12+ char password
npm run dev              # starts Fastify on 127.0.0.1:3000

# In another terminal, populate the DB from the legacy HTML and publish:
npm run seed
npm run publish
```

Visit `http://127.0.0.1:3000/admin/login` to sign in. Visit
`http://127.0.0.1:3000/` to see the regenerated public site (Fastify
also serves `public/` in dev).

## Production setup

Two long-running pieces: Apache 2.4 (or any static webserver) serving
`public/`, and the Node admin behind a reverse proxy.

1. **Apache**. Enable `mod_proxy_http` and add the snippet from
   `deploy/apache-staticportfolio.conf` to your vhost (or include the
   file). It proxies `/staticportfolio/admin/*` to `127.0.0.1:3000` and
   serves the rest from `public/`. Two layouts are shown — pick the one
   that matches your install.

   ```sh
   sudo a2enmod proxy proxy_http headers
   sudo systemctl reload apache2
   ```

2. **systemd unit**. Copy `deploy/portfolio-cms.service` to
   `/etc/systemd/system/` and enable it. Adjust `User`, `Group`, and
   `WorkingDirectory` for your install.

   ```sh
   sudo cp deploy/portfolio-cms.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now portfolio-cms
   sudo systemctl status portfolio-cms
   ```

3. **Set the cookie flag** in `.env` once you're behind HTTPS:
   `COOKIE_SECURE=1`.

4. **First-run import** (optional — only if you have legacy HTML):
   ```sh
   sudo -u www-data npm run seed
   sudo -u www-data npm run publish
   ```

## Operations

### Common tasks

| Task | Command |
| --- | --- |
| Create the admin user | `npm run create-admin` |
| Change the admin password | `npm run reset-password` |
| Import content from legacy HTML | `npm run seed` |
| Regenerate `public/` from DB | `npm run publish` (or click *Publish* in the admin) |
| Run tests | `npm test` |
| Start dev server | `npm run dev` |
| Restart in production | `sudo systemctl restart portfolio-cms` |
| Tail production logs | `journalctl -u portfolio-cms -f` |

### Backup

Two paths are precious: `data/portfolio.db` and `uploads/`. Everything
else regenerates from them. `scripts/backup.js` takes a hot snapshot
of the DB via SQLite's online-backup API (no app downtime) and rsyncs
the uploads dir to `/var/backups/portfolio-cms/`. Retention defaults
to 14 days, pruned on each run.

```sh
# One-off manual backup
npm run backup
ls /var/backups/portfolio-cms/

# Scheduled daily via systemd timer (already installed in production):
sudo cp deploy/portfolio-cms-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio-cms-backup.timer
systemctl list-timers portfolio-cms-backup --no-pager
journalctl -u portfolio-cms-backup -n 30 --no-pager

# Restore
sudo systemctl stop portfolio-cms
cp /var/backups/portfolio-cms/portfolio-YYYY-MM-DD.db data/portfolio.db
rsync -a --delete /var/backups/portfolio-cms/uploads/ uploads/
sudo systemctl start portfolio-cms
npm run publish
```

Override via env: `BACKUP_DIR`, `RETAIN_DAYS`.

### Health check

```sh
curl -s http://127.0.0.1:3000/healthz   # {"ok":true}
curl -sI http://127.0.0.1:3000/admin/login   # 200
```

## What's in the repo

```
app/               Fastify backend (routes, services, templates, lib)
source-assets/     Canonical CSS, JS, and WOFF2 fonts copied into public/
seed/              One-time importer + legacy/ snapshot of the main branch
scripts/           CLIs: create-admin, reset-password, publish
deploy/            Apache config + systemd unit
data/              SQLite DB (gitignored)
uploads/           Raw uploaded media (gitignored)
public/            Regenerated static site (gitignored)
```

## What's done, what's pending

| Feature | Status |
| --- | --- |
| Single-admin auth, bcrypt-12, signed cookie session | ✓ |
| CSRF on all authenticated POSTs | ✓ |
| Theme editor with 5 presets, clone-and-edit | ✓ |
| Typography picker (6 bundled WOFF2 families + 2 system stacks) | ✓ |
| Site settings (title, social links, contact) | ✓ |
| Publish pipeline → atomic regen of `public/` | ✓ |
| Seed-from-static one-time importer | ✓ |
| Apache reverse-proxy + systemd unit | ✓ |
| Media library (uploads, sharp re-encode, alt text) | pending |
| TipTap rich-text editor for pages / work / writing | pending |

## Branches

- `main` — pure static; deploys anywhere. Tag `v1-static` marks the
  final state.
- `cms` — this branch.

## License

Code: MIT. Bundled fonts: each is SIL OFL 1.1 — see
`source-assets/fonts/LICENSES/README.md`.
