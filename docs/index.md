# Citronus API — JSON-RPC + WebSocket (v1)

**Version:** 1  
**Date:** 23 October 2025  
**Host:** `https://api.citronus.com`

## 1\. Base HTTP Endpoint

**Method**  
`POST`

**URL**  
`https://api.citronus.com/public/v1/jsonrpc`

**Protocol**  
JSON-RPC 2.0

**Content-Type**  
`application/json`

### 1.1 What is JSON-RPC

JSON-RPC is a lightweight RPC (Remote Procedure Call) protocol over HTTP where both the request and the response are JSON objects.
The request includes:

* method name,
* parameters,
* and an optional `id`.

The response contains either `result` or `error`.
Reference: <https://www.jsonrpc.org/specification>

### 1.2 Request Format

`id` is optional. If you include it, use a string (for example `"1"`).

```
{
  "jsonrpc": "2.0",
  "method": "<method_name>",
  "params": { "<param>": "<value>" },
  "id": "<request_id>"
}
```

### 1.3 Response Format

Successful response:

```
{
  "jsonrpc": "2.0",
  "result": { "<key>": "<value>" },
  "id": "<request_id>"
}
```

Error response:

```
{
  "jsonrpc": "2.0",
  "error": {
    "code": <error_code>,
    "message": "<error_message>"
  },
  "id": "<request_id>"
}
```

## 2\. Authentication & Signing

### 2.1 Access Modes

* **Public methods** — do not require API keys. You may call them with no auth headers at all.
* **Private methods** — require authentication using API headers and an HMAC signature.

Note: Public methods will accept requests even if you send “partial” or “empty-looking” auth headers.
For private methods, correct headers and a valid signature are mandatory.

### 2.2 Getting API Keys

In the UI:
`Settings → API Management → Create new key`

You will receive:

* **API Key** — public identifier.
* **API Secret** — secret credential (must be stored securely on your side only).

### 2.3 Required Headers (private methods)

For private methods you must send:

```
X-CITRO-API-KEY: <your API key>
X-CITRO-TIMESTAMP: <unix_ms>
X-CITRO-RECV-WINDOW: <ms>
X-CITRO-SIGNATURE: <hex>
```

Where:

* `X-CITRO-TIMESTAMP` — client timestamp in Unix milliseconds (UTC).
  Example: `1759308923000`
* `X-CITRO-RECV-WINDOW` — allowed acceptance window in milliseconds (e.g. `"5000"` or `"15000"`).
  If `|server_now_ms - X-CITRO-TIMESTAMP| > X-CITRO-RECV-WINDOW`, the request is rejected.
* `X-CITRO-API-KEY` — your API key.
* `X-CITRO-SIGNATURE` — HMAC signature (see below).

Public methods can be called with **no** auth headers at all.

### 2.4 Signature Calculation

The signature is HMAC-SHA256 over the concatenation:

```
message = <timestamp><api_key><recv_window><body_raw>
signature = HEX( HMAC_SHA256( key = api_secret, message = message ) )
```

Where:

* `<timestamp>` — same value you send in `X-CITRO-TIMESTAMP` (string, ms).
* `<api_key>` — same value you send in `X-CITRO-API-KEY`.
* `<recv_window>` — same value you send in `X-CITRO-RECV-WINDOW` (string, e.g. `"5000"`).
* `<body_raw>` — the exact raw JSON request body you will send over HTTP, byte-for-byte.
* `api_secret` — your API Secret.

⚠ Important: You must sign the exact bytes you actually send.
Any change in whitespace, key order, etc. changes the signature.

### 2.5 Python Example (requests)

```
import json, requests, time, hmac, hashlib
from typing import Dict

URL = "https://api.citronus.com/public/v1/jsonrpc"
API_KEY = "<YOUR_API_KEY>"
API_SECRET = "<YOUR_API_SECRET>"

def build_api_key_auth_headers(api_key: str, api_secret: str, req_body: str) -> Dict[str, str]:
    ts = str(int(time.time() * 1000))
    recv_window = "5000"

    # signature over raw body bytes:
    #   ts + api_key + recv_window + req_body
    to_sign = ts + api_key + recv_window + req_body
    signature = hmac.new(
        api_secret.encode("utf-8"),
        to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return {
        "X-CITRO-SIGNATURE": signature,
        "X-CITRO-API-KEY": api_key,
        "X-CITRO-TIMESTAMP": ts,
        "X-CITRO-RECV-WINDOW": recv_window,
    }

body = {
    "jsonrpc": "2.0",
    "method": "markets",
    "params": {"category": "spot"},
    "id": "1",
}

# NOTE: separators=(",", ":") to avoid spaces that would change the signature
req_body = json.dumps(body, separators=(",", ":"), ensure_ascii=False)

headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    **build_api_key_auth_headers(API_KEY, API_SECRET, req_body),
}

resp = requests.post(URL, headers=headers, data=req_body.encode("utf-8"), timeout=15)
print(resp.status_code, resp.text)
```

### 2.6 JavaScript Example (Node ≥18 / fetch)

```
import crypto from "node:crypto";

const URL = "https://api.citronus.com/public/v1/jsonrpc";
const API_KEY = "<YOUR_API_KEY>";
const API_SECRET = "<YOUR_API_SECRET>";
const RECV_WINDOW = "5000";

const body = {
  jsonrpc: "2.0",
  method: "markets",
  params: { category: "spot" },
  id: "1",
};

const raw = JSON.stringify(body); // exact body to send
const ts = Date.now().toString();
const toSign = ts + API_KEY + RECV_WINDOW + raw;

const signature = crypto
  .createHmac("sha256", API_SECRET)
  .update(toSign, "utf8")
  .digest("hex");

const resp = await fetch(URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    "X-CITRO-API-KEY": API_KEY,
    "X-CITRO-TIMESTAMP": ts,
    "X-CITRO-RECV-WINDOW": RECV_WINDOW,
    "X-CITRO-SIGNATURE": signature,
  },
  body: raw,
});

console.log(resp.status, await resp.text());
```

### 2.7 cURL Examples (unsigned, public)

Public methods do not require authentication headers.

**Windows CMD:**

```
curl.exe -sS ^
  -H "Content-Type: application/json" ^
  --data-raw "{\"jsonrpc\":\"2.0\",\"method\":\"markets\",\"params\":{\"category\":\"futures\"},\"id\":\"1\"}" ^
  https://api.citronus.com/public/v1/jsonrpc
```

**macOS / Linux bash:**

```
curl -sS \
  -H "Content-Type: application/json" \
  --data-raw '{"jsonrpc":"2.0","method":"markets","params":{"category":"futures"},"id":"1"}' \
  https://api.citronus.com/public/v1/jsonrpc
```

### 2.8 Time Validation

The server enforces:

```
| server_now_ms - X-CITRO-TIMESTAMP | <= X-CITRO-RECV-WINDOW
```

