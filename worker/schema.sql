-- 執行方式：wrangler d1 execute brand-store --file=schema.sql

CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  price          INTEGER NOT NULL,
  original_price INTEGER,
  images         TEXT    NOT NULL DEFAULT '[]',  -- JSON string[]（R2 key 陣列）
  cat            TEXT    NOT NULL DEFAULT '',    -- e.g. "new top tshirt"
  colors         TEXT    NOT NULL DEFAULT '[]',  -- JSON string[]
  sizes          TEXT    NOT NULL DEFAULT '[]',  -- JSON string[]
  badge          TEXT    NOT NULL DEFAULT '',    -- "new" | "hot" | ""
  active         INTEGER NOT NULL DEFAULT 1,     -- 1=上架 0=下架
  sort_order     INTEGER NOT NULL DEFAULT 0,     -- 數字越大越前面
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no     TEXT    NOT NULL UNIQUE,           -- ORD-20260908-XXXX
  name         TEXT    NOT NULL,
  phone        TEXT    NOT NULL,
  email        TEXT    NOT NULL DEFAULT '',
  address      TEXT    NOT NULL,
  items        TEXT    NOT NULL,                  -- JSON 購物車快照
  subtotal     INTEGER NOT NULL,
  shipping_fee INTEGER NOT NULL DEFAULT 60,
  total        INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending', -- pending|paid|shipped|done|cancelled
  note         TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_products_active
  ON products (active, sort_order DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_no
  ON orders (order_no);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  line_uid     TEXT    NOT NULL UNIQUE,   -- LINE userId（U開頭）
  display_name TEXT    NOT NULL DEFAULT '',
  picture_url  TEXT    NOT NULL DEFAULT '',
  email        TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  last_login   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_members_line_uid
  ON members (line_uid);
