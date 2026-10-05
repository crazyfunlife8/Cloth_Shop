# Gomypay 金流串接說明（Ember 服飾站專用）

> 僅保留本站使用的三種付款方式：信用卡、超商條碼、超商代碼  
> 原始文件版本：1.13.1

---

## 一、環境與通用設定

| 項目 | 值 |
|------|-----|
| 測試網址 | `https://n.gomypay.asia/TestShuntClass.aspx` |
| 正式網址 | `https://n.gomypay.asia/ShuntClass.aspx` |
| 遞交方式 | GET（query string）或 POST form |
| `Pay_Mode_No` | 固定填 `2` |
| `CustomerId` | 商店代號（自然人填身分證明碼，或加密後 32 碼）→ 存 Cloudflare Worker secret |
| `Str_Check` | 交易驗證密碼 → 存 Cloudflare Worker secret |
| `Return_url` | `https://cloth.nestdigitalai.com/order.html`（最長 100 字元）|
| `Callback_Url` | `https://brand-api.crazyfunlife8.workers.dev/api/payment/callback`（最長 500 字元）|

---

## 二、付款流程總覽

```
客戶結帳頁 →（POST /api/payment/initiate）→ Worker 建 Gomypay URL
  → window.location.href = gomypay_url
  → Gomypay 顯示付款頁（信用卡填卡/超商印代碼條碼）
  → Gomypay GET redirect 回 Return_url（帶回傳參數）
  → order.html 依 Send_Type 顯示對應文案
  → （客戶去超商繳費後）Gomypay POST Callback_Url → Worker 更新訂單狀態
```

**⚠️ 測試環境注意**：
- 信用卡：TestShuntClass.aspx 使用測試卡號，實際不扣款
- 超商代碼/條碼：測試環境會立即 redirect 回 Return_url（不會真正到超商），所以在瀏覽器看起來像「沒有跳轉」，實際上是瞬間完成

---

## 三、送出參數（三種付款方式）

### 共用欄位（所有付款方式都需要）

| 參數 | 長度 | 說明 |
|------|------|------|
| `Send_Type` | 1 | 付款類型（見下方） |
| `Pay_Mode_No` | 1 | 固定 `2` |
| `CustomerId` | ≤20 | 商店代號（身分證明碼） |
| `Order_No` | ≤25 | 訂單編號（ORD-YYYYMMDD-XXXX） |
| `Amount` | ≤10 | 金額（整數，不含小數點） |
| `Buyer_Name` | ≤20 | 消費者姓名（**不可含數字或特殊符號**） |
| `Buyer_Telm` | ≤20 | 手機號碼（純數字） |
| `Buyer_Mail` | ≤50 | Email |
| `Buyer_Memo` | ≤500 | 商品備註（可省略） |
| `Return_url` | ≤100 | 導回我們的 order.html |
| `Callback_Url` | ≤500 | 背景對帳 URL（Worker） |

### 信用卡（Send_Type=0）

| 額外參數 | 值 |
|----------|-----|
| `TransCode` | `00` |
| `TransMode` | `1`（一般刷卡） |
| `Installment` | `0`（不分期） |
| 最低金額 | **35 元** |

不帶 CardNo/ExpireDate/CVV → Gomypay 顯示預設刷卡頁面，客戶自填卡號

### 超商條碼（Send_Type=2）

| 額外參數 | 說明 |
|----------|------|
| 最低金額 | **50 元**，最高 60,000 元 |
| 繳費期限 | 當日有效 |

### 超商代碼（Send_Type=6）

| 額外參數 | 值 |
|----------|-----|
| `StoreType` | `3`（7-ELEVEN，本站固定 7-11） |
| 最低金額 | **50 元**，最高 20,000 元 |
| 繳費期限 | 印單後 3 小時（7-11），其他超商 30 分鐘 |

---

## 四、Return_url 回傳參數（GET redirect）

Gomypay 在付款完成後，以 GET 方式 redirect 回 `Return_url`，附帶以下參數：

### 信用卡（Send_Type=0）

| 參數 | 說明 |
|------|------|
| `Send_Type` | `0` |
| `result` | `1`=成功、`0`=失敗 |
| `ret_msg` | `授權成功` / 失敗原因 |
| `e_orderno` | 我們的訂單編號（Order_No） |
| `OrderID` | Gomypay 系統編號 |
| `e_money` | 實際交易金額 |
| `str_check` | MD5 驗證碼 |

