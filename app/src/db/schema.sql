-- Portfolio CMS schema. Applied once on first connect; idempotent via CREATE TABLE IF NOT EXISTS.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_preset INTEGER NOT NULL DEFAULT 0,
  tokens_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fonts (
  id INTEGER PRIMARY KEY,
  family TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('sans','mono','header')),
  weights_csv TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('bundled','system','custom')),
  files_json TEXT,
  fallback_stack TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(family, role)
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  meta_description TEXT,
  body_json TEXT NOT NULL,
  body_html TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER NOT NULL,
  alt TEXT,
  attribution_json TEXT,
  kind TEXT NOT NULL DEFAULT 'image',
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_entries (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kicker TEXT,
  eyebrow TEXT,
  lede TEXT,
  article_meta TEXT,
  body_json TEXT NOT NULL,
  body_html TEXT NOT NULL,
  cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  cover_filename TEXT,
  cover_alt TEXT,
  tags_csv TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_disabled INTEGER NOT NULL DEFAULT 0,
  meta_description TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  dek TEXT,
  body_json TEXT NOT NULL,
  body_html TEXT NOT NULL,
  meta_description TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publish_log (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_work_published_sort ON work_entries(published, sort_order);
CREATE INDEX IF NOT EXISTS idx_posts_published_date ON posts(published, published_at DESC);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  open_new_tab INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  parent_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_menu_visible_order ON menu_items(is_visible, sort_order);
