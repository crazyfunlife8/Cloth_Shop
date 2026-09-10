# 服飾站 系統架構與資料流文件

## 一、系統元件

| 元件 | 服務 | 網址 / 識別 |
|------|------|-------------|
| 前台 + 後台靜態頁面 | Cloudflare Pages | `https://cloth.nestdigitalai.com` |
| REST API | Cloudflare Worker | `https://brand-api.crazyfunlife8.workers.dev` |
| 資料庫 | Cloudflare D1 | `brand-store`（ID: b6d18650-...） |
| 圖片儲存 | Cloudflare R2 | `brand-images` |
| 管理員登入保護 | Cloudflare Access | Zero Trust，保護 `/admin/*` |
| 原始碼 | GitHub | `crazyfunlife8/Cloth_Shop`，`main` 分支 |

---

## 二、前台頁面與功能

| 頁面 | 路徑 | 功能 |
|------|------|------|
| 首頁 | `/index.html` | 商品列表（API 動態載入）、分類篩選、搜尋、購物車 |
| 商品詳情 | `/product.html?id=:id` | 商品圖片、顏色/尺寸選擇、加入購物車 |
| 結帳 | `/checkout.html` | 收件資訊表單、訂單摘要、送出訂單 |
| 訂單確認 | `/order.html?no=:no` | 顯示訂單資訊、LINE Pay QR Code |
| 訂單查詢 | `/account.html` | 以手機號碼或訂單編號查詢歷史訂單 |

---

## 三、後台頁面與功能

| 頁面 | 路徑 | 功能 |
|------|------|------|
| 商品管理 | `/admin/products.html` | 新增/編輯商品、上傳圖片、設定分類/價格/標籤 |
| 訂單管理 | `/admin/orders.html` | 查看所有訂單、更新訂單狀態 |

> 進入 `/admin/*` 前，Cloudflare Access 會要求輸入管理員 Email 驗證（One-time PIN）。

---

## 四、API 端點（Cloudflare Worker）

### 公開端點
| 方法 | 路徑 | 功能 | 呼叫方 |
|------|------|------|--------|
| GET | `/api/products` | 取得所有上架商品 | 首頁 |
| GET | `/api/products/:id` | 取得單一商品詳情 | 商品頁 |
| POST | `/api/orders` | 建立新訂單 | 結帳頁 |
| GET | `/api/orders/:no` | 以訂單編號查詢訂單 | 訂單確認頁、訂單查詢頁 |
| GET | `/api/orders?phone=` | 以手機號碼查詢訂單列表 | 訂單查詢頁 |
| GET | `/images/:key` | 代理 R2 圖片 | 所有顯示商品圖片的頁面 |

### 後台端點（需通過 Cloudflare Access）
| 方法 | 路徑 | 功能 | 呼叫方 |
|------|------|------|--------|
| GET | `/api/admin/products` | 取得所有商品（含下架） | 後台商品管理 |
| POST | `/api/admin/products` | 新增商品 | 後台商品管理 |
| PUT | `/api/admin/products/:id` | 編輯商品 | 後台商品管理 |
| GET | `/api/admin/orders` | 取得所有訂單 | 後台訂單管理 |
| PUT | `/api/admin/orders/:no` | 更新訂單狀態 | 後台訂單管理 |
| POST | `/api/admin/upload` | 上傳圖片至 R2 | 後台商品管理 |

---

## 五、資料流

### 5.1 前台瀏覽商品
```
使用者 → index.html
  → fetch GET /api/products
    → Worker 查詢 D1 products（WHERE active=1）
    → 回傳商品列表（含 cat、images key 陣列）
  → 渲染商品卡，圖片 src = /images/:key
    → Worker GET /images/:key → R2 取圖 → 回傳圖片
```

### 5.2 商品詳情
```
使用者點商品 → product.html?id=:id
  → fetch GET /api/products/:id
    → Worker 查詢 D1 → 回傳單一商品
  → 顯示圖片 gallery、顏色/尺寸選項
  → 使用者選好 → 加入購物車（存 localStorage）
```

