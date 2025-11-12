# API Playground (только публичные методы)

Этот интерактивный playground позволяет отправлять **публичные** JSON-RPC запросы прямо на  
`https://api.citronus.com/public/v1/jsonrpc`.

Публичные методы **не** требуют аутентификации:

- `markets`
- `tickers`
- `orderbook`
- `ohlcv`

> Приватные методы, такие как `create_order`, `get_balance` и т. п., здесь **умышленно недоступны**,  
> потому что для них нужна HMAC-подпись с вашим API-секретом. Никогда не раскрывайте API-секрет в коде браузера.

---

## 1. Сформировать запрос

<form id="api-form" style="display:grid;gap:1rem;max-width:600px;">
  <label style="display:grid;gap:4px;">
    <span><strong>Метод</strong></span>
    <select id="method" style="padding:8px;">
      <option value="markets">markets</option>
      <option value="tickers">tickers</option>
      <option value="orderbook">orderbook</option>
      <option value="ohlcv">ohlcv</option>
    </select>
  </label>

  <label style="display:grid;gap:4px;">
    <span><strong>Параметры (JSON)</strong></span>
    <textarea id="params" rows="6" style="padding:8px;font-family:monospace;">
{ "category": "spot" }
    </textarea>
    <small>Пример: { "category": "spot", "symbol": "BTC/USDT" }</small>
  </label>

  <label style="display:grid;gap:4px;">
    <span><strong>Request ID (необязательно)</strong></span>
    <input id="reqid" value="1" style="padding:8px;font-family:monospace;">
  </label>

  <button id="sendBtn" type="button"
    style="padding:10px 16px;font-size:14px;cursor:pointer;border-radius:6px;border:1px solid #999;">
    Отправить запрос
  </button>
</form>

---

## 2. Сырый исходящий JSON тела запроса

<pre id="requestPreview" style="white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;max-width:800px;overflow-x:auto;">
<!-- сюда запишет JS -->
</pre>

---

## 3. Ответ

<pre id="responseBox" style="white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;max-width:800px;overflow-x:auto;">
<!-- сюда запишет JS -->
</pre>

---