If your clock drift + network latency exceeds the recv window, the request fails.

Typical errors:

* `invalid_signature` — check concatenation order/values.
* `recv_window_expired` / `invalid_timestamp` — sync your clock or increase `X-CITRO-RECV-WINDOW`.
* `internal_server_error` — unexpected backend error.

A full error reference is available later in this document.

## 3\. SPOT — JSON-RPC Methods

### 3.1 Public Methods

#### 3.1.1 `markets`

**Purpose:**
Return available trading pairs and their trading parameters.

**Access:**
Public (no authentication required)

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>

**Protocol:**
JSON-RPC 2.0

**Content-Type:**
`application/json`

**Request body (list all spot pairs):**

```
{
  "jsonrpc": "2.0",
  "method": "markets",
  "params": { "category": "spot" },
  "id": "1"
}
```

**Request body (filter by symbol, optional):**

```
{
  "jsonrpc": "2.0",
  "method": "markets",
  "params": { "category": "spot", "symbol": "BTC/USDT" },
  "id": "1"
}
```

**Parameters:**

| Field | Type | Required | Allowed values | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. |
| symbol | string | no | e.g. `BTC/USDT` | Filter by specific pair. If omitted, returns all pairs in that category. |

**Successful response example:**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "symbol": "BTC/USDT",
    "base_coin": {
      "name": "BTC",
      "precision": 8
    },
    "quote_coin": {
      "name": "USDT",
      "precision": 6
    },
    "icon": "https://s3.eu-central-2.wasabisys.com/citronus/icons/coins/BTC.svg",
    "min_order_qty": "0.000048",
    "max_order_qty": "71.73956243",
    "min_order_amt": "1",
    "max_order_amt": "4000000",
    "quote_tick_size": "0.01",
    "limit_parameter": "0.05",
    "commission_limit_sell": "0.0001",
    "commission_limit_buy": "0.0001",
    "commission_market_sell": "0",
    "commission_market_buy": "0",
    "commission_stop_limit_sell": "0.0001",
    "commission_stop_limit_buy": "0.0001",
    "trade_base_precision": 6,
    "trade_quote_precision": 6
  }
}
```

**Field reference:**

| Field | Type | Description |
| --- | --- | --- |
| `jsonrpc` | string | JSON-RPC version (`"2.0"`). |
| `id` | string | Echoed request id. |
| `result.symbol` | string | Trading pair in `BASE/QUOTE` format (e.g. `BTC/USDT`). |
| `result.base_coin.name` | string | BASE asset ticker. |
| `result.base_coin.precision` | number | Number of decimal places allowed for BASE asset amounts. |
| `result.quote_coin.name` | string | QUOTE asset ticker. |
| `result.quote_coin.precision` | number | Number of decimal places allowed for QUOTE amounts. |
| `result.icon` | string | Icon URL for the asset. |
| `result.min_order_qty` | string | Minimum order size in BASE units. |
| `result.max_order_qty` | string | Maximum order size in BASE units. |
| `result.min_order_amt` | string | Minimum notional in QUOTE currency. |
| `result.max_order_amt` | string | Maximum notional in QUOTE currency. |
| `result.quote_tick_size` | string | Minimum price tick in QUOTE. |
| `result.limit_parameter` | string | Limit order price deviation parameter. |
| `result.commission_limit_sell` | string | Fee rate for limit sell orders (fraction). |
| `result.commission_limit_buy` | string | Fee rate for limit buy orders (fraction). |
| `result.commission_market_sell` | string | Fee rate for market sell orders (fraction). |
| `result.commission_market_buy` | string | Fee rate for market buy orders (fraction). |
| `result.commission_stop_limit_sell` | string | Fee rate for stop-limit sell orders (fraction). |
| `result.commission_stop_limit_buy` | string | Fee rate for stop-limit buy orders (fraction). |
| `result.trade_base_precision` | number | Max decimals allowed in trade quantity (BASE). |
| `result.trade_quote_precision` | number | Max decimals allowed in trade price / notional (QUOTE). |

#### 3.1.2 `tickers`

**Purpose:**
Return ticker data for an instrument (last price, 24h stats).

**Access:**
Public

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>

**Request:**

```
{
  "jsonrpc": "2.0",
  "method": "tickers",
  "params": { "category": "spot", "symbol": "BTC/USDT" },
  "id": "1"
}
```

**Parameters:**

| Field | Type | Required | Allowed values | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. |
| symbol | string | yes | e.g. `BTC/USDT` | Trading pair symbol. |

**Successful response example:**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "symbol": "BTC/USDT",
    "last_price": "120382.98",
    "volume_24h": "292748.926560",
    "change_24h": "1.31",
    "high_24h": "121024.9",
    "low_24h": "118499.9",
    "price_direction": "DOWN"
  }
}
```

**Field reference:**

| Field | Type | Description |
| --- | --- | --- |
| symbol | string | Pair in `BASE/QUOTE` format. |
| last_price | string | Last traded price / last quote (in QUOTE). |
| volume_24h | string | 24h volume, typically in BASE. If different, that will be clarified in the specific market. |
| change_24h | string | 24h price change in percent, e.g. `"1.31"` = +1.31%. |
| high_24h | string | 24h high. |
| low_24h | string | 24h low. |
| price_direction | string | Direction vs previous tick, e.g. `"UP"` or `"DOWN"`. |

#### 3.1.3 `orderbook`

**Purpose:**
Return current order book for a trading pair.

**Access:**
Public

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>

**Request:**

```
{
  "jsonrpc": "2.0",
  "method": "orderbook",
  "params": { "category": "spot", "symbol": "BTC/USDT" },
  "id": "1"
}
```

**Parameters:**

| Field | Type | Required | Allowed values | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. |
| symbol | string | yes | e.g. `BTC/USDT` | Trading pair. |

Note: in the response, the symbol may appear in `BASE-QUOTE` format (e.g. `BTC-USDT`). This is expected.

