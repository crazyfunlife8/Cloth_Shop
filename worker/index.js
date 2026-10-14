'use strict';

// ──────────────────────────────────────────────
//  MD5（Cloudflare Workers 無原生 MD5，純 JS 實作）
// ──────────────────────────────────────────────
function md5hex(str) {
  const K = [], S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  for (let i = 0; i < 64; i++) K[i] = (Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const bytes = new TextEncoder().encode(str);
  const L = bytes.length, padLen = (L % 64 < 56 ? 56 - L % 64 : 120 - L % 64);
  const msg = new Uint8Array(L + padLen + 8);
  msg.set(bytes); msg[L] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(L + padLen, (L * 8) >>> 0, true);
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  for (let i = 0; i < msg.length; i += 64) {
    const M = Array.from({ length: 16 }, (_, j) => dv.getInt32(i + j * 4, true));
    let [A, B, C, D] = [a, b, c, d];
    for (let j = 0; j < 64; j++) {
      let F, g;
      if      (j < 16) { F = (B & C) | (~B & D); g = j; }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
      else if (j < 48) { F = B ^ C ^ D;           g = (3 * j + 5) % 16; }
      else             { F = C ^ (B | ~D);         g = (7 * j)     % 16; }
      const tmp = D; D = C; C = B;
      const s = (F + A + K[j] + M[g]) | 0;
      B = (B + ((s << S[j]) | (s >>> (32 - S[j])))) | 0; A = tmp;
    }
    a = (a + A) | 0; b = (b + B) | 0; c = (c + C) | 0; d = (d + D) | 0;
  }
  return [a, b, c, d].map(n => {
    const v = new DataView(new ArrayBuffer(4)); v.setInt32(0, n, true);
    return [...new Uint8Array(v.buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
  }).join('');
}

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin':      env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods':     'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
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

function maskEmail(email) {
  const [local] = (email || '').split('@');
  if (!local) return '***';
  if (local.length <= 2) return local + '***';
  if (local.length <= 4) return local[0] + '**' + local[local.length - 1];
  return local.slice(0, 2) + '*'.repeat(local.length - 4) + local.slice(-2);
}

const SENSITIVE_WORDS = [
  '幹你', '操你', '婊子', '賤人', '妓女', '雞巴', '屌你', '王八蛋',
  '混蛋', '去死', '廢物', 'fuck', 'shit', 'bitch',
  'bastard', 'slut', 'whore','賤','垃圾',
];

function hasSensitiveWord(text) {
  const t = text.toLowerCase();
  return SENSITIVE_WORDS.some(w => t.includes(w.toLowerCase()));
}

/* GET /api/stores?brand=711|family&q=keyword — 超商門市搜尋（Proxy 避免 CORS） */
async function searchStores(url, env) {
  const brand = url.searchParams.get('brand');
  const q = (url.searchParams.get('q') || '').trim();
  if (!q || q.length < 2) return json({ ok: true, stores: [] }, 200, env);

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // 從 XML 字串提取所有 <tag>value</tag>
  function xmlAll(xml, tag) {
    const re = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'g');
    const out = []; let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
    return out;
  }

  try {
    if (brand === '711') {
      // 統一超商 emap API（回傳 XML，標籤為 POIName / Address / POIID）
      const apiUrl = `https://emap.pcsc.com.tw/EMapSDK.aspx?commandid=SearchStore&SearchType=S&StoreName=${encodeURIComponent(q)}&slngx=&slaty=&City=&Town=&Road=&Sect=&Lane=&Alley=&Street=&Place=&StoreType=&CategoryType=&isInstore=0&24Hours=&foodtype=&Latitude=&Longitude=`;
      const res  = await fetch(apiUrl, { headers: { 'User-Agent': ua, 'Referer': 'https://emap.pcsc.com.tw/' } });
      const xml  = await res.text();
      const names  = xmlAll(xml, 'POIName');
      const addrs  = xmlAll(xml, 'Address');
      const ids    = xmlAll(xml, 'POIID');
      const stores = names.slice(0, 20).map((name, i) => ({
        name, address: addrs[i] || '', code: (ids[i] || '').trim(),
      })).filter(s => s.name);
      return json({ ok: true, stores }, 200, env);
    }

    if (brand === 'family') {
      // 全家目前無可靠公開 API，回傳 manual 旗標讓前端降級為手動輸入
      return json({ ok: true, stores: [], manual: true }, 200, env);
    }

    return json({ ok: false, error: '不支援的超商品牌' }, 400, env);
  } catch (err) {
    return json({ ok: false, error: `門市查詢失敗：${err.message}` }, 500, env);
  }
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

/* GET /api/products/:id  — 支援數字 id 或貨號格式（如 A010） */
async function getProduct(id, env) {
  let row;
  if (/^[A-Za-z]\d+$/.test(id)) {
    const letter = id[0].toUpperCase();
    const num    = parseInt(id.slice(1), 10);
    row = await env.DB
      .prepare('SELECT * FROM products WHERE item_letter = ? AND sort_order = ? AND active = 1')
      .bind(letter, num).first();
  } else {
    row = await env.DB
      .prepare('SELECT * FROM products WHERE id = ? AND active = 1')
      .bind(id).first();
  }
  if (!row) return json({ ok: false, error: '商品不存在' }, 404, env);
  return json({ ok: true, product: parseProduct(row) }, 200, env);
}

/* POST /api/orders */
async function createOrder(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: '請求格式錯誤' }, 400, env); }

  const { name, phone, email = '', address, items, note = '', shipping_method = 'cvs', payment_method = '' } = body;

  if (!name || !phone || !address || !Array.isArray(items) || !items.length)
    return json({ ok: false, error: '請填寫姓名、電話、地址，並確認購物車不為空' }, 400, env);

  const subtotal     = items.reduce((s, i) => s + (i.price * i.qty), 0);
  const shipping_fee = subtotal >= 5000 ? 0 : (shipping_method === 'home' ? 100 : 60);
  const total        = subtotal + shipping_fee;
  const order_no     = genOrderNo();

  await env.DB.prepare(`
    INSERT INTO orders
      (order_no, name, phone, email, address, items, subtotal, shipping_fee, total, note, shipping_method, payment_method)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(order_no, name, phone, email, address,
          JSON.stringify(items), subtotal, shipping_fee, total, note, shipping_method, payment_method).run();

  // 自動建立／更新會員（以 email 為唯一識別）
  let new_member = false;
  if (email) {
    try {
      const existing = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
      new_member = !existing;
      await env.DB.prepare(`
        INSERT INTO members (email, name, phone) VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          name     = CASE WHEN excluded.name  != '' THEN excluded.name  ELSE members.name  END,
          phone    = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE members.phone END,
          updated_at = datetime('now')
      `).bind(email, name, phone).run();
    } catch (e) {
      console.error('[member upsert]', e.message);
    }
  }

  return json({ ok: true, order_no, subtotal, shipping_fee, total, new_member }, 200, env);
}

/* POST /api/payment/initiate — 建立 Gomypay 付款連結 */
async function paymentInitiate(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: '請求格式錯誤' }, 400, env); }

  const { order_no, payment_type } = body;
  if (!order_no || !payment_type)
    return json({ ok: false, error: '缺少必要參數' }, 400, env);

  const order = await env.DB
    .prepare('SELECT * FROM orders WHERE order_no = ?')
    .bind(order_no).first();
  if (!order) return json({ ok: false, error: '訂單不存在' }, 404, env);

  const SEND_TYPE = { credit: '0', webatm: '3', virtual: '4', barcode: '2', code: '6' };
  const sendType = SEND_TYPE[payment_type];
  if (!sendType) return json({ ok: false, error: '無效的付款方式' }, 400, env);

  const items = JSON.parse(order.items || '[]');
  const memo  = items.map(i => `${i.name}×${i.qty}`).join('、').slice(0, 490) || '𝑩𝒂𝒊𝑩𝒂𝒊 𝑺𝒕𝒐𝒓𝒆 ღ 訂單';

  const GOMYPAY_URL = 'https://n.gomypay.asia/TestShuntClass.aspx';
  const frontendUrl = (env.ALLOWED_ORIGIN || 'https://cloth.nestdigitalai.com').replace(/\*$/, '').replace(/,$/, '');
  const workerUrl   = 'https://brand-api.crazyfunlife8.workers.dev';

  const params = new URLSearchParams({
    Send_Type:    sendType,
    Pay_Mode_No:  '2',
    CustomerId:   env.CustomerId,
    Order_No:     order_no,
    Amount:       String(order.total),
    TransCode:    '00',
    Buyer_Name:   order.name,
    Buyer_Telm:   order.phone,
    Buyer_Memo:   memo,
    Return_url:   `${frontendUrl}/order.html`,
    Callback_Url: `${workerUrl}/api/payment/callback`,
  });
  if (order.email) params.set('Buyer_Mail', order.email);
  if (sendType === '0') { params.set('TransMode', '1'); params.set('Installment', '0'); }
  if (sendType === '2' || sendType === '6') params.set('StoreType', '3'); // 3 = 7-ELEVEN

  return json({ ok: true, redirect_url: `${GOMYPAY_URL}?${params}` }, 200, env);
}

/* POST /api/payment/callback — Gomypay 背景對帳回傳 */
async function paymentCallback(request, env) {
  let params;
  try {
    const text = await request.text();
    params = new URLSearchParams(text);
  } catch {
    return new Response('ERROR', { status: 400 });
  }

  const result     = params.get('result');
  const e_orderno  = params.get('e_orderno');
  const PayAmount  = params.get('PayAmount') || params.get('e_money') || '';
  const OrderID    = params.get('OrderID')   || '';
  const str_check  = params.get('str_check') || '';

  if (!e_orderno) return new Response('OK', { status: 200 });

  // MD5 驗證：CustomerId 明碼優先用 GOMYPAY_PLAIN_ID，fallback 到 CustomerId
  const plainId = env.GOMYPAY_PLAIN_ID || env.CustomerId || '';
  if (plainId && env.Str_Check && str_check) {
    const expected = md5hex(`${result}${e_orderno}${plainId}${PayAmount}${OrderID}${env.Str_Check}`);
    if (expected.toLowerCase() !== str_check.toLowerCase()) {
      console.error('[callback] str_check mismatch', { expected, received: str_check });
      return new Response('INVALID', { status: 400 });
    }
  } else if (!plainId || !env.Str_Check) {
    // secret 未設定時，記錄警告但仍繼續（避免阻斷測試環境）
    console.warn('[callback] str_check 驗證跳過：GOMYPAY_PLAIN_ID 或 Str_Check 未設定');
  }

  if (result === '1') {
    await env.DB
      .prepare("UPDATE orders SET status = 'paid' WHERE order_no = ? AND status = 'pending'")
      .bind(e_orderno).run();
    // 儲存付款資訊（CVS代碼的PinCode、虛擬帳戶的e_payaccount/LimitDate）
    const pinCodeVal = params.get('PinCode')       || '';
    const payAcct    = params.get('e_payaccount')  || '';
    const limitDt    = params.get('LimitDate')     || '';
    if (pinCodeVal || payAcct || limitDt) {
      await env.DB
        .prepare('UPDATE orders SET pin_code=?, pay_account=?, limit_date=? WHERE order_no=?')
        .bind(pinCodeVal, payAcct, limitDt, e_orderno).run();
    }
  }

  return new Response('OK', { status: 200 });
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

/* PATCH /api/orders/:no/payment-info  — 前端跳轉後儲存付款資訊 */
async function savePaymentInfo(no, request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: '請求格式錯誤' }, 400, env); }
  const { pin_code = '', pay_account = '', limit_date = '' } = body;
  const info = await env.DB
    .prepare('UPDATE orders SET pin_code=?, pay_account=?, limit_date=? WHERE order_no=?')
    .bind(pin_code, pay_account, limit_date, no).run();
  if (!info.meta.changes) return json({ ok: false, error: '訂單不存在' }, 404, env);
  return json({ ok: true }, 200, env);
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
//  Reviews
// ──────────────────────────────────────────────

/* GET /api/reviews?product_id=xxx */
async function getReviews(url, env) {
  const productId = url.searchParams.get('product_id');
  if (!productId) return json({ ok: false, error: '缺少 product_id' }, 400, env);
  const { results } = await env.DB.prepare(
    'SELECT id, email, rating, body, size_bought, created_at FROM reviews WHERE product_id = ? AND hidden = 0 ORDER BY created_at DESC'
  ).bind(productId).all();
  const reviews = results.map(r => ({ ...r, email: maskEmail(r.email) }));
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  return json({ ok: true, avg: Math.round(avg * 10) / 10, count: reviews.length, reviews }, 200, env);
}

/* POST /api/reviews */
async function createReview(request, env) {
  let payload;
  try { payload = await request.json(); } catch { return json({ ok: false, error: '格式錯誤' }, 400, env); }
  const { product_id, order_no, email, rating, body: reviewBody, size_bought } = payload || {};
  if (!product_id || !order_no || !email || !rating || !reviewBody)
    return json({ ok: false, error: '請填寫所有必填欄位' }, 400, env);
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5)
    return json({ ok: false, error: '評分需在 1–5 之間' }, 400, env);
  const text = String(reviewBody).trim();
  if (text.length < 10 || text.length > 300)
    return json({ ok: false, error: '評論字數需在 10–300 字之間' }, 400, env);
  if (hasSensitiveWord(text))
    return json({ ok: false, error: '評論內容包含不當文字，請修改後重新提交' }, 400, env);
  const normEmail   = String(email).trim().toLowerCase();
  const normOrderNo = String(order_no).trim().toUpperCase();
  const order = await env.DB.prepare('SELECT items FROM orders WHERE order_no = ? AND email = ?')
    .bind(normOrderNo, normEmail).first();
  if (!order) return json({ ok: false, error: '查無此訂單，請確認訂單編號與信箱是否正確' }, 400, env);
  let items = [];
  try { items = JSON.parse(order.items || '[]'); } catch {}
  if (!items.some(item => String(item.id) === String(product_id)))
    return json({ ok: false, error: '此訂單未包含該商品' }, 400, env);
  await env.DB.prepare(
    `INSERT INTO reviews (product_id, order_no, email, rating, body, size_bought)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(product_id, email) DO UPDATE SET
       rating = excluded.rating, body = excluded.body,
       size_bought = excluded.size_bought, order_no = excluded.order_no,
       created_at = datetime('now')`
  ).bind(Number(product_id), normOrderNo, normEmail, r, text, size_bought || null).run();
  return json({ ok: true }, 200, env);
}

/* GET /api/admin/reviews?page=1 */
async function adminListReviews(url, env) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const PAGE = 20;
  const offset = (page - 1) * PAGE;
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.product_id, p.name as product_name, r.email, r.rating,
            r.body, r.size_bought, r.hidden, r.created_at
     FROM reviews r LEFT JOIN products p ON r.product_id = p.id
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
  ).bind(PAGE + 1, offset).all();
  const hasMore = results.length > PAGE;
  return json({ ok: true, reviews: results.slice(0, PAGE), hasMore, page }, 200, env);
}

/* DELETE /api/admin/reviews/:id */
async function adminDeleteReview(id, env) {
  const row = await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(Number(id)).first();
  if (!row) return json({ ok: false, error: '評論不存在' }, 404, env);
  await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(Number(id)).run();
  return json({ ok: true }, 200, env);
}

/* PATCH /api/admin/reviews/:id — toggle hidden */
async function adminToggleReview(id, env) {
  const row = await env.DB.prepare('SELECT hidden FROM reviews WHERE id = ?').bind(Number(id)).first();
  if (!row) return json({ ok: false, error: '評論不存在' }, 404, env);
  const newHidden = row.hidden ? 0 : 1;
  await env.DB.prepare('UPDATE reviews SET hidden = ? WHERE id = ?').bind(newHidden, Number(id)).run();
  return json({ ok: true, hidden: !!newHidden }, 200, env);
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

/* DELETE /api/admin/orders/:no */
async function adminDeleteOrder(no, env) {
  const info = await env.DB
    .prepare('DELETE FROM orders WHERE order_no = ?')
    .bind(no).run();
  if (!info.meta.changes) return json({ ok: false, error: '訂單不存在' }, 404, env);
  return json({ ok: true }, 200, env);
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
          badge = '', sort_order = 0, item_letter = '' } = body;

  if (!name || !price)
    return json({ ok: false, error: '商品名稱和售價為必填' }, 400, env);

  const result = await env.DB.prepare(`
    INSERT INTO products
      (name, description, price, original_price, images, cat, colors, sizes, badge, sort_order, item_letter)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(name, description, price, original_price ?? null,
          JSON.stringify(images), cat,
          JSON.stringify(colors), JSON.stringify(sizes),
          badge, sort_order, item_letter).run();

  return json({ ok: true, id: result.meta.last_row_id }, 200, env);
}

/* PUT /api/admin/products/:id */
async function adminUpdateProduct(id, request, env) {
  const body = await request.json();
  const { name, description = '', price, original_price,
          images = [], cat = '', colors = [], sizes = [],
          badge = '', active = 1, sort_order = 0, item_letter = '' } = body;

  const info = await env.DB.prepare(`
    UPDATE products
    SET name=?, description=?, price=?, original_price=?,
        images=?, cat=?, colors=?, sizes=?, badge=?, active=?, sort_order=?, item_letter=?
    WHERE id=?
  `).bind(name, description, price, original_price ?? null,
          JSON.stringify(images), cat,
          JSON.stringify(colors), JSON.stringify(sizes),
          badge, active, sort_order, item_letter, id).run();

  if (!info.meta.changes) return json({ ok: false, error: '商品不存在' }, 404, env);
  return json({ ok: true }, 200, env);
}

/* DELETE /api/admin/products/:id */
async function adminDeleteProduct(id, env) {
  const info = await env.DB
    .prepare('DELETE FROM products WHERE id = ?')
    .bind(id).run();
  if (!info.meta.changes) return json({ ok: false, error: '商品不存在' }, 404, env);
  return json({ ok: true }, 200, env);
}

/* GET /api/members/me?email=xxx — 前台會員自助查詢 */
async function getMemberByEmail(url, env) {
  const email = url.searchParams.get('email')?.trim().toLowerCase();
  if (!email) return json({ ok: false, error: '請提供信箱' }, 400, env);

  const member = await env.DB
    .prepare('SELECT id, email, name, phone, created_at FROM members WHERE email = ?')
    .bind(email).first();
  if (!member) return json({ ok: false, error: '此信箱尚未加入會員' }, 404, env);

  const { results } = await env.DB
    .prepare('SELECT * FROM orders WHERE email = ? ORDER BY created_at DESC LIMIT 50')
    .bind(email).all();
  const orders = results.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));

  return json({ ok: true, member, orders }, 200, env);
}

