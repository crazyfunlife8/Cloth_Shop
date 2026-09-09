'use strict';

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(env), 'Content-Type': 'application/json' },
  });
}

function genOrderNo() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${d}-${r}`;
}

// ──────────────────────────────────────────────
//  Route handlers
// ──────────────────────────────────────────────

/* GET /api/products
   ?cat=top   →  WHERE cat LIKE '%top%'
   ?q=關鍵字  →  WHERE name LIKE '%關鍵字%'              */
async function listProducts(url, env) {
  const cat = url.searchParams.get('cat');
  const q   = url.searchParams.get('q');

  let sql    = 'SELECT * FROM products WHERE active = 1';
  const params = [];

  if (cat && cat !== 'all') {
    sql += ' AND cat LIKE ?';
    params.push(`%${cat}%`);
  }
  if (q) {
    sql += ' AND name LIKE ?';
    params.push(`%${q}%`);
  }
  sql += ' ORDER BY sort_order DESC, created_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  // 把 JSON 字串欄位反序列化
  const products = results.map(parseProduct);
  return json({ ok: true, products }, 200, env);
}

/* GET /api/products/:id */
async function getProduct(id, env) {
  const row = await env.DB
    .prepare('SELECT * FROM products WHERE id = ? AND active = 1')
    .bind(id).first();
  if (!row) return json({ ok: false, error: '商品不存在' }, 404, env);
  return json({ ok: true, product: parseProduct(row) }, 200, env);
}

/* POST /api/orders */
async function createOrder(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: '請求格式錯誤' }, 400, env); }

  const { name, phone, email = '', address, items, note = '' } = body;

  if (!name || !phone || !address || !Array.isArray(items) || !items.length)
    return json({ ok: false, error: '請填寫姓名、電話、地址，並確認購物車不為空' }, 400, env);

  const subtotal     = items.reduce((s, i) => s + (i.price * i.qty), 0);
  const shipping_fee = subtotal >= 5000 ? 0 : 60;
  const total        = subtotal + shipping_fee;
  const order_no     = genOrderNo();

  await env.DB.prepare(`
    INSERT INTO orders
      (order_no, name, phone, email, address, items, subtotal, shipping_fee, total, note)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(order_no, name, phone, email, address,
          JSON.stringify(items), subtotal, shipping_fee, total, note).run();

  return json({ ok: true, order_no, subtotal, shipping_fee, total }, 200, env);
}

/* GET /api/orders?phone=09xx  — 會員查自己的訂單 */
async function listOrdersByPhone(url, env) {
  const phone = url.searchParams.get('phone');
  if (!phone) return json({ ok: false, error: '請提供手機號碼' }, 400, env);
  const { results } = await env.DB
    .prepare('SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC LIMIT 50')
    .bind(phone).all();
  const orders = results.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  return json({ ok: true, orders }, 200, env);
}

/* GET /api/orders/:no */
async function getOrder(no, env) {
  const row = await env.DB
    .prepare('SELECT * FROM orders WHERE order_no = ?')
    .bind(no).first();
  if (!row) return json({ ok: false, error: '訂單不存在' }, 404, env);
  const order = { ...row, items: JSON.parse(row.items || '[]') };
  return json({ ok: true, order }, 200, env);
}

// ── 圖片代理（從 R2 取圖）──
async function serveImage(key, env) {
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not Found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type':  obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}

// ──────────────────────────────────────────────
//  LINE Login OAuth handlers
// ──────────────────────────────────────────────

/* GET /api/auth/login  → 302 redirect 到 LINE 授權頁 */
function authLogin(env) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     env.LINE_CHANNEL_ID,
    redirect_uri:  env.LINE_CALLBACK_URL,
    state:         crypto.randomUUID(),
    scope:         'profile openid email',
  });
  return Response.redirect(
    `https://access.line.me/oauth2/v2.1/authorize?${params}`, 302
  );
}