**Successful response example:**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "s": "BTC-USDT",
    "a": [
      ["120398.57", "50.00000000"],
      ["120382.01", "2.00000000"],
      ["120374.53", "35.00000000"],
      ["120362.47", "20.00000000"]
    ],
    "b": [
      ["120197.15", "5.00000000"],
      ["120228.11", "50.00000000"],
      ["120231.98", "2.00000000"],
      ["120252.05", "35.00000000"]
    ],
    "ts": 1759494727.705812
  }
}
```

**Field reference:**

| Field | Type | Description |
| --- | --- | --- |
| s | string | Symbol in `BASE-QUOTE` format (e.g. `BTC-USDT`). |
| a | array\<[string, string]\> | Asks. Each element is `\\[price, size\\]` where `price` is in QUOTE, `size` is in BASE. Best prices come first. |
| b | array\<[string, string]\> | Bids. Same format as `a`. Best prices come first. |
| ts | number | Server timestamp in seconds (Unix time, UTC, fractional seconds allowed). |

All price / size values are strings.
`price` uses the `quote_tick_size` from `markets`.
`size` respects the `base_coin.precision` from `markets`.

#### 3.1.4 `ohlcv`

**Purpose:**
Return OHLCV candles for a symbol and timeframe.

**Access:**
Public

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>
**Content-Type:** `application/json; charset=utf-8`

⚠ Currently this method only works for the symbol `CITRO/USDT`.
Other symbols will return `invalid_symbol`.

**Minimal request:**

```
{
  "jsonrpc": "2.0",
  "method": "ohlcv",
  "params": { "category": "spot", "symbol": "CITRO/USDT", "interval": "1D", "data": {} },
  "id": "1"
}
```

**With time window + limit:**

```
{
  "jsonrpc": "2.0",
  "method": "ohlcv",
  "params": {
    "category": "spot",
    "symbol": "CITRO/USDT",
    "interval": "1m",
    "data": {
      "start": 1742688000000,
      "end":   1743379200000,
      "limit": 500
    }
  },
  "id": "2"
}
```

**Parameters:**

| Field | Where | Type | Required | Allowed values | Description |
| --- | --- | --- | --- | --- | --- |
| category | params | string | yes | `spot` | Market type. |
| symbol | params | string | yes | e.g. `CITRO/USDT` | Trading pair. Currently only `CITRO/USDT` supported. |
| interval | params | string | yes | See table below | Candle timeframe. |
| data | params | object | yes | — | Additional parameters object (may be `{}`). |
| data.start | data | integer \| null | no | Unix ms (UTC) | Start time (inclusive). |
| data.end | data | integer \| null | no | Unix ms (UTC) | End time (inclusive). |
| data.limit | data | integer | no | default 200 | Max candles to return (may also be capped by backend). |

**Supported intervals (examples):**

* `"1m"` — 1 minute
* `"5m"` — 5 minutes
* `"15m"` — 15 minutes
* `"1h"` — 1 hour
* `"4h"` — 4 hours
* `"1D"` — 1 day
* `"1W"` — 1 week
* `"1M"` — 1 month

(Your backend may also expose `"1"`, `"3"`, `"60"`, etc. as minute-based strings; document the exact allowed values in production.)

**Successful response format:**

Returns an array of candles.
Each candle is an array of 6 elements:

```
[
  [ timestamp_ms, open, high, low, close, volume ],
  ...
]
```

Where:

* `timestamp_ms` — string with Unix time in ms (UTC).
* `open`, `high`, `low`, `close`, `volume` — numeric values as strings.
* Sorted ascending by time.
* If no data matches, returns `[]`.

**Example:**

```
{
  "jsonrpc":"2.0",
  "id":"1",
  "result":[
    ["1742688000000","0","0","0","0","0"],
    ["1742774400000","0","0","0","0","0"]
  ]
}
```

### 3.2 Private Methods

#### 3.2.1 `create_order`

**Purpose:**
Create an order (market / limit / stop_limit) on the spot market.

**Access:**
Private — requires `X-CITRO-*` headers and valid HMAC-SHA256 signature.

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>
**Content-Type:** `application/json; charset=utf-8`

**Request (top-level structure):**

```
{
  "jsonrpc": "2.0",
  "method": "create_order",
  "params": { "category": "spot", "data": { /* see below */ } },
  "id": "1"
}
```

**`data` examples (any field order is allowed):**

Market order (exact BASE amount OR QUOTE total; you send only one of them):

```
{ "symbol": "BTC/USDT", "action": "buy",  "type": "market", "amount": "0.1" }
{ "symbol": "BTC/USDT", "action": "sell", "type": "market", "total":  "100"  }
```

Limit order (must include `price`; send only `amount` OR `total`):

```
{ "symbol": "BTC/USDT", "action": "buy",  "type": "limit", "price": "65000", "amount": "0.1" }
{ "symbol": "BTC/USDT", "action": "sell", "type": "limit", "price": "65000", "total":  "1000" }
```

Stop-limit order (must include both `price` and `stop_price`; send only `amount` OR `total`):

```
{
  "symbol": "BTC/USDT",
  "action": "sell",
  "type": "stop_limit",
  "price": "65000",
  "stop_price": "64500",
  "amount": "0.1"
}
```

**Parameters (`params` / `data`):**

| Field | Type | Required? | Allowed values | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. |
| data | object | yes | — | Order definition. |
| data.symbol | string | yes | e.g. `BTC/USDT` | Trading pair. |
| data.action | string | yes | `buy` \| `sell` | Order side. |
| data.type | string | yes | `market` \| `limit` \| `stop_limit` | Order type. |
| data.amount | string \| number | conditional | \>0 | Amount in BASE. Mutually exclusive with `total`. |
| data.total | string \| number | conditional | \>0 | Amount in QUOTE. Mutually exclusive with `amount`. |
| data.price | string \| number | for limit/stop | \>0 | Limit price in QUOTE. |
| data.stop_price | string \| number | for stop_limit | \>0 | Stop trigger. Typically: \>= for buy, \<= for sell. |

**Important:**

* Send **either** `amount` **or** `total`, not both.
* Omitting both is an error.
* For `market` orders:
  * If you provide `amount`, `total` is derived from execution.
  * If you provide `total`, the system derives `amount` based on available liquidity.
* For `limit` orders:
  * Uses your `price` directly.
* For `stop_limit`:
  * `stop_price` is the trigger.
  * After trigger, becomes a live limit order at `price`.

**Validation rules:**

* `symbol` must exist in `markets(category="spot")`.
* `price` must respect `quote_tick_size` and `trade_quote_precision`.
* `amount` must respect `trade_base_precision`.
* Min/max checks use `min_order_qty` / `max_order_qty` and/or `min_order_amt` / `max_order_amt`.
* Fees follow `commission_*` fields from `markets`.

**Example request (market SELL by amount):**

```
{
  "jsonrpc": "2.0",
  "method": "create_order",
  "params": {
    "category": "spot",
    "data": {
      "symbol": "BTC/USDT",
      "action": "sell",
      "type": "market",
      "amount": 0.1
    }
  },
  "id": "1"
}
```

**Example request (limit BUY by total):**

```
{
  "jsonrpc": "2.0",
  "method": "create_order",
  "params": {
    "category": "spot",
    "data": {
      "symbol": "BTC/USDT",
      "action": "buy",
      "type": "limit",
      "price": "65000",
      "total": "500"
    }
  },
  "id": "2"
}
```

**Example request (stop-limit SELL by amount):**

```
{
  "jsonrpc": "2.0",
  "method": "create_order",
  "params": {
    "category": "spot",
    "data": {
      "symbol": "BTC/USDT",
      "action": "sell",
      "type": "stop_limit",
      "price": "64000",
      "stop_price": "64500",
      "amount": "0.05"
    }
  },
  "id": "3"
}
```

**Successful response example (market SELL):**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "id": "pRK4klVe",
    "price": null,
    "current_amount": "0",
    "original_amount": "0.1",
    "action": "sell",
    "pair": { "base": "BTC", "quote": "USDT" },
    "status": "fulfilled",
    "type": "market",
    "create_date": "2025-10-08T13:15:38.095823Z",
    "market_total_original": null,
    "market_total_current": null,
    "stop_price_gte": null,
    "stop_price_lte": null,
    "total": null,
    "fee": "0"
  }
}
```