/* GET /api/admin/members */
async function adminListMembers(env) {
  const rows = await env.DB.prepare(`
    SELECT m.id, m.email, m.name, m.phone, m.created_at,
           COUNT(o.id)              AS order_count,
           COALESCE(SUM(o.total),0) AS total_spent,
           MAX(o.created_at)        AS last_order_at
    FROM members m
    LEFT JOIN orders o ON o.email = m.email
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `).all();
  return json({ ok: true, members: rows.results }, 200, env);
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
/* Cron：依付款方式取消過期未付款訂單 */
async function cancelExpiredOrders(env) {
  // 超商代碼：3 小時有效，4 小時後取消
  const r1 = await env.DB
    .prepare("UPDATE orders SET status='cancelled' WHERE status='pending' AND payment_method='code' AND created_at < datetime('now','-4 hours')")
    .run();
  // 虛擬帳戶：3 天有效，3 天 1 小時後取消
  const r2 = await env.DB
    .prepare("UPDATE orders SET status='cancelled' WHERE status='pending' AND payment_method='virtual' AND created_at < datetime('now','-73 hours')")
    .run();
  console.log(`[cron] cancelled: code=${r1.meta.changes} virtual=${r2.meta.changes}`);
}

/* Cron：刪除 90 天前已完成或已取消的舊訂單 */
async function deleteOldOrders(env) {
  const r = await env.DB
    .prepare("DELETE FROM orders WHERE status IN ('completed','cancelled') AND created_at < datetime('now','-90 days')")
    .run();
  console.log(`[cron] deleted old orders: ${r.meta.changes}`);
}

// ──────────────────────────────────────────────
//  Main router
// ──────────────────────────────────────────────
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      Promise.all([cancelExpiredOrders(env), deleteOldOrders(env)])
    );
  },

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

      if (method === 'GET'  && /^\/api\/products\/([A-Za-z]\d+|\d+)$/.test(path))
        return getProduct(path.split('/').pop(), env);

      if (method === 'POST' && path === '/api/orders')
        return createOrder(request, env);

      if (method === 'GET'  && /^\/api\/orders\/ORD-/.test(path))
        return getOrder(path.split('/').pop(), env);

      if (method === 'PATCH' && /^\/api\/orders\/ORD-.+\/payment-info$/.test(path))
        return savePaymentInfo(path.split('/')[3], request, env);

      if (method === 'GET'  && path === '/api/orders')
        return listOrdersByPhone(url, env);

      if (method === 'GET'  && path === '/api/stores')
        return searchStores(url, env);

      if (method === 'GET'  && path === '/api/members/me')
        return getMemberByEmail(url, env);

      if (method === 'GET'  && path === '/api/reviews')
        return getReviews(url, env);

      if (method === 'POST' && path === '/api/reviews')
        return createReview(request, env);

      if (method === 'POST' && path === '/api/payment/initiate')
        return paymentInitiate(request, env);

      if (method === 'POST' && path === '/api/payment/callback')
        return paymentCallback(request, env);

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

        if (method === 'DELETE' && /^\/api\/admin\/orders\/ORD-/.test(path))
          return adminDeleteOrder(path.split('/').pop(), env);

        if (method === 'GET'  && path === '/api/admin/products')
          return adminListProducts(env);

        if (method === 'POST' && path === '/api/admin/products')
          return adminCreateProduct(request, env);

        if (method === 'PUT'  && /^\/api\/admin\/products\/\d+$/.test(path))
          return adminUpdateProduct(path.split('/').pop(), request, env);

        if (method === 'DELETE' && /^\/api\/admin\/products\/\d+$/.test(path))
          return adminDeleteProduct(path.split('/').pop(), env);

        if (method === 'POST' && path === '/api/admin/upload')
          return adminUpload(request, env);

        if (method === 'GET' && path === '/api/admin/members')
          return adminListMembers(env);

        if (method === 'GET'  && path === '/api/admin/reviews')
          return adminListReviews(url, env);

        if (method === 'PATCH' && /^\/api\/admin\/reviews\/\d+$/.test(path))
          return adminToggleReview(path.split('/').pop(), env);

        if (method === 'DELETE' && /^\/api\/admin\/reviews\/\d+$/.test(path))
          return adminDeleteReview(path.split('/').pop(), env);
      }

      return json({ ok: false, error: 'Not found' }, 404, env);

    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'Server error' }, 500, env);
    }
  },
};