### 超商條碼（Send_Type=2）

| 參數 | 說明 |
|------|------|
| `Send_Type` | `2` |
| `result` | `1`=取號成功、`0`=失敗 |
| `ret_msg` | `取號成功` / 失敗原因 |
| `e_orderno` | 訂單編號 |
| `LimitDate` | 繳費期限（yyyyMMdd） |
| `code1` | 條碼第 1 段 |
| `code2` | 條碼第 2 段 |
| `code3` | 條碼第 3 段 |

> `result=1` 表示條碼已產生，**不代表已付款**

### 超商代碼（Send_Type=6）

| 參數 | 說明 |
|------|------|
| `Send_Type` | `6` |
| `result` | `1`=取號成功、`0`=失敗 |
| `ret_msg` | `取號成功` / 失敗原因 |
| `e_orderno` | 訂單編號 |
| `PinCode` | **繳費代碼**（客戶持此代碼去 7-11 ibon 繳費） |
| `StoreType` | `3`（7-11） |

> `result=1` 表示代碼已產生，**不代表已付款**

---

## 五、Callback_Url 回傳參數（POST，背景對帳）

客戶實際到超商繳費完成後，Gomypay 以 POST 呼叫 Callback_Url。  
Worker 收到後需回傳 HTTP 200，Gomypay 會在 3 天內每 5 分鐘重試，最多 10 次。

### 共用欄位

| 參數 | 說明 |
|------|------|
| `Send_Type` | 付款方式 |
| `result` | `1`=成功、`0`=失敗 |
| `e_orderno` | 我們的訂單編號 |
| `OrderID` | Gomypay 系統編號 |
| `e_money` | 交易金額 |
| `PayAmount` | 實際繳費金額 |
| `e_date` | 繳費日期（yyyymmdd） |
| `e_time` | 繳費時間（HH:mm:ss） |
| `str_check` | MD5 驗證碼 |

### 超商代碼額外回傳

| 參數 | 說明 |
|------|------|
| `PinCode` | 繳費代碼 |
| `Market_ID` | `SE`=7-11、`FM`=全家、`OK`=OK、`HL`=萊爾富 |
| `Shop_Store_Name` | 實際繳費門市名稱＋地址 |

---

## 六、str_check MD5 驗證公式

```
MD5( result + e_orderno + CustomerId明碼 + PayAmount + OrderID + Str_Check )
```

範例：
- result=`1`, e_orderno=`2020050701`, CustomerId=`80013554`
- PayAmount=`50`, OrderID=`2020050700000000001`, Str_Check=`2b1bef9d8...`
- 串接字串：`12020050701800135545420200507000000000012b1bef9d...`

---

## 七、order.html 應依 Send_Type 判斷顯示內容

| `Send_Type` | `result` | 顯示 |
|-------------|----------|------|
| `0`（信用卡） | `1` | 「付款成功！」＋出貨說明 |
| `0` | `0` | 「付款失敗」 |
| `2`（超商條碼） | `1` | 「條碼已取得，請當日前往 7-11 繳費」＋顯示條碼 |
| `2` | `0` | 「取碼失敗」 |
| `6`（超商代碼） | `1` | 「代碼已取得：XXXX，請 3 小時內至 7-11 ibon 繳費」 |
| `6` | `0` | 「取碼失敗」 |

**PinCode 應顯示在 order.html 上**（URL 參數直接帶回），不需要客戶截圖 Gomypay 頁面。

---

## 八、Worker paymentInitiate 遞交 URL 範例

```
https://n.gomypay.asia/TestShuntClass.aspx
  ?Send_Type=6
  &Pay_Mode_No=2
  &CustomerId={env.CustomerId}
  &Order_No=ORD-20261005-XXXX
  &Amount=1000
  &StoreType=3
  &Buyer_Name=王小明
  &Buyer_Telm=0912345678
  &Buyer_Mail=test@example.com
  &Buyer_Memo=商品×1
  &TransCode=00
  &Return_url=https://cloth.nestdigitalai.com/order.html
  &Callback_Url=https://brand-api.crazyfunlife8.workers.dev/api/payment/callback
```