##### Batch requests

JSON-RPC 2.0 allows sending an array of requests in one HTTP call.

```
[
  {
    "jsonrpc":"2.0",
    "method":"create_order",
    "params":{
      "category":"spot",
      "data":{"symbol":"ETH/USDT","action":"sell","type":"market","amount":"0.2"}
    },
    "id":"1"
  },
  {
    "jsonrpc":"2.0",
    "method":"create_order",
    "params":{
      "category":"spot",
      "data":{"symbol":"BTC/USDT","action":"sell","type":"market","amount":"0.1"}
    },
    "id":"2"
  }
]
```

Rules:

* Up to 10 orders per batch.
* Authentication: same `X-CITRO-*` headers + signature as single-call, but the signature covers the entire raw batch payload.
* Not atomic: each element is processed independently. Some may succeed, others may fail.
* Response order may differ. Match responses by `id`.
* Use unique `id` values per element.

**Batch response example:**

```
[
  {
    "jsonrpc":"2.0",
    "id":"1",
    "result":{
      "id":"pRK4klVe",
      "price":null,
      "current_amount":"0",
      "original_amount":"0.2",
      "action":"sell",
      "pair":{"base":"BTC","quote":"USDT"},
      "status":"fulfilled",
      "type":"market",
      "create_date":"2025-10-09T11:09:15.137918Z",
      "market_total_original":null,
      "market_total_current":null,
      "stop_price_gte":null,
      "stop_price_lte":null,
      "total":null,
      "fee":"0"
    }
  },
  {
    "jsonrpc":"2.0",
    "id":"2",
    "result":{
      "id":"pRK4klVe",
      "price":null,
      "current_amount":"0",
      "original_amount":"0.1",
      "action":"sell",
      "pair":{"base":"BTC","quote":"USDT"},
      "status":"fulfilled",
      "type":"market",
      "create_date":"2025-10-09T11:09:15.058303Z",
      "market_total_original":null,
      "market_total_current":null,
      "stop_price_gte":null,
      "stop_price_lte":null,
      "total":null,
      "fee":"0"
    }
  }
]
```

**Order result fields:**

| Field | Type | Description |
| --- | --- | --- |
| id | string | Internal order ID. |
| price | string \| null | Limit price; `null` for market orders. |
| current_amount | string | Remaining unfilled amount (BASE). `"0"` if fully filled. |
| original_amount | string | Original order size in BASE. |
| action | string | `"buy"` or `"sell"`. |
| pair.base / pair.quote | string | Base/quote tickers. |
| status | string | Order status: `created`, `placed`, `in_order_book`, `partially_fulfilled`, `completed`, `fulfilled`, `canceled`, `marked_for_cancel`, etc. |
| type | string | `market` \| `limit` \| `stop_limit`. |
| create_date | string | Creation timestamp (UTC, ISO-8601). |
| market_total_original | string \| null | Requested total for market orders (if provided). |
| market_total_current | string \| null | Actually spent/received in QUOTE for market orders. |
| stop_price_gte / stop_price_lte | string \| null | Stop trigger for stop-limit orders. |
| total | string \| null | Total notional in QUOTE. |
| fee | string | Fee charged for this order (in QUOTE). |

For `stop_limit`:

* For `buy` orders, the stop condition will appear as `stop_price_gte`.
* For `sell` orders, the stop condition will appear as `stop_price_lte`.

#### 3.2.2 `cancel_order`

**Purpose:**
Cancel a single existing order.

**Access:**
Private — requires `X-CITRO-*` headers and valid HMAC-SHA256 signature.

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>
**Content-Type:** `application/json; charset=utf-8`

**Request:**

```
{
  "jsonrpc": "2.0",
  "method": "cancel_order",
  "params": { "category": "spot", "order_id": "pRK4klVe" },
  "id": "1"
}
```

**Parameters:**

| Field | Type | Required | Allowed values | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. |
| order_id | string | yes | string | Order ID returned by `create_order`. |

**Successful response:**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": null
}
```

**Behavior / notes:**

* Cancelable statuses: `created`, `placed`, `in_order_book`, `partially_fulfilled`.
  * Remaining unfilled amount will be released.
* Terminal statuses cannot be canceled: `fulfilled` / `completed`, `canceled`.
  * `order_already_fulfilled` if already fully filled.
  * `order_already_canceled` if already canceled.
* `marked_for_cancel`: a second cancel request is idempotent → returns success again.
* Market orders cannot be canceled. Trying to cancel a market order returns `order_is_market`.
* Stop-limit orders can be canceled before trigger OR after trigger, as long as status is still cancelable and there is remaining amount.
* Permission check: if the order doesn't belong to your API key, you get `permission_denied` / similar.

#### 3.2.3 `cancel_all_orders`

**Purpose:**
Cancel all active orders for the user on the spot market (idempotent).

**Access:**
Private — requires `X-CITRO-*` headers and valid HMAC-SHA256 signature.

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>

**Request (cancel all active orders across all pairs):**

```
{
  "jsonrpc": "2.0",
  "method": "cancel_all_orders",
  "params": { "category": "spot" },
  "id": "1"
}
```

**Request (cancel only for a single symbol):**

```
{
  "jsonrpc": "2.0",
  "method": "cancel_all_orders",
  "params": { "category": "spot", "symbol": "CITRO/USDT" },
  "id": "1"
}
```

**Parameters:**

| Field | Where | Type | Required | Allowed values | Description |
| --- | --- | --- | --- | --- | --- |
| category | params | string | yes | `spot` | Market type. |
| symbol | params | string | no | e.g. `CITRO/USDT` | If provided, only orders for that pair are canceled. |

**Successful response:**
Returns an array of order IDs that were canceled.
If no active orders matched → returns `[]`.

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": ["pRK4klVe", "pRK5klVe", "pRK6klVe"]
}
```

**Behavior / notes:**

* Cancelable statuses: `created`, `placed`, `in_order_book`, `partially_fulfilled`.
* Remaining unfilled amount is released.
* Terminal statuses (`fulfilled` / `completed`, `canceled`) cannot be canceled:
  * `order_already_fulfilled`
  * `order_already_canceled`
* `marked_for_cancel`: re-calling is idempotent.
* Market orders (`type = market`) cannot be canceled (`order_is_market`).
* Stop-limit orders can still be canceled, before or after trigger, as long as they are in a cancelable status and have remaining amount.

#### 3.2.4 `active_orders`