/* GET /api/auth/callback?code=…&state=… */
async function authCallback(url, env) {
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(`${env.FRONTEND_URL}/account.html?err=denied`, 302);

  // 1. 換 access token
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  env.LINE_CALLBACK_URL,
      client_id:     env.LINE_CHANNEL_ID,
      client_secret: env.LINE_CHANNEL_SECRET,
    }),
  });
  const token = await tokenRes.json();
  if (!token.access_token) return Response.redirect(`${env.FRONTEND_URL}/account.html?err=token`, 302);

  // 2. 取 profile
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = await profileRes.json();

  // 3. upsert member
  await env.DB.prepare(`
    INSERT INTO members (line_uid, display_name, picture_url)
      VALUES (?, ?, ?)
    ON CONFLICT(line_uid) DO UPDATE SET
      display_name = excluded.display_name,
      picture_url  = excluded.picture_url,
      last_login   = datetime('now','localtime')
  `).bind(profile.userId, profile.displayName, profile.pictureUrl || '').run();

  // 4. 建立 session（存 KV，TTL 7天）
  const sessionId = crypto.randomUUID();
  await env.SESSIONS.put(sessionId, JSON.stringify({
    line_uid:     profile.userId,
    display_name: profile.displayName,
    picture_url:  profile.pictureUrl || '',
  }), { expirationTtl: 60 * 60 * 24 * 7 });

  // 5. 設 cookie 後跳回前端
  return new Response(null, {
    status: 302,
    headers: {
      Location:   `${env.FRONTEND_URL}/account.html`,
      'Set-Cookie': `sid=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24*7}`,
    },
  });
}

/* GET /api/auth/me — 回傳目前登入會員 */
async function authMe(request, env) {
  const sid = getCookie(request, 'sid');
  if (!sid) return json({ ok: false, member: null }, 200, env);
  const data = await env.SESSIONS.get(sid);
  if (!data) return json({ ok: false, member: null }, 200, env);
  return json({ ok: true, member: JSON.parse(data) }, 200, env);
}