### 5.3 結帳下單
```
使用者 → checkout.html
  → 讀取 localStorage 的購物車
  → 填寫姓名/手機/地址 → 送出
  → fetch POST /api/orders（body: 收件資訊 + 購物車快照）
    → Worker 計算小計/運費/總計
    → 寫入 D1 orders 資料表
    → 回傳 order_no
  → 清空 localStorage 購物車
  → 跳轉 order.html?no=:order_no
```

### 5.4 訂單確認
```
使用者 → order.html?no=:no
  → fetch GET /api/orders/:no
    → Worker 查詢 D1 → 回傳訂單詳情（含 items JSON）
  → 顯示訂單資訊、LINE Pay QR Code（靜態圖片）
```

### 5.5 後台新增商品
```
管理員 → admin/products.html（需 Cloudflare Access 驗證）
  → 填寫商品資料
  → 拖曳上傳圖片：
      fetch POST /api/admin/upload（multipart/form-data）
        → Worker 存入 R2（key: products/timestamp-random.ext）
        → 回傳 { key, url }
  → 送出表單：
      fetch POST /api/admin/products（JSON）
        → Worker 寫入 D1 products（images 欄位存 key 陣列 JSON）
```

### 5.6 後台更新訂單狀態
```
管理員 → admin/orders.html
  → fetch GET /api/admin/orders → 取得所有訂單
  → 下拉選單改狀態
  → fetch PUT /api/admin/orders/:no（body: { status }）
    → Worker 更新 D1 orders.status
```

---

## 六、資料庫結構（D1: brand-store）

### products 資料表
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER PK | 自動遞增 |
| name | TEXT | 商品名稱 |
| description | TEXT | 商品描述 |
| price | INTEGER | 售價（NT$） |
| original_price | INTEGER | 原價（可空，用於顯示劃線價） |
| images | TEXT | R2 key 陣列（JSON string[]） |
| cat | TEXT | 分類標籤，空格分隔（e.g. `"new top tshirt"`） |
| colors | TEXT | 顏色陣列（JSON string[]） |
| sizes | TEXT | 尺寸陣列（JSON string[]） |
| badge | TEXT | `"new"` / `"hot"` / `""` |
| active | INTEGER | 1=上架，0=下架 |
| sort_order | INTEGER | 排序權重（越大越前） |
| created_at | TEXT | 建立時間 |

### orders 資料表
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER PK | 自動遞增 |
| order_no | TEXT UNIQUE | 訂單編號（ORD-YYYYMMDD-XXXX） |
| name | TEXT | 收件人姓名 |
| phone | TEXT | 手機號碼 |
| email | TEXT | Email（選填） |
| address | TEXT | 收件地址 |
| items | TEXT | 購物車快照（JSON） |
| subtotal | INTEGER | 商品小計 |
| shipping_fee | INTEGER | 運費（0 或 60） |
| total | INTEGER | 合計 |
| status | TEXT | `pending`/`paid`/`shipped`/`done`/`cancelled` |
| note | TEXT | 備註 |
| created_at | TEXT | 建立時間 |

---

## 七、CORS 設定

Worker 對所有回應加上：
```
Access-Control-Allow-Origin: https://cloth.nestdigitalai.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Credentials: true
```

---

## 八、部署流程

| 異動類型 | 部署方式 |
|----------|----------|
| 前台/後台 HTML/CSS/JS | `git push` → GitHub Actions 自動部署到 Pages（待設定）<br>或手動：`wrangler pages deploy . --project-name=cloth-shop` |
| Worker（API 邏輯） | `cd worker && wrangler deploy` |
| 資料庫 Schema 變更 | `cd worker && wrangler d1 execute brand-store --remote --file=schema.sql` |
| R2 圖片 | 透過後台 `/admin/products.html` 上傳（自動存入 R2） |

---

## 九、待確認事項 ✓/✗

- [ ] 前台首頁動態載入商品是否正常顯示
- [ ] 商品圖片是否正確從 R2 載入
- [ ] 分類篩選是否與 API 的 `cat` 欄位吻合
- [ ] 結帳流程完整測試（填表 → 送出 → 訂單頁）
- [ ] 訂單查詢（電話 / 訂單編號）是否正常
- [ ] 後台圖片上傳是否正常（CORS 已修）
- [ ] Cloudflare Access 保護 `/admin/*` 是否生效
- [ ] GitHub push 自動部署（GitHub Actions 待設定）