**Purpose:**
Return the user's *active* orders: new, placed, in order book, partially filled, waiting on stop triggers, etc.

**Access:**
Private — requires `X-CITRO-*` headers and valid HMAC-SHA256 signature.

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>

**Minimal request:**

```
{
  "jsonrpc": "2.0",
  "method": "active_orders",
  "params": { "category": "spot", "data": {} },
  "id": "1"
}
```

**With filters and sorting:**

```
{
  "jsonrpc": "2.0",
  "method": "active_orders",
  "params": {
    "category": "spot",
    "data": {
      "start_date": "2025-10-01",
      "end_date": "2025-10-08",
      "order_by": "-price",
      "symbol": "BTC/USDT"
    }
  },
  "id": "2"
}
```

**Parameters:**

| Field | Type | Required | Allowed values / format | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. |
| data | object | yes | — | Filter object (may be `{}`). |
| data.start_date | string \| null | no | `YYYY-MM-DD` | Inclusive lower bound on `create_date` (UTC). |
| data.end_date | string \| null | no | `YYYY-MM-DD` | Inclusive upper bound on `create_date` (UTC). |
| data.order_by | string \| null | no | see below | Sort rule. |
| data.symbol | string \| null | no | e.g. `BTC/USDT` | Filter by pair. |

**Sorting (`order_by`):**

* No prefix → ascending.
* `-` prefix → descending.
* Allowed sort fields:
  * `create_date`
  * `price`
  * `pair`
  * `stop_price`
  * `original_amount`
  * `current_amount`

`pair` is sorted lexicographically as `BASE/QUOTE`.
`stop_price` is treated as `coalesce(stop_price_gte, stop_price_lte)`.
`nulls last`: `null` values are always placed at the end (both asc and desc).

**Validation:**

* If both dates are provided and `start_date > end_date` → error.
* Missing filter fields are treated as "not provided".

**Successful response:**
Returns an array (possibly empty `[]`) of active orders.

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": [
    {
      "id": "pRK4klVe",
      "price": "99000.00",
      "current_amount": "0.309276",
      "original_amount": "0.309276",
      "action": "buy",
      "pair": { "base": "BTC", "quote": "USDT" },
      "status": "created",
      "type": "stop_limit",
      "create_date": "2025-10-08T15:16:23.824699Z",
      "market_total_original": null,
      "market_total_current": null,
      "stop_price_gte": null,
      "stop_price_lte": "100000.00",
      "total": "30618.324000",
      "fee": "0",
      "commission_buy": "0.0001",
      "commission_sell": "0.0001",
      "weighted_average_price": null,
      "deals_amount": null
    },
    {
      "id": "pRK5klVe",
      "price": "100000.00",
      "current_amount": "1.000000",
      "original_amount": "1.000000",
      "action": "buy",
      "pair": { "base": "BTC", "quote": "USDT" },
      "status": "placed",
      "type": "limit",
      "create_date": "2025-10-08T15:15:47.362205Z",
      "market_total_original": null,
      "market_total_current": "0.000000",
      "stop_price_gte": null,
      "stop_price_lte": null,
      "total": "100000.000000",
      "fee": "0",
      "commission_buy": "0.0001",
      "commission_sell": "0.0001",
      "weighted_average_price": null,
      "deals_amount": null
    }
  ]
}
```

**Order fields:**

| Field | Type | Description |
| --- | --- | --- |
| id | string | Internal order ID. |
| price | string \| null | Limit price. `null` for market orders. |
| current_amount | string | Remaining unfilled amount (BASE). |
| original_amount | string | Original order amount (BASE). |
| action | string | `buy` or `sell`. |
| pair.base / pair.quote | string | Base / quote tickers. |
| status | string | e.g. `created`, `placed`, `partially_filled`, etc. |
| type | string | `market` \| `limit` \| `stop_limit`. |
| create_date | string | Creation time (UTC, ISO-8601). |
| market_total_original | string \| null | Requested total for `market` (if provided). |
| market_total_current | string \| null | Actually spent/received (market). |
| stop_price_gte / stop_price_lte | string \| null | Stop trigger conditions for stop_limit. |
| total | string \| null | Notional total in QUOTE. |
| fee | string | Fee in QUOTE. |
| commission_buy / commission_sell | string | Fee rates (fraction) for this instrument. |
| weighted_average_price | string \| null | VWAP of the executed portion (QUOTE). |
| deals_amount | string \| null | Total filled amount in BASE. |

#### 3.2.5 `orders_history`

**Purpose:**
Paginated historical orders.

**Access:**
Private — requires `X-CITRO-*` headers and signature.

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>
**Content-Type:** `application/json; charset=utf-8`

**Minimal request (recommended: always include `"history": "true"`):**

```
{
  "jsonrpc": "2.0",
  "method": "orders_history",
  "params": {
    "category": "spot",
    "page": 1,
    "page_size": 50,
    "data": { "history": "true" }
  },
  "id": "1"
}
```

**With filters and sorting:**

```
{
  "jsonrpc": "2.0",
  "method": "orders_history",
  "params": {
    "category": "spot",
    "page": 1,
    "page_size": 10,
    "data": {
      "start_date": "2025-10-01",
      "end_date": "2025-10-08",
      "order_by": "-create_date",
      "symbol": "BTC/USDT",
      "history": "true"
    }
  },
  "id": "2"
}
```

**Parameters:**

| Field | Type | Required | Allowed values / range | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. |
| page | integer \| string | yes | `1..1000` | Page number (default `1`). |
| page_size | integer \| string | yes | `1..100` | Page size (default `50`). |
| data | object | no | — | Filter object (may be `{}`). |
| data.start_date | string \| null | no | `YYYY-MM-DD` | Inclusive lower bound on `create_date` (UTC). |
| data.end_date | string \| null | no | `YYYY-MM-DD` | Inclusive upper bound on `create_date` (UTC). |
| data.order_by | string \| null | no | see below | Sort rule. |
| data.symbol | string \| null | no | e.g. `BTC/USDT` | Filter by pair. |
| data.history | string \| boolean | preferred | `"true"` | Should be `"true"` to ensure full historical results. |

**Sorting (`order_by`):**

* No prefix → ascending.
* `-` prefix → descending.
* Allowed fields:
  `create_date`, `price`, `pair`, `stop_price`, `total`, `original_amount`, `current_amount`.

`pair` is sorted as a `BASE/QUOTE` string.
`stop_price` is interpreted as `coalesce(stop_price_gte, stop_price_lte)`.
Ascending: NULLs first. Descending: NULLs last.

**Validation:**

* If both dates are provided and `start_date > end_date` → error.
* `page > 1000` → error.
* `page_size < 1` or `page_size > 100` → error.
* Missing filter fields are treated as "not provided".

**Successful response:**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "items": [ /* array of orders, see below */ ],
    "total": 94,
    "page": 1,
    "size": 10,
    "pages": 10
  }
}
```

**Example:**