/* POST /api/auth/logout */
async function authLogout(request, env) {
  const sid = getCookie(request, 'sid');
  if (sid) await env.SESSIONS.delete(sid);
  return new Response(null, {
    status: 302,
    headers: {
      Location:   `${env.FRONTEND_URL}/account.html`,
      'Set-Cookie': `sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

/* GET /api/members/:uid/orders  — 查詢會員歷史訂單 */
async function memberOrders(uid, request, env) {
  const sid = getCookie(request, 'sid');
  if (!sid) return json({ ok: false, error: '請先登入' }, 401, env);
  const session = await env.SESSIONS.get(sid);
  if (!session || JSON.parse(session).line_uid !== uid)
    return json({ ok: false, error: '無權限' }, 403, env);

  // orders 沒有 line_uid 欄位（訪客也能下單），只能用 phone 對比
  // 這裡回傳空陣列占位，未來可加 member_uid 到 orders table
  return json({ ok: true, orders: [] }, 200, env);
}

// ──────────────────────────────────────────────
//  Admin handlers（Cloudflare Access 保護）
// ──────────────────────────────────────────────

/* GET /api/admin/orders?status=pending */
async function adminListOrders(url, env) {
  const status = url.searchParams.get('status');
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  const orders = results.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  return json({ ok: true, orders }, 200, env);
}

/* PUT /api/admin/orders/:no  body: { status } */
async function adminUpdateOrder(no, request, env) {
  const { status } = await request.json();
  const VALID = ['pending', 'paid', 'shipped', 'done', 'cancelled'];
  if (!VALID.includes(status))
    return json({ ok: false, error: '無效的訂單狀態' }, 400, env);
  const info = await env.DB
    .prepare('UPDATE orders SET status = ? WHERE order_no = ?')
    .bind(status, no).run();
  if (!info.meta.changes) return json({ ok: false, error: '訂單不存在' }, 404, env);
  return json({ ok: true }, 200, env);
}

/* GET /api/admin/products （含下架商品）*/
async function adminListProducts(env) {
  const { results } = await env.DB
    .prepare('SELECT * FROM products ORDER BY sort_order DESC, created_at DESC')
    .all();
  return json({ ok: true, products: results.map(parseProduct) }, 200, env);
}

/* POST /api/admin/products */
async function adminCreateProduct(request, env) {
  const body = await request.json();
  const { name, description = '', price, original_price,
          images = [], cat = '', colors = [], sizes = [],
          badge = '', sort_order = 0 } = body;

  if (!name || !price)
    return json({ ok: false, error: '商品名稱和售價為必填' }, 400, env);

  const result = await env.DB.prepare(`
    INSERT INTO products
      (name, description, price, original_price, images, cat, colors, sizes, badge, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(name, description, price, original_price ?? null,
          JSON.stringify(images), cat,
          JSON.stringify(colors), JSON.stringify(sizes),
          badge, sort_order).run();

  return json({ ok: true, id: result.meta.last_row_id }, 200, env);
}

/* PUT /api/admin/products/:id */
async function adminUpdateProduct(id, request, env) {
  const body = await request.json();
  const { name, description = '', price, original_price,
          images = [], cat = '', colors = [], sizes = [],
          badge = '', active = 1, sort_order = 0 } = body;

  const info = await env.DB.prepare(`
    UPDATE products
    SET name=?, description=?, price=?, original_price=?,
        images=?, cat=?, colors=?, sizes=?, badge=?, active=?, sort_order=?
    WHERE id=?
  `).bind(name, description, price, original_price ?? null,
          JSON.stringify(images), cat,
          JSON.stringify(colors), JSON.stringify(sizes),
          badge, active, sort_order, id).run();

  if (!info.meta.changes) return json({ ok: false, error: '商品不存在' }, 404, env);
  return json({ ok: true }, 200, env);
}

/* POST /api/admin/upload  (multipart/form-data, field: file) */
async function adminUpload(request, env) {
  let formData;
  try { formData = await request.formData(); }
  catch { return json({ ok: false, error: '請用 multipart/form-data 上傳' }, 400, env); }

  const file = formData.get('file');
  if (!file || typeof file === 'string')
    return json({ ok: false, error: '找不到 file 欄位' }, 400, env);

  const ext  = (file.name || 'img').split('.').pop().toLowerCase();
  const key  = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  // 圖片 URL：透過 Worker /images/:key 代理，或 R2 public URL
  const url = `${env.R2_PUBLIC_URL || ''}/images/${key}`;
  return json({ ok: true, key, url }, 200, env);
}

// ──────────────────────────────────────────────
//  JSON field parser
// ──────────────────────────────────────────────
function parseProduct(row) {
  return {
    ...row,
    images: JSON.parse(row.images || '[]'),
    colors: JSON.parse(row.colors || '[]'),
    sizes:  JSON.parse(row.sizes  || '[]'),
  };
}

// ──────────────────────────────────────────────
//  Main router
// ──────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      // ── 圖片代理 ──
      if (method === 'GET' && path.startsWith('/images/')) {
        return serveImage(path.slice(8), env);
      }

      // ── 公開 API ──
      if (method === 'GET'  && path === '/api/products')
        return listProducts(url, env);

      if (method === 'GET'  && /^\/api\/products\/\d+$/.test(path))
        return getProduct(path.split('/').pop(), env);

      if (method === 'POST' && path === '/api/orders')
        return createOrder(request, env);

      if (method === 'GET'  && /^\/api\/orders\/ORD-/.test(path))
        return getOrder(path.split('/').pop(), env);

      if (method === 'GET'  && path === '/api/orders')
        return listOrdersByPhone(url, env);

      // ── LINE Login ──
      if (method === 'GET'  && path === '/api/auth/login')
        return authLogin(env);

      if (method === 'GET'  && path === '/api/auth/callback')
        return authCallback(url, env);

      if (method === 'GET'  && path === '/api/auth/me')
        return authMe(request, env);

      if (method === 'POST' && path === '/api/auth/logout')
        return authLogout(request, env);

      if (method === 'GET'  && /^\/api\/members\/[^/]+\/orders$/.test(path)) {
        const uid = path.split('/')[3];
        return memberOrders(uid, request, env);
      }

      // ── 後台 API（Cloudflare Access 擋在前面）──
      if (path.startsWith('/api/admin')) {
        if (method === 'GET'  && path === '/api/admin/orders')
          return adminListOrders(url, env);

        if (method === 'PUT'  && /^\/api\/admin\/orders\/ORD-/.test(path))
          return adminUpdateOrder(path.split('/').pop(), request, env);

        if (method === 'GET'  && path === '/api/admin/products')
          return adminListProducts(env);

        if (method === 'POST' && path === '/api/admin/products')
          return adminCreateProduct(request, env);

        if (method === 'PUT'  && /^\/api\/admin\/products\/\d+$/.test(path))
          return adminUpdateProduct(path.split('/').pop(), request, env);

        if (method === 'POST' && path === '/api/admin/upload')
          return adminUpload(request, env);
      }

      return json({ ok: false, error: 'Not found' }, 404, env);

    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'Server error' }, 500, env);
    }
  },
};
