# API Playground (Public Methods Only)

This interactive playground lets you send **public** JSON-RPC requests directly to  
`https://api.citronus.com/public/v1/jsonrpc`.

Public methods do **not** require authentication:

- `markets`
- `tickers`
- `orderbook`
- `ohlcv`

> Private methods like `create_order`, `get_balance`, etc. are intentionally **not available here**  
> because they require HMAC signing with your API secret. Never expose your API secret in browser code.

---

## 1. Build request

<form id="api-form" style="display:grid;gap:1rem;max-width:600px;">
  <label style="display:grid;gap:4px;">
    <span><strong>Method</strong></span>
    <select id="method" style="padding:8px;">
      <option value="markets">markets</option>
      <option value="tickers">tickers</option>
      <option value="orderbook">orderbook</option>
      <option value="ohlcv">ohlcv</option>
    </select>
  </label>

  <label style="display:grid;gap:4px;">
    <span><strong>Params (JSON)</strong></span>
    <textarea id="params" rows="6" style="padding:8px;font-family:monospace;">
{ "category": "spot" }
    </textarea>
    <small>Example: { "category": "spot", "symbol": "BTC/USDT" }</small>
  </label>

  <label style="display:grid;gap:4px;">
    <span><strong>Request ID (optional)</strong></span>
    <input id="reqid" value="1" style="padding:8px;font-family:monospace;">
  </label>

  <button id="sendBtn" type="button"
    style="padding:10px 16px;font-size:14px;cursor:pointer;border-radius:6px;border:1px solid #999;">
    Send request
  </button>
</form>

---

## 2. Raw outgoing request body

<pre id="requestPreview" style="white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;max-width:800px;overflow-x:auto;">
<!-- will be filled by JS -->
</pre>

---

## 3. Response

<pre id="responseBox" style="white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;max-width:800px;overflow-x:auto;">
<!-- will be filled by JS -->
</pre>

---