```
{
  "jsonrpc":"2.0",
  "id":"1",
  "result":{
    "items":[
      {
        "id":"pRK4klVe",
        "price":"90000.00",
        "current_amount":"0.013577",
        "original_amount":"0.013577",
        "action":"sell",
        "pair":{"base":"BTC","quote":"USDT"},
        "status":"canceled",
        "type":"stop_limit",
        "create_date":"2025-10-08T13:37:11.792819Z",
        "market_total_original":null,
        "market_total_current":null,
        "stop_price_gte":null,
        "stop_price_lte":"100000.00",
        "total":"0.000000",
        "fee":"0",
        "commission_buy":"0.0001",
        "commission_sell":"0.0001",
        "weighted_average_price":null,
        "deals_amount":null
      }
      /* ...more items... */
    ],
    "total":94,
    "page":1,
    "size":10,
    "pages":10
  }
}
```

**Order fields in `items[]`:**

| Field | Type | Description |
| --- | --- | --- |
| id | string | Internal order ID. |
| price | string \| null | Limit price; `null` for market. |
| current_amount | string \| null | Remaining amount in BASE. May be `"0"` or `null` when fully filled. |
| original_amount | string | Original amount in BASE. |
| action | string | `buy` or `sell`. |
| pair.base / pair.quote | string | Base/quote tickers. |
| status | string | e.g. `completed`, `canceled`, etc. (terminal statuses possible here). |
| type | string | `market` \| `limit` \| `stop_limit`. |
| create_date | string | Creation timestamp (UTC, ISO-8601). |
| market_total_original | string \| null | For market orders: requested total, if provided. |
| market_total_current | string \| null | For market orders: actually spent/received in QUOTE. |
| stop_price_gte / stop_price_lte | string \| null | Stop conditions for stop_limit. |
| total | string \| null | Total in QUOTE (if applicable). |
| fee | string | Final fee in QUOTE. |
| commission_buy / commission_sell | string | Fee rates (fraction) applied to this order. |
| weighted_average_price | string \| null | VWAP in QUOTE across fills for this order. |
| deals_amount | string \| null | Total executed amount in BASE. |

#### 3.2.6 `get_balance`

**Purpose:**
Return spot wallet balances for the user (no fiat/valuation unless provided by the backend).

**Access:**
Private — requires `X-CITRO-*` headers and signature.

**Endpoint:**
POST <https://api.citronus.com/public/v1/jsonrpc>
**Content-Type:** `application/json; charset=utf-8`

**Minimal request:**

```
{
  "jsonrpc": "2.0",
  "method": "get_balance",
  "params": { "category": "spot" },
  "id": "1"
}
```

**With filters (coin, include null balances):**

```
{
  "jsonrpc": "2.0",
  "method": "get_balance",
  "params": {
    "category": "spot",
    "data": {
      "coin_name": "USDT",
      "include_null": "false"
    }
  },
  "id": "2"
}
```

**Parameters:**

| Field | Type | Required | Allowed values | Description |
| --- | --- | --- | --- | --- |
| category | string | yes | `spot` | Market type. Returns only spot balances. |
| data | object | no | — | Filter object (may be omitted). |
| data.coin_name | string \| null | no | e.g. `USDT` | Filter by coin ticker (case sensitivity follows backend rules). |
| data.include_null | string \| boolean \| null | no | `true/false` | Whether to include zero balances. Default is `false` (zero balances are hidden). |

**Behavior of `include_null`:**

* `false` (default): zero balances are hidden.
* If *all* balances are zero and `include_null=false`, result may be `[]`.

**Successful response:**
Returns an array of balance objects for `asset_type: "SPOT"` only.

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": [
    {
      "coin_name": "BTC",
      "asset_type": "SPOT",
      "in_orders": "0.0000",
      "available": "3.34588007",
      "total": "3.34588007"
    },
    {
      "coin_name": "CITRO",
      "asset_type": "SPOT",
      "in_orders": "1583.0000",
      "available": "99243.6960",
      "total": "100826.6960"
    },
    {
      "coin_name": "USDT",
      "asset_type": "SPOT",
      "in_orders": "132204.424000",
      "available": "581749.563085",
      "total": "713953.987085"
    }
  ]
}
```

**Balance fields:**

| Field | Type | Description |
| --- | --- | --- |
| coin_name | string | Coin ticker (e.g. `USDT`). |
| asset_type | string | Always `"SPOT"` for this method. |
| in_orders | string | Amount locked in open orders. |
| available | string | Free amount available to trade / withdraw. |
| total | string | `available + in_orders`. |

## 4\. Errors

Below are standard error codes/messages you may receive.

| code | message | When it happens | Methods |
| --- | --- | --- | --- |
| method_not_found | Method not found | `method` is missing or not a supported public method (`markets` / `tickers` / `orderbook` / `ohlcv`). | all |
| auth_required | Authorization required for this method | No or incomplete `X-CITRO-*` headers for a private method. | all private |
| invalid_signature | Invalid signature | Signature does not match `timestamp + api_key + recv_window + raw_body`. | all |
| invalid_params | Params for requested method are invalid | Missing/invalid fields in `params` / wrong `category` / wrong `symbol` / extra fields. | all |
| internal_server_error | Internal server error | Unexpected backend error (DB failure, timeout, etc.). | all |
| invalid_pair | Invalid pair | Trading pair (`symbol`) not supported. | create_order, cancel_all_orders, active_orders, orders_history |
| validation_error | Validation error | e.g. `start_date \\> end_date`, bad pagination values, precision/step violations, etc. | active_orders, orders_history, get_balance |
| page_out_of_range | page must be between 1 and 1000. | `page` is outside allowed range. | orders_history |
| page_size_out_of_range | page_size must be between 1 and 100. | `page_size` is outside allowed range. | orders_history |
| invalid_order_value | Invalid order value | Violated precision, tick size, min/max limits, etc. | create_order |
| not_found_coins_for_hold | Failed to determine funds to hold | Could not reserve required funds. | create_order |
| not_enough_amount | Insufficient balance | User balance is too low. | create_order |
| no_market_offers | No available market liquidity | `type = market` and there's no suitable liquidity. | create_order |
| order_not_found | Order not found | `order_id` does not exist. | cancel_order |
| order_already_fulfilled | Order already fulfilled | Attempted to cancel an already fully filled order. | cancel_order |
| order_already_canceled | Order already canceled | Attempted to cancel an already canceled order. | cancel_order |
| order_is_market | Market orders cannot be canceled | Tried to cancel a market order. | cancel_order |
| permission_denied | Order does not belong to this API key | Order belongs to a different API key / account. | cancel_order |
| rate_limited | Too many requests | Rate limit exceeded; server may respond with HTTP 429. | all |
| recv_window_expired | Request is expired | `abs(server_now_ms - X-CITRO-TIMESTAMP) \\> X-CITRO-RECV-WINDOW`. Usually caused by client clock drift or high latency. Sync your clock / increase window. | all |
| invalid_symbol | Invalid symbol | `tickers` / `orderbook` / `ohlcv`: symbol not supported. (For `ohlcv`, currently only `CITRO/USDT` is supported.) | tickers, orderbook, ohlcv |

## 5\. WebSocket API

### 5.1 Base WebSocket Endpoint

```
wss://api.citronus.com/public/ws/v1/
```

### 5.2 Authentication

* By default, some subscription methods are public (no auth).
* If a method is marked as "requires authentication", the client must send:
  * `api_key`
  * `timestamp`
  * `recv_window`
  * `sign`

The server validates these fields before executing the method.

### 5.3 Errors

The server can respond with standard error messages such as:

* `"Authentication failed"`
* `"Internal server error"`
* `"Invalid parameters"`
* `"[Service] client not available"`

Error codes:

* `4000` — generic method errors (`MethodError`)
* `4001` — invalid command parameters (`InvalidCommandParametersError`)
* `5000` — subscription errors (`SubscriptionError`)

### 5.4 Action Methods

#### `ping` (requires authentication)

**Name:** `PingMethod`
**Purpose:** Connection health check.
**Expected response:**

```
{ "response": "ping" }
```

### 5.5 Subscription Methods

#### 5.5.1 `subscribe.balance`

**Name:** `BalanceSubscribeMethod`
**Auth:** Required
**Purpose:** Subscribe to wallet balance updates.

**Parameters (`params`):**

* `asset` (string, required) — channel selector:
  * `SPOT` — aggregated listing of all spot wallet balances (snapshot).
  * `SPOT-<COIN>` — focused updates for a single coin, e.g. `SPOT-XRP`.

Note: In incoming updates, the top-level `params` field may look like
`"<account_id>_listings.SPOT"` for the listing, or
`"<account_id>_tickers.SPOT-<COIN>"` for a single coin.
This is the channel key (account-scoped). This is expected.

**Example request (full SPOT listing):**

```
{
  "command": "subscribe.balance",
  "params": { "asset": "SPOT" },
  "api_key": "<YOUR_API_KEY>",
  "timestamp": "1760623193880",
  "recv_window": "65000",
  "sign": "<HEX(HMAC_SHA256(secret, timestamp + api_key + recv_window + JSON(params+command)))>"
}
```

**ACK response:**

```
{
  "subscription_id": "6f34da71-f412-41a8-b721-335c1b4ae4b0",
  "response": "Subscribed to balance"
}
```

**Data stream — snapshot (array listing):**

```
{
  "subscription_id": "6f34da71-f412-41a8-b721-335c1b4ae4b0",
  "method": "subscribe.wallets",
  "params": "449_listings.SPOT",
  "data": {
    "data": [
      {
        "in_orders": "0.0000",
        "available": "0.00470443",
        "total": "0.00470443",
        "coin": {
          "name": "BTC",
          "display_name": "Bitcoin",
          "precision": 8,
          "icon": "https://…/coins/BTC.svg"
        },
        "equivalent": { "amount": "507.45", "currency": "USD" }
      },
      {
        "in_orders": "0.0000",
        "available": "0.01441560",
        "total": "0.01441560",
        "coin": {
          "name": "ETH",
          "display_name": "Ethereum",
          "precision": 8,
          "icon": "https://…/coins/ETH.svg"
        },
        "equivalent": { "amount": "56.66", "currency": "USD" }
      },
      {
        "in_orders": "0.0000",
        "available": "445.000000",
        "total": "445.000000",
        "coin": {
          "name": "USDT",
          "display_name": "Tether",
          "precision": 6,
          "icon": "https://…/coins/USDT.svg"
        },
        "equivalent": { "amount": "445.00", "currency": "USD" }
      }
    ]
  }
}
```

**Data stream — incremental updates:**

```
{
  "subscription_id": "6f34da71-f412-41a8-b721-335c1b4ae4b0",
  "method": "subscribe.wallets",
  "params": "449_listings.SPOT",
  "data": {
    "in_orders": "0.0000",
    "available": "0.00470443",
    "total": "0.00470443",
    "coin": {
      "name": "BTC",
      "display_name": "Bitcoin",
      "precision": 8,
      "icon": "https://…/coins/BTC.svg"
    },
    "equivalent": { "amount": "507.39", "currency": "USD" }
  }
}
```

**Per-coin request:**

```
{
  "command": "subscribe.balance",
  "params": { "asset": "SPOT-XRP" },
  "api_key": "<YOUR_API_KEY>",
  "timestamp": "1760623193880",
  "recv_window": "65000",
  "sign": "<HEX(HMAC_SHA256(secret, timestamp + api_key + recv_window + JSON(params+command)))>"
}
```

**Per-coin ACK:**

```
{
  "subscription_id": "faeaf93b-2858-4839-8aae-e438cf61279c",
  "response": "Subscribed to balance"
}
```

**Per-coin stream (XRP example):**

```
{
  "subscription_id": "faeaf93b-2858-4839-8aae-e438cf61279c",
  "method": "subscribe.wallets",
  "params": "449_tickers.SPOT-XRP",
  "data": {
    "balance": "0.000000",
    "coin_name": "XRP",
    "coin": {
      "name": "XRP",
      "display_name": "XRP",
      "precision": 6,
      "icon": "https://…/coins/XRP.svg"
    }
  }
}
```

**Notes / behavior:**

* This is a private subscription.
  The frame must be signed:

  ```
  sign = HMAC_SHA256(secret, timestamp + api_key + recv_window + pre_cmd_json)
  
  ```
* Incoming updates use `method: "subscribe.wallets"`.
  That's expected (it's the balance channel family).
* First message for `SPOT` is a snapshot array in `data.data`.
  After that you get incremental single-coin updates.
* For `SPOT-<COIN>` you only get that coin’s updates.
* Monetary values (`available`, `in_orders`, etc.) are strings. Use decimal math on the client.

#### 5.5.2 `subscribe.orderbook`

**Name:** `OrderBookSubscribeMethod`
**Auth:** Not required
**Purpose:** Subscribe to live order book updates.

**Parameters (`params`):**

* `symbol` (string, required) — trading pair in `BASE-QUOTE` format, e.g. `BTC-USDT`.
  Uppercase with dash.
* `interval` (string, required) — update frequency/stream code. See `INTERVALS`.

**INTERVALS examples:**

* `"100"` → 100 ms
* `"300"` → 300 ms
* `"500"` → 500 ms
* `"1"` → 1 second
* `"3"` → 3 seconds
* `"5"` → 5 seconds
* `"15"` → 15 seconds
* `"30"` → 30 seconds

**Request example:**

```
{
  "command": "subscribe.orderbook",
  "params": { "symbol": "BTC-USDT", "interval": "100" }
}
```

**ACK:**

```
{
  "subscription_id": "6def89c9-e983-4de2-81d7-ba441892da60",
  "response": "Subscribed to order book"
}
```

**Data stream example:**

```
{
  "subscription_id": "6def89c9-e983-4de2-81d7-ba441892da60",
  "method": "subscribe.orderbook",
  "params": "BTC-USDT_100",
  "data": {
    "topic": "orderbook.1.BTC-USDT",
    "type": "snapshot",               // later messages may use "delta"
    "ts": 1760617081,                 // Unix seconds
    "hmts": "2025-10-16 12:18:01",    // human-readable timestamp
    "data": {
      "s": "BTC-USDT",
      "a": [["111712.13","50.00000000"], ["111697.03","4.47852061"]],
      "b": [["111555.66","50.00000000"], ["111575.09","5.00000000"]],
      "lp": "111632.00",
      "ts": 1760617081
    }
  }
}
```

**Field format:**

* All numeric values in the order book arrays are strings.
* `a` = asks `[price, size]`, best first.
* `b` = bids `[price, size]`, best first.
* `s` = symbol (BASE-QUOTE).
* `lp` = last price.
* `ts` = Unix seconds.
* `hmts` = human-readable timestamp.
* The top-level `params` in updates is `"<SYMBOL>_<INTERVAL>"`.
* `data.topic` can look like `orderbook.<code>.<SYMBOL>`, where `<code>` is an internal channel code and may not match `interval` literally.

#### 5.5.3 `subscribe.klines`

**Name:** `KlinesSubscribeMethod`
**Auth:** Not required
**Purpose:** Subscribe to kline (candlestick) data.

**Parameters (`params`):**

* `symbol` (string, required) — e.g. `BTCUSDT`.
* `interval` (string, required) — timeframe code.

**INTERVALS examples (chart timeframes):**

* `"1"` → 1 minute
* `"3"` → 3 minutes
* `"5"` → 5 minutes
* `"15"` → 15 minutes
* `"30"` → 30 minutes
* `"60"` → 1 hour
* `"120"` → 2 hours
* `"240"` → 4 hours
* `"360"` → 6 hours
* `"720"` → 12 hours
* `"1440"` → 86400 seconds (24h)
* `"D"` → 1 day
* `"W"` → 1 week
* `"M"` → 1 month

**Request example:**

```
{
  "command": "subscribe.klines",
  "params": { "symbol": "BTCUSDT", "interval": "1" }
}
```

**ACK:**

```
{
  "subscription_id": "b7570450-401a-41bc-8cf2-458a086b0940",
  "response": "Subscribed to klines"
}
```

**Data stream example:**

```
{
  "subscription_id": "b7570450-401a-41bc-8cf2-458a086b0940",
  "method": "subscribe.klines",
  "params": "BTCUSDT_1",
  "data": {
    "type": "snapshot",
    "topic": "kline.1.BTCUSDT",
    "data": [{
      "start": 1760613360000,
      "end": 1760613419999,
      "interval": "1",
      "open": "111435.4",
      "close": "111410.7",
      "high": "111468",
      "low": "111402.2",
      "volume": "2.104702",
      "turnover": "234565.1162144",
      "confirm": false,
      "timestamp": 1760613392515
    }],
    "ts": 1760613392515
  }
}
```

Each element in `data.data` is one OHLCV candle:

* `start` (integer, ms) — candle start time (Unix ms, UTC).
* `end` (integer, ms) — candle end time (Unix ms, UTC). Whether `end` is inclusive/exclusive depends on backend; treat it as the boundary.
* `interval` (string) — the requested timeframe.
* `open` (string) — open price.
* `close` (string) — close price (or current price if candle not closed).
* `high` (string) — high price of the interval.
* `low` (string) — low price of the interval.
* `volume` (string) — traded volume in BASE.
* `turnover` (string) — traded notional in QUOTE.
* `confirm` (boolean):
  * `false` → candle is still forming (values may change),
  * `true` → candle is closed and final.
* `timestamp` (integer, ms) — server timestamp for this candle snapshot.
* All numeric-looking values are sent as strings. Use high-precision decimal math.

#### 5.5.4 `subscribe.tickers`

**Name:** `TickersSubscribeMethod`
**Auth:** Required
**Purpose:** Subscribe to ticker updates for a specific trading pair.

**Parameters (`params`):**

* `asset` (string, required) — trading pair in `BASE/QUOTE` format, e.g. `CITRO/USDT`.

Notes:

* Other formats (e.g. `SPOT-BTC` or just `BTC`) are not supported here.
* Incoming updates will return:
  * `method: "subscribe.coins"`
  * `params`: the pair string (e.g. `"CITRO/USDT"`)
    This is expected.

**Request example:**

```
{
  "command": "subscribe.tickers",
  "params": { "asset": "CITRO/USDT" },
  "api_key": "<YOUR_API_KEY>",
  "timestamp": "1760623193880",
  "recv_window": "65000",
  "sign": "<HEX(HMAC_SHA256(secret, timestamp + api_key + recv_window + JSON(params+command))>"
}
```

**ACK:**

```
{
  "subscription_id": "c45df69d-a275-4467-92ac-900e9daad5d5",
  "response": "Subscribed to tickers"
}
```

**Data stream example:**

```
{
  "subscription_id": "c45df69d-a275-4467-92ac-900e9daad5d5",
  "method": "subscribe.coins",
  "params": "CITRO/USDT",
  "data": {
    "symbol": "CITRO/USDT",
    "last_price": "999.00000",
    "volume_24h": "0.02202",
    "change_24h": "0.00",
    "high_24h": "999.00000",
    "low_24h": "999.00000",
    "price_direction": "UP"
  }
}
```

**Ticker fields:**

* All numeric values (`last_price`, `volume_24h`, `change_24h`, `high_24h`, `low_24h`) are strings.
  Use decimals.
* `symbol` — echoed `BASE/QUOTE` pair.
* `price_direction` — direction indicator such as `"UP"`.

**Behavior / notes:**

* This is a private subscription.
  The frame must be signed:

  ```
  sign = HMAC_SHA256(secret, timestamp + api_key + recv_window + pre_cmd_json)
  
  ```
* Works only if `asset` is in `BASE/QUOTE` format. Other formats will not produce a working stream.

## 6\. Rate Limits

The API enforces rate limits to protect service stability.

### 6.1 Default limits

* Baseline: \~5 requests per second per API key.
* Short bursts: allowed briefly up to \~5 extra requests above baseline.
* If you exceed limits, some requests may be slowed or rejected with HTTP `429 Too Many Requests`.

### 6.2 How to detect throttling

* You receive HTTP `429 Too Many Requests`.
* No additional headers like `Retry-After` are guaranteed.

### 6.3 Client recommendations

* Design your client to stay under 5 rps per API key in steady state.
* On `429`, back off briefly (e.g. 1–2 seconds).
* Spread your bursts instead of firing all requests at once.
* Remember: parallel requests and batched JSON-RPC requests still count toward rate limits.