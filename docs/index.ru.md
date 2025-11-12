# Citronus API — JSON-RPC + WebSocket (v1)

**Версия:** 1
**Дата:** 23 октября 2025
**Хост:** `https://api.citronus.com`

## 1. Базовая HTTP‑точка входа

**Метод**
`POST`

**URL**
`https://api.citronus.com/public/v1/jsonrpc`

**Протокол**
JSON-RPC 2.0

**Content-Type**
`application/json`

### 1.1 Что такое JSON‑RPC

JSON‑RPC — это лёгкий RPC‑протокол поверх HTTP, где и запрос, и ответ — JSON‑объекты.
Запрос включает:

* имя метода,
* параметры,
* и необязательный `id`.

Ответ содержит либо `result`, либо `error`.
Справка: [https://www.jsonrpc.org/specification](https://www.jsonrpc.org/specification)

### 1.2 Формат запроса

`id` необязателен. Если указываете — используйте строку (например, `"1"`).

```
{
  "jsonrpc": "2.0",
  "method": "<method_name>",
  "params": { "<param>": "<value>" },
  "id": "<request_id>"
}
```

### 1.3 Формат ответа

Успешный ответ:

```
{
  "jsonrpc": "2.0",
  "result": { "<key>": "<value>" },
  "id": "<request_id>"
}
```

Ответ с ошибкой:

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

## 2. Аутентификация и подпись

### 2.1 Режимы доступа

* **Публичные методы** — не требуют API‑ключей. Их можно вызывать вообще без auth‑заголовков.
* **Приватные методы** — требуют аутентификации через API‑заголовки и подпись HMAC.

Примечание: Публичные методы примут запрос даже если вы отправите «пустые» или «частичные» auth‑заголовки.
Для приватных методов корректные заголовки и валидная подпись обязательны.

### 2.2 Получение API‑ключей

В интерфейсе:
`Settings → API Management → Create new key`

Вы получите:

* **API Key** — публичный идентификатор.
* **API Secret** — секретный ключ (храните только у себя, безопасно).

### 2.3 Обязательные заголовки (для приватных методов)

```
X-CITRO-API-KEY: <your API key>
X-CITRO-TIMESTAMP: <unix_ms>
X-CITRO-RECV-WINDOW: <ms>
X-CITRO-SIGNATURE: <hex>
```

Где:

* `X-CITRO-TIMESTAMP` — ваш клиентский таймстамп в миллисекундах Unix (UTC).
  Пример: `1759308923000`
* `X-CITRO-RECV-WINDOW` — допустимое «окно приёма» в мс (например, `"5000"` или `"15000"`).
  Если `|server_now_ms - X-CITRO-TIMESTAMP| > X-CITRO-RECV-WINDOW`, запрос отклоняется.
* `X-CITRO-API-KEY` — ваш API‑ключ.
* `X-CITRO-SIGNATURE` — подпись HMAC (см. ниже).

Публичные методы можно вызывать **без** каких‑либо auth‑заголовков.

### 2.4 Расчёт подписи

Подпись — это HMAC‑SHA256 по конкатенации:

```
message = <timestamp><api_key><recv_window><body_raw>
signature = HEX( HMAC_SHA256( key = api_secret, message = message ) )
```

Где:

* `<timestamp>` — то же значение, что в `X-CITRO-TIMESTAMP` (строка, мс).
* `<api_key>` — то же, что в `X-CITRO-API-KEY`.
* `<recv_window>` — то же, что в `X-CITRO-RECV-WINDOW` (строка, напр. `"5000"`).
* `<body_raw>` — **точные** байты JSON‑тела запроса, которые вы отправите по HTTP, без изменений.
* `api_secret` — ваш секретный ключ.

⚠ Важно: подписывайте именно те байты, которые реально отправляете.
Любые изменения пробелов, порядка ключей и т.п. меняют подпись.

### 2.5 Пример на Python (requests)

```
import json, requests, time, hmac, hashlib
from typing import Dict

URL = "https://api.citronus.com/public/v1/jsonrpc"
API_KEY = "<YOUR_API_KEY>"
API_SECRET = "<YOUR_API_SECRET>"

def build_api_key_auth_headers(api_key: str, api_secret: str, req_body: str) -> Dict[str, str]:
    ts = str(int(time.time() * 1000))
    recv_window = "5000"

    # подпись по сырым байтам тела:
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

# ВАЖНО: separators=(",", ":") чтобы избежать пробелов, меняющих подпись
req_body = json.dumps(body, separators=(",", ":"), ensure_ascii=False)

headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    **build_api_key_auth_headers(API_KEY, API_SECRET, req_body),
}

resp = requests.post(URL, headers=headers, data=req_body.encode("utf-8"), timeout=15)
print(resp.status_code, resp.text)
```

### 2.6 Пример на JavaScript (Node ≥18 / fetch)

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

const raw = JSON.stringify(body); // ровно это тело вы отправляете
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

### 2.7 Примеры cURL (без подписи, публичные)

Публичные методы не требуют заголовков аутентификации.

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

### 2.8 Валидация времени

Сервер проверяет:

```
| server_now_ms - X-CITRO-TIMESTAMP | <= X-CITRO-RECV-WINDOW
```

Если рассинхрон часов + сетевые задержки превышают окно — запрос отклоняется.

Типичные ошибки:

* `invalid_signature` — проверьте порядок/значения конкатенации.
* `recv_window_expired` / `invalid_timestamp` — синхронизируйте часы или увеличьте `X-CITRO-RECV-WINDOW`.
* `internal_server_error` — неожиданная ошибка бэкенда.

Полный справочник ошибок — дальше в документе.

---

## 3. SPOT — методы JSON‑RPC

### 3.1 Публичные методы

#### 3.1.1 `markets`

**Назначение:**
Вернуть доступные торговые пары и их параметры.

**Доступ:**
Публичный (без аутентификации)

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Протокол:**
JSON‑RPC 2.0

**Content-Type:**
`application/json`

**Тело запроса (все spot‑пары):**

```
{
  "jsonrpc": "2.0",
  "method": "markets",
  "params": { "category": "spot" },
  "id": "1"
}
```

**Тело запроса (фильтр по символу, опционально):**

```
{
  "jsonrpc": "2.0",
  "method": "markets",
  "params": { "category": "spot", "symbol": "BTC/USDT" },
  "id": "1"
}
```

**Параметры:**

| Поле     | Тип    | Обяз. | Допустимые значения | Описание                                                                 |
| -------- | ------ | ----- | ------------------- | ------------------------------------------------------------------------ |
| category | string | да    | `spot`              | Тип рынка.                                                               |
| symbol   | string | нет   | напр. `BTC/USDT`    | Фильтр по конкретной паре. Если не указан — вернутся все пары категории. |

**Пример успешного ответа:**

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

**Справочник полей:**

| Поле                           | Тип    | Описание                                               |
| ------------------------------ | ------ | ------------------------------------------------------ |
| `jsonrpc`                      | string | Версия JSON‑RPC (`"2.0"`).                             |
| `id`                           | string | Эхо‑идентификатор запроса.                             |
| `result.symbol`                | string | Пара в формате `BASE/QUOTE` (напр. `BTC/USDT`).        |
| `result.base_coin.name`        | string | Тикер базового актива (BASE).                          |
| `result.base_coin.precision`   | number | Разрядность (знаков после запятой) для количеств BASE. |
| `result.quote_coin.name`       | string | Тикер котируемой валюты (QUOTE).                       |
| `result.quote_coin.precision`  | number | Разрядность для QUOTE (цены/нотионал).                 |
| `result.icon`                  | string | URL иконки актива.                                     |
| `result.min_order_qty`         | string | Мин. размер ордера в BASE.                             |
| `result.max_order_qty`         | string | Макс. размер ордера в BASE.                            |
| `result.min_order_amt`         | string | Мин. нотионал в QUOTE.                                 |
| `result.max_order_amt`         | string | Макс. нотионал в QUOTE.                                |
| `result.quote_tick_size`       | string | Минимальный шаг цены в QUOTE.                          |
| `result.limit_parameter`       | string | Параметр допустимого отклонения для лимитных ордеров.  |
| `result.commission_*`          | string | Ставки комиссий (доля).                                |
| `result.trade_base_precision`  | number | Макс. знаков после запятой в количестве (BASE).        |
| `result.trade_quote_precision` | number | Макс. знаков после запятой в цене/нотионале (QUOTE).   |

#### 3.1.2 `tickers`

**Назначение:**
Вернуть тикер по инструменту (last‑price, 24h‑статы).

**Доступ:**
Публичный

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Запрос:**

```
{
  "jsonrpc": "2.0",
  "method": "tickers",
  "params": { "category": "spot", "symbol": "BTC/USDT" },
  "id": "1"
}
```

**Параметры:**

| Поле     | Тип    | Обяз. | Допустимые       | Описание       |
| -------- | ------ | ----- | ---------------- | -------------- |
| category | string | да    | `spot`           | Тип рынка.     |
| symbol   | string | да    | напр. `BTC/USDT` | Торговая пара. |

**Пример успешного ответа:**

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

**Справочник полей:**

| Поле            | Тип    | Описание                                                                      |
| --------------- | ------ | ----------------------------------------------------------------------------- |
| symbol          | string | Пара в формате `BASE/QUOTE`.                                                  |
| last_price      | string | Последняя цена сделки/квота (в QUOTE).                                        |
| volume_24h      | string | 24h‑объём, обычно в BASE. Если иначе — будет оговорено для конкретного рынка. |
| change_24h      | string | Изменение цены за 24ч, проценты, напр. `"1.31"` = +1,31%.                     |
| high_24h        | string | 24h‑максимум.                                                                 |
| low_24h         | string | 24h‑минимум.                                                                  |
| price_direction | string | Направление относительно предыдущего тика, напр. `"UP"`/`"DOWN"`.             |

#### 3.1.3 `orderbook`

**Назначение:**
Вернуть текущий стакан по паре.

**Доступ:**
Публичный

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Запрос:**

```
{
  "jsonrpc": "2.0",
  "method": "orderbook",
  "params": { "category": "spot", "symbol": "BTC/USDT" },
  "id": "1"
}
```

**Параметры:**

| Поле     | Тип    | Обяз. | Допустимые       | Описание       |
| -------- | ------ | ----- | ---------------- | -------------- |
| category | string | да    | `spot`           | Тип рынка.     |
| symbol   | string | да    | напр. `BTC/USDT` | Торговая пара. |

Примечание: в ответе символ может приходить в формате `BASE-QUOTE` (напр. `BTC-USDT`). Это норма.

**Пример успешного ответа:**

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

**Справочник полей:**

| Поле | Тип                     | Описание                                                                                             |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| s    | string                  | Символ `BASE-QUOTE` (напр. `BTC-USDT`).                                                              |
| a    | array<[string, string]> | Аски. Каждый элемент — `\[price, size\]`, где `price` в QUOTE, `size` в BASE. Лучшие цены — первыми. |
| b    | array<[string, string]> | Биды. Тот же формат, лучшие — первыми.                                                               |
| ts   | number                  | Серверный таймстамп в секундах (Unix, UTC; дробная часть допустима).                                 |

Все `price`/`size` — строки.
`price` использует `quote_tick_size` из `markets`.
`size` соблюдает `base_coin.precision` из `markets`.

#### 3.1.4 `ohlcv`

**Назначение:**
Вернуть свечи OHLCV для символа и таймфрейма.

**Доступ:**
Публичный

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)
**Content-Type:** `application/json; charset=utf-8`

⚠ Сейчас метод работает только для символа `CITRO/USDT`.
Другие символы вернут `invalid_symbol`.

**Минимальный запрос:**

```
{
  "jsonrpc": "2.0",
  "method": "ohlcv",
  "params": { "category": "spot", "symbol": "CITRO/USDT", "interval": "1D", "data": {} },
  "id": "1"
}
```

**С окном по времени + limit:**

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

**Параметры:**

| Поле       | Где    | Тип            | Обяз. | Допустимые         | Описание                                             |
| ---------- | ------ | -------------- | ----- | ------------------ | ---------------------------------------------------- |
| category   | params | string         | да    | `spot`             | Тип рынка.                                           |
| symbol     | params | string         | да    | напр. `CITRO/USDT` | Пара. Сейчас поддерживается только `CITRO/USDT`.     |
| interval   | params | string         | да    | см. ниже           | Таймфрейм свечи.                                     |
| data       | params | object         | да    | —                  | Доп. параметры (может быть `{}`).                    |
| data.start | data   | integer | null | нет   | Unix ms (UTC)      | Начало (включительно).                               |
| data.end   | data   | integer | null | нет   | Unix ms (UTC)      | Конец (включительно).                                |
| data.limit | data   | integer        | нет   | по умолч. 200      | Макс. кол‑во свечей (может ограничиваться бэкендом). |

**Поддерживаемые интервалы (примеры):**

* `"1m"` — 1 минута
* `"5m"` — 5 минут
* `"15m"` — 15 минут
* `"1h"` — 1 час
* `"4h"` — 4 часа
* `"1D"` — 1 день
* `"1W"` — 1 неделя
* `"1M"` — 1 месяц

(Бэкенд может также поддерживать строковые минуты `"1"`, `"3"`, `"60"` и т.п.; в проде задокументируйте точный список.)

**Формат успешного ответа:**

Возвращается массив свечей.
Каждая свеча — массив из 6 элементов:

```
[
  [ timestamp_ms, open, high, low, close, volume ],
  ...
]
```

Где:

* `timestamp_ms` — строка с Unix‑временем в мс (UTC).
* `open`, `high`, `low`, `close`, `volume` — числовые значения в виде строк.
* Сортировка по возрастанию времени.
* Если данных нет — `[]`.

**Пример:**

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

### 3.2 Приватные методы

#### 3.2.1 `create_order`

**Назначение:**
Создать ордер (market / limit / stop_limit) на спот‑рынке.

**Доступ:**
Приватный — требуются заголовки `X-CITRO-*` и валидная HMAC‑подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)
**Content-Type:** `application/json; charset=utf-8`

**Запрос (верхний уровень):**

```
{
  "jsonrpc": "2.0",
  "method": "create_order",
  "params": { "category": "spot", "data": { /* см. ниже */ } },
  "id": "1"
}
```

**Примеры `data` (порядок полей не обязателен):**

Маркет‑ордер (ТОЛЬКО `amount` в BASE ИЛИ `total` в QUOTE; отправляете одно из двух):

```
{ "symbol": "BTC/USDT", "action": "buy",  "type": "market", "amount": "0.1" }
{ "symbol": "BTC/USDT", "action": "sell", "type": "market", "total":  "100"  }
```

Лимитный ордер (обязан включать `price`; отправляете ТОЛЬКО `amount` ИЛИ `total`):

```
{ "symbol": "BTC/USDT", "action": "buy",  "type": "limit", "price": "65000", "amount": "0.1" }
{ "symbol": "BTC/USDT", "action": "sell", "type": "limit", "price": "65000", "total":  "1000" }
```

Стоп‑лимит (обязан включать `price` и `stop_price`; отправляете ТОЛЬКО `amount` ИЛИ `total`):

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

**Параметры (`params` / `data`):**

| Поле            | Тип             | Обяз.?         | Допустимые                        | Описание                                      |
| --------------- | --------------- | -------------- | --------------------------------- | --------------------------------------------- |
| category        | string          | да             | `spot`                            | Тип рынка.                                    |
| data            | object          | да             | —                                 | Описание ордера.                              |
| data.symbol     | string          | да             | напр. `BTC/USDT`                  | Торговая пара.                                |
| data.action     | string          | да             | `buy` | `sell`                    | Сторона.                                      |
| data.type       | string          | да             | `market` | `limit` | `stop_limit` | Тип ордера.                                   |
| data.amount     | string | number | условно        | >0                                | Количество в BASE. Взаимоисключимо с `total`. |
| data.total      | string | number | условно        | >0                                | Нотионал в QUOTE. Взаимоисключимо с `amount`. |
| data.price      | string | number | для limit/stop | >0                                | Лимитная цена в QUOTE.                        |
| data.stop_price | string | number | для stop_limit | >0                                | Триггер стопа. Обычно: ≥ для buy, ≤ для sell. |

**Важно:**

* Лимит на открытые ордера: не более 100 одновременно на аккаунт.
* Отправляйте **либо** `amount`, **либо** `total` — не оба сразу.
* Пропуск обоих — ошибка.
* Для `market`:

  * Если указан `amount`, `total` вычислится по исполнению.
  * Если указан `total`, система рассчитает `amount` по доступной ликвидности.
* Для `limit` — используется ваша `price` напрямую.
* Для `stop_limit`:

  * `stop_price` — триггер.
  * После срабатывания становится обычным лимитным ордером по `price`.

**Проверки валидации:**

* `symbol` должен существовать в `markets(category="spot")`.
* `price` должен соответствовать `quote_tick_size` и `trade_quote_precision`.
* `amount` должен соответствовать `trade_base_precision`.
* Мин/макс проверки используют `min_order_qty` / `max_order_qty` и/или `min_order_amt` / `max_order_amt`.
* Комиссии берутся из `commission_*` полей `markets`.

**Пример запроса (market SELL по amount):**

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

**Пример запроса (limit BUY по total):**

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

**Пример запроса (stop-limit SELL по amount):**

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

**Пример успешного ответа (market SELL):**

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

##### Пакетные запросы

JSON‑RPC 2.0 позволяет отправлять массив запросов в одном HTTP‑вызове.

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

Правила:

* До 10 ордеров в одном батче.
* Аутентификация: те же заголовки `X-CITRO-*` + подпись, как для одиночного запроса, но подпись покрывает **весь** сырой payload массива.
* Не атомарно: каждый элемент обрабатывается отдельно. Часть может выполниться, часть — упасть с ошибкой.
* Порядок ответов может отличаться. Сопоставляйте по `id`.
* Используйте уникальные `id` для каждого элемента.

**Пример ответа на батч:**

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

**Поля результата ордера:**

| Поле                            | Тип           | Описание                                                                                                                              |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| id                              | string        | Внутренний ID ордера.                                                                                                                 |
| price                           | string | null | Лимитная цена; `null` для market.                                                                                                     |
| current_amount                  | string        | Оставшееся неисполненное количество (BASE). `"0"` — полностью исполнен.                                                               |
| original_amount                 | string        | Изначальный размер ордера (BASE).                                                                                                     |
| action                          | string        | `"buy"` или `"sell"`.                                                                                                                 |
| pair.base / pair.quote          | string        | Тикеры BASE/QUOTE.                                                                                                                    |
| status                          | string        | Статус: `created`, `placed`, `in_order_book`, `partially_fulfilled`, `completed`, `fulfilled`, `canceled`, `marked_for_cancel` и т.п. |
| type                            | string        | `market` | `limit` | `stop_limit`.                                                                                                    |
| create_date                     | string        | Время создания (UTC, ISO‑8601).                                                                                                       |
| market_total_original           | string | null | Запрошенный нотионал для market (если был).                                                                                           |
| market_total_current            | string | null | Фактически потрачено/получено в QUOTE для market.                                                                                     |
| stop_price_gte / stop_price_lte | string | null | Триггеры для stop_limit.                                                                                                              |
| total                           | string | null | Нотионал в QUOTE.                                                                                                                     |
| fee                             | string        | Комиссия по ордеру в QUOTE.                                                                                                           |

Для `stop_limit`:

* Для `buy` — условие будет в `stop_price_gte`.
* Для `sell` — в `stop_price_lte`.

#### 3.2.2 `cancel_order`

**Назначение:**
Отменить один существующий ордер.

**Доступ:**
Приватный — требуются заголовки `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)
**Content-Type:** `application/json; charset=utf-8`

**Запрос:**

```
{
  "jsonrpc": "2.0",
  "method": "cancel_order",
  "params": { "category": "spot", "order_id": "pRK4klVe" },
  "id": "1"
}
```

**Параметры:**

| Поле     | Тип    | Обяз. | Допустимые | Описание                     |
| -------- | ------ | ----- | ---------- | ---------------------------- |
| category | string | да    | `spot`     | Тип рынка.                   |
| order_id | string | да    | string     | ID ордера из `create_order`. |

**Успешный ответ:**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": null
}
```

**Поведение / заметки:**

* Отменяемые статусы: `created`, `placed`, `in_order_book`, `partially_fulfilled`.

  * Незаполненный остаток будет освобождён.
* Терминальные статусы нельзя отменить: `fulfilled` / `completed`, `canceled`.

  * `order_already_fulfilled` — уже полностью исполнен.
  * `order_already_canceled` — уже отменён.
* `marked_for_cancel`: повторный вызов идемпотентен → снова вернётся успех.
* Маркет‑ордера нельзя отменить. Попытка отмены вернёт `order_is_market`.
* Стоп‑лимиты можно отменять до триггера ИЛИ после, пока статус отменяемый и есть остаток.
* Проверка прав: если ордер не принадлежит вашему API‑ключу → `permission_denied` / аналогичная.

#### 3.2.3 `cancel_all_orders`

**Назначение:**
Отменить все активные ордера пользователя на споте (идемпотентно).

**Доступ:**
Приватный — требуются заголовки `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Запрос (все пары):**

```
{
  "jsonrpc": "2.0",
  "method": "cancel_all_orders",
  "params": { "category": "spot" },
  "id": "1"
}
```

**Запрос (только одна пара):**

```
{
  "jsonrpc": "2.0",
  "method": "cancel_all_orders",
  "params": { "category": "spot", "symbol": "CITRO/USDT" },
  "id": "1"
}
```

**Параметры:**

| Поле     | Где    | Тип    | Обяз. | Допустимые         | Описание                                              |
| -------- | ------ | ------ | ----- | ------------------ | ----------------------------------------------------- |
| category | params | string | да    | `spot`             | Тип рынка.                                            |
| symbol   | params | string | нет   | напр. `CITRO/USDT` | Если указано — отменяются ордера только по этой паре. |

**Успешный ответ:**
Возвращает массив ID ордеров, которые были отменены.
Если активных не было → `[]`.

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": ["pRK4klVe", "pRK5klVe", "pRK6klVe"]
}
```

**Поведение / заметки:**

* Отменяемые статусы: `created`, `placed`, `in_order_book`, `partially_fulfilled`.
* Остаток освобождается.
* Терминальные (`fulfilled` / `completed`, `canceled`) не отменяются:

  * `order_already_fulfilled`
  * `order_already_canceled`
* `marked_for_cancel`: повторные вызовы идемпотентны.
* Маркет‑ордера (`type = market`) не отменяются (`order_is_market`).
* Стоп‑лимиты можно отменять и до триггера, и после — если статус ещё отменяем и есть остаток.

#### 3.2.4 `active_orders`

**Назначение:**
Вернуть *активные* ордера пользователя: новые, размещённые, в книге, частично исполненные, ожидающие стоп‑триггер и т.д.

**Доступ:**
Приватный — требуются заголовки `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Минимальный запрос:**

```
{
  "jsonrpc": "2.0",
  "method": "active_orders",
  "params": { "category": "spot", "data": {} },
  "id": "1"
}
```

**С фильтрами и сортировкой:**

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

**Параметры:**

| Поле            | Тип           | Обяз. | Допустимые / формат | Описание                                           |
| --------------- | ------------- | ----- | ------------------- | -------------------------------------------------- |
| category        | string        | да    | `spot`              | Тип рынка.                                         |
| data            | object        | да    | —                   | Объект фильтров (может быть `{}`).                 |
| data.start_date | string | null | нет   | `YYYY-MM-DD`        | Нижняя граница `create_date` (UTC), включительно.  |
| data.end_date   | string | null | нет   | `YYYY-MM-DD`        | Верхняя граница `create_date` (UTC), включительно. |
| data.order_by   | string | null | нет   | см. ниже            | Правило сортировки.                                |
| data.symbol     | string | null | нет   | напр. `BTC/USDT`    | Фильтр по паре.                                    |

**Сортировка (`order_by`):**

* Без префикса → по возрастанию.
* Префикс `-` → по убыванию.
* Разрешённые поля сортировки:

  * `create_date`
  * `price`
  * `pair`
  * `stop_price`
  * `original_amount`
  * `current_amount`

`pair` сортируется лексикографически как строка `BASE/QUOTE`.
`stop_price` трактуется как `coalesce(stop_price_gte, stop_price_lte)`.
`nulls last`: `null`‑значения всегда в конце (и для asc, и для desc).

**Валидация:**

* Отсутствующие поля фильтров воспринимаются как «не указаны».

**Успешный ответ:**
Возвращает массив (возможно пустой `[]`) активных ордеров.

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

**Поля ордера:**

| Поле                             | Тип           | Описание                                                     |
| -------------------------------- | ------------- | ------------------------------------------------------------ |
| id                               | string        | Внутренний ID ордера.                                        |
| price                            | string | null | Лимитная цена. `null` для market.                            |
| current_amount                   | string        | Остаток (BASE).                                              |
| original_amount                  | string        | Исходное количество (BASE).                                  |
| action                           | string        | `buy` / `sell`.                                              |
| pair.base / pair.quote           | string        | Тикеры BASE / QUOTE.                                         |
| status                           | string        | Статус, напр. `created`, `placed`, `partially_filled` и т.п. |
| type                             | string        | `market` | `limit` | `stop_limit`.                           |
| create_date                      | string        | Время создания (UTC, ISO‑8601).                              |
| market_total_original            | string | null | Запрошенный нотионал для `market` (если был).                |
| market_total_current             | string | null | Фактически потрачено/получено (market).                      |
| stop_price_gte / stop_price_lte  | string | null | Триггеры для stop_limit.                                     |
| total                            | string | null | Нотионал (QUOTE).                                            |
| fee                              | string        | Комиссия (QUOTE).                                            |
| commission_buy / commission_sell | string        | Ставки комиссий (доли) для инструмента.                      |
| weighted_average_price           | string | null | Взвешенная средняя цена исполнения (QUOTE).                  |
| deals_amount                     | string | null | Итого исполнено (BASE).                                      |

#### 3.2.5 `orders_history`

**Назначение:**
Пагинированная история ордеров.

**Доступ:**
Приватный — требуются `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)
**Content-Type:** `application/json; charset=utf-8`

**Минимальный запрос (рекомендуем ВСЕГДА передавать `"history": "true"`):**

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

**С фильтрами и сортировкой:**

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

**Параметры:**

| Поле            | Тип              | Обяз.      | Допустимые / диапазон | Описание                                           |
| --------------- | ---------------- | ---------- | --------------------- | -------------------------------------------------- |
| category        | string           | да         | `spot`                | Тип рынка.                                         |
| page            | integer | string | да         | `1..1000`             | Номер страницы (по умолч. `1`).                    |
| page_size       | integer | string | да         | `1..100`              | Размер страницы (по умолч. `50`).                  |
| data            | object           | нет        | —                     | Фильтры (может быть `{}`).                         |
| data.start_date | string | null    | нет        | `YYYY-MM-DD`          | Нижняя граница `create_date` (UTC), включительно.  |
| data.end_date   | string | null    | нет        | `YYYY-MM-DD`          | Верхняя граница `create_date` (UTC), включительно. |
| data.order_by   | string | null    | нет        | см. ниже              | Правило сортировки.                                |
| data.symbol     | string | null    | нет        | напр. `BTC/USDT`      | Фильтр по паре.                                    |
| data.history    | string | boolean | желательно | `"true"`              | Должно быть `"true"` для полной истории.           |

**Сортировка (`order_by`):**

* Без префикса → по возрастанию.
* Префикс `-` → по убыванию.
* Разрешённые поля:
  `create_date`, `price`, `pair`, `stop_price`, `total`, `original_amount`, `current_amount`.

`pair` сортируется как строка `BASE/QUOTE`.
`stop_price` трактуется как `coalesce(stop_price_gte, stop_price_lte)`.
По возрастанию: NULL‑значения первыми. По убыванию: NULL‑значения последними.

**Валидация:**

* `page > 1000` → ошибка.
* `page_size < 1` или `page_size > 100` → ошибка.
* Отсутствующие поля фильтров воспринимаются как «не указаны».

**Успешный ответ:**

```
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "items": [ /* массив ордеров, см. ниже */ ],
    "total": 94,
    "page": 1,
    "size": 10,
    "pages": 10
  }
}
```

**Пример:**

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
      /* ...ещё элементы... */
    ],
    "total":94,
    "page":1,
    "size":10,
    "pages":10
  }
}
```

**Поля ордера в `items[]`:**

| Поле                             | Тип           | Описание                                                                         |
| -------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| id                               | string        | Внутренний ID ордера.                                                            |
| price                            | string | null | Лимитная цена; `null` для market.                                                |
| current_amount                   | string | null | Оставшееся количество в BASE. Может быть `"0"` или `null` при полном исполнении. |
| original_amount                  | string        | Исходное количество в BASE.                                                      |
| action                           | string        | `buy` или `sell`.                                                                |
| pair.base / pair.quote           | string        | Тикеры BASE/QUOTE.                                                               |
| status                           | string        | В т.ч. терминальные: `completed`, `canceled` и т.п.                              |
| type                             | string        | `market` | `limit` | `stop_limit`.                                               |
| create_date                      | string        | Время создания (UTC, ISO‑8601).                                                  |
| market_total_original            | string | null | Для market: запрошенный нотионал, если был.                                      |
| market_total_current             | string | null | Для market: фактически потрачено/получено (QUOTE).                               |
| stop_price_gte / stop_price_lte  | string | null | Условия стоп‑триггера (stop_limit).                                              |
| total                            | string | null | Нотионал в QUOTE (если применимо).                                               |
| fee                              | string        | Итоговая комиссия (QUOTE).                                                       |
| commission_buy / commission_sell | string        | Применённые ставки комиссий (доли).                                              |
| weighted_average_price           | string | null | VWAP в QUOTE по исполнению ордера.                                               |
| deals_amount                     | string | null | Итого исполнено в BASE.                                                          |

#### 3.2.6 `get_balance`

**Назначение:**
Вернуть балансы спотового кошелька пользователя (без фиата/оценки, если их не предоставляет бэкенд).

**Доступ:**
Приватный — требуются `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)
**Content-Type:** `application/json; charset=utf-8`

**Минимальный запрос:**

```
{
  "jsonrpc": "2.0",
  "method": "get_balance",
  "params": { "category": "spot" },
  "id": "1"
}
```

**С фильтрами (монета, нули):**

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

**Параметры:**

| Поле              | Тип                     | Обяз. | Допустимые   | Описание                                                                     |
| ----------------- | ----------------------- | ----- | ------------ | ---------------------------------------------------------------------------- |
| category          | string                  | да    | `spot`       | Тип рынка. Возвращает только спот‑балансы.                                   |
| data              | object                  | нет   | —            | Объект фильтров (может быть опущен).                                         |
| data.coin_name    | string | null           | нет   | напр. `USDT` | Фильтр по тикеру монеты (чувствительность к регистру — по правилам бэкенда). |
| data.include_null | string | boolean | null | нет   | `true/false` | Включать ли нулевые балансы. По умолчанию `false` (нули скрываются).         |

**Поведение `include_null`:**

* `false` (по умолчанию): нулевые балансы скрываются.
* Если **все** балансы нулевые и `include_null=false`, результат может быть `[]`.

**Успешный ответ:**
Возвращает массив объектов балансов только для `asset_type: "SPOT"`.

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

**Поля баланса:**

| Поле       | Тип    | Описание                                   |
| ---------- | ------ | ------------------------------------------ |
| coin_name  | string | Тикер монеты (напр. `USDT`).               |
| asset_type | string | Всегда `"SPOT"` для этого метода.          |
| in_orders  | string | Сумма, заблокированная в открытых ордерах. |
| available  | string | Свободно — доступно для торговли/вывода.   |
| total      | string | `available + in_orders`.                   |

---

## 4. Ошибки

Ниже перечислены стандартные коды/сообщения ошибок.

| code                     | message                                 | Когда возникает                                                                                                        | Методы                                                         |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| method_not_found         | Method not found                        | `method` отсутствует или не является поддерживаемым публичным методом (`markets` / `tickers` / `orderbook` / `ohlcv`). | все                                                            |
| auth_required            | Authorization required for this method  | Нет или неполные заголовки `X-CITRO-*` для приватного метода.                                                          | все приватные                                                  |
| invalid_signature        | Invalid signature                       | Подпись не соответствует `timestamp + api_key + recv_window + raw_body`.                                               | все                                                            |
| invalid_params           | Params for requested method are invalid | Отсутствуют/невалидны поля в `params` / некорректная `category` / `symbol` / лишние поля.                              | все                                                            |
| internal_server_error    | Internal server error                   | Неожиданная ошибка бэкенда (сбой БД, таймаут и т.п.).                                                                  | все                                                            |
| invalid_pair             | Invalid pair                            | Пара (`symbol`) не поддерживается.                                                                                     | create_order, cancel_all_orders, active_orders, orders_history |
| validation_error         | Validation error                        | Неверные значения пагинации, нарушения точности/шага и т.д.                                                            | active_orders, orders_history, get_balance                     |
| page_out_of_range        | page must be between 1 and 1000.        | `page` вне диапазона.                                                                                                  | orders_history                                                 |
| page_size_out_of_range   | page_size must be between 1 and 100.    | `page_size` вне диапазона.                                                                                             | orders_history                                                 |
| invalid_order_value      | Invalid order value                     | Нарушены точность, шаг цены, мин/макс лимиты и т.д.                                                                    | create_order                                                   |
| not_found_coins_for_hold | Failed to determine funds to hold       | Не удалось зарезервировать средства.                                                                                   | create_order                                                   |
| not_enough_amount        | Insufficient balance                    | Недостаточный баланс пользователя.                                                                                     | create_order                                                   |
| no_market_offers         | No available market liquidity           | `type = market`, но подходящей ликвидности нет.                                                                        | create_order                                                   |
| order_not_found          | Order not found                         | `order_id` не существует.                                                                                              | cancel_order                                                   |
| order_already_fulfilled  | Order already fulfilled                 | Попытка отменить уже полностью исполненный ордер.                                                                      | cancel_order                                                   |
| order_already_canceled   | Order already canceled                  | Попытка отменить уже отменённый ордер.                                                                                 | cancel_order                                                   |
| order_is_market          | Market orders cannot be canceled        | Попытка отменить market‑ордер.                                                                                         | cancel_order                                                   |
| permission_denied        | Order does not belong to this API key   | Ордер принадлежит другому API‑ключу/аккаунту.                                                                          | cancel_order                                                   |
| rate_limited             | Too many requests                       | Превышен лимит; сервер может отвечать HTTP 429.                                                                        | все                                                            |
| recv_window_expired      | Request is expired                      | `abs(server_now_ms - X-CITRO-TIMESTAMP) > X-CITRO-RECV-WINDOW`. Обычно из‑за рассинхрона часов или высокой задержки.   | все                                                            |
| invalid_symbol           | Invalid symbol                          | `tickers` / `orderbook` / `ohlcv`: символ не поддерживается. (Для `ohlcv` сейчас поддерживается только `CITRO/USDT`.)  | tickers, orderbook, ohlcv                                      |

---

## 5. WebSocket API

### 5.1 Базовая WS‑точка входа

```
wss://api.citronus.com/public/ws/v1/
```

### 5.2 Аутентификация

* По умолчанию часть методов подписки — публичные (без аутентификации).
* Если метод помечен как «требует аутентификацию», клиент обязан передать:

  * `api_key`
  * `timestamp`
  * `recv_window`
  * `sign`

Сервер валидирует эти поля перед выполнением метода.

### 5.3 Ошибки

Сервер может отвечать стандартными сообщениями об ошибках, например:

* `"Authentication failed"`
* `"Internal server error"`
* `"Invalid parameters"`
* `"[Service] client not available"`

Коды ошибок:

* `4000` — общие ошибки методов (`MethodError`)
* `4001` — неверные параметры команды (`InvalidCommandParametersError`)
* `5000` — ошибки подписок (`SubscriptionError`)

### 5.4 Action‑методы

#### `ping` (требует аутентификацию)

**Имя:** `PingMethod`
**Назначение:** Проверка «живости» соединения.
**Ожидаемый ответ:**

```
{ "response": "ping" }
```

### 5.5 Методы подписок

#### 5.5.1 `subscribe.balance`

**Имя:** `BalanceSubscribeMethod`
**Auth:** Требуется
**Назначение:** Подписка на обновления балансов кошельков.

**Параметры (`params`):**

* `asset` (string, обяз.) — селектор канала:

  * `SPOT` — агрегированный список всех спотовых балансов (снимок).
  * `SPOT-<COIN>` — фокус по одной монете, напр. `SPOT-XRP`.

Примечание: В исходящих апдейтах верхнеуровневое поле `params` может выглядеть как
`"<account_id>_listings.SPOT"` для листинга или
`"<account_id>_tickers.SPOT-<COIN>"` для одной монеты.
Это ключ канала (аккаунт‑скоуп). Это ожидаемо.

**Пример запроса (полный SPOT‑листинг):**

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

**ACK‑ответ:**

```
{
  "subscription_id": "6f34da71-f412-41a8-b721-335c1b4ae4b0",
  "response": "Subscribed to balance"
}
```

**Поток данных — снимок (массив):**

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

**Поток — инкрементальные обновления:**

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

**Запрос на одну монету:**

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

**ACK по монете:**

```
{
  "subscription_id": "faeaf93b-2858-4839-8aae-e438cf61279c",
  "response": "Subscribed to balance"
}
```

**Поток по монете (пример XRP):**

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

**Заметки / поведение:**

```
sign = HMAC_SHA256(secret, timestamp + api_key + recv_window + pre_cmd_json)
```

* Во входящих апдейтах используется `method: "subscribe.wallets"` — это ожидаемо (семейство каналов балансов).
* Первая посылка для `SPOT` — снимок‑массив в `data.data`. Далее идут инкрементальные апдейты по одной монете.
* Для `SPOT-<COIN>` приходят только апдейты по выбранной монете.
* Денежные значения (`available`, `in_orders` и т.п.) — строки. Используйте десятичную математику на клиенте.

#### 5.5.2 `subscribe.orderbook`

**Имя:** `OrderBookSubscribeMethod`
**Auth:** Не требуется
**Назначение:** Подписка на живые обновления стакана.

**Параметры (`params`):**

* `symbol` (string, обяз.) — торговая пара в формате `BASE-QUOTE`, напр. `BTC-USDT` (верхний регистр, через дефис).
* `interval` (string, обяз.) — частота/код потока. См. `INTERVALS`.

**INTERVALS (примеры):**

* `"100"` → 100 мс
* `"300"` → 300 мс
* `"500"` → 500 мс
* `"1"` → 1 сек
* `"3"` → 3 сек
* `"5"` → 5 сек
* `"15"` → 15 сек
* `"30"` → 30 сек

**Пример запроса:**

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

**Пример потока данных:**

```
{
  "subscription_id": "6def89c9-e983-4de2-81d7-ba441892da60",
  "method": "subscribe.orderbook",
  "params": "BTC-USDT_100",
  "data": {
    "topic": "orderbook.1.BTC-USDT",
    "type": "snapshot",               // далее могут быть "delta"
    "ts": 1760617081,                  // Unix‑секунды
    "hmts": "2025-10-16 12:18:01",    // человеко‑читаемая метка времени
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

**Формат полей:**

* Все числовые значения в массивах стакана — строки.
* `a` = аски `[price, size]`, лучшие — первыми.
* `b` = биды `[price, size]`, лучшие — первыми.
* `s` = символ `BASE-QUOTE`.
* `lp` = последняя цена.
* `ts` = Unix‑секунды.
* `hmts` = человеко‑читаемая метка времени.
* Верхнеуровневый `params` в апдейтах — `"<SYMBOL>_<INTERVAL>"`.
* `data.topic` может выглядеть как `orderbook.<code>.<SYMBOL>`, где `<code>` — внутренний код канала и может не совпадать буквально с `interval`.

#### 5.5.3 `subscribe.klines`

**Имя:** `KlinesSubscribeMethod`
**Auth:** Не требуется
**Назначение:** Подписка на данные свечей (кэндлы).

**Параметры (`params`):**

* `symbol` (string, обяз.) — напр. `BTCUSDT`.
* `interval` (string, обяз.) — таймфрейм.

**INTERVALS (чарт‑таймфреймы):**

* `"1"` → 1 мин
* `"3"` → 3 мин
* `"5"` → 5 мин
* `"15"` → 15 мин
* `"30"` → 30 мин
* `"60"` → 1 ч
* `"120"` → 2 ч
* `"240"` → 4 ч
* `"360"` → 6 ч
* `"720"` → 12 ч
* `"1440"` → 24 ч
* `"D"` → 1 день
* `"W"` → 1 неделя
* `"M"` → 1 месяц

**Пример запроса:**

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

**Пример потока данных:**

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

Каждый элемент в `data.data` — одна свеча OHLCV:

* `start` (int, ms) — начало свечи (Unix ms, UTC).
* `end` (int, ms) — конец свечи (Unix ms, UTC). Включительно/исключительно — зависит от бэкенда; воспринимайте как границу.
* `interval` (string) — запрошенный таймфрейм.
* `open` / `close` / `high` / `low` — цены.
* `volume` (string) — объём в BASE.
* `turnover` (string) — нотионал в QUOTE.
* `confirm` (bool): `false` — свеча ещё формируется; `true` — закрыта и финальна.
* `timestamp` (int, ms) — серверная метка времени снимка свечи.
* Все числовые поля отправляются строками — используйте десятичную математику.

#### 5.5.4 `subscribe.tickers`

**Имя:** `TickersSubscribeMethod`
**Auth:** Не требуется
**Назначение:** Подписка на тикер‑апдейты по конкретной паре.

**Параметры (`params`):**
* `asset` (string, обяз.) — пара в формате `BASE/QUOTE`, напр. `CITRO/USDT`.

Заметки:

* Другие форматы (например, `SPOT-BTC` или просто `BTC`) здесь не поддерживаются.
* Во входящих апдейтах будут:

  * `method: "subscribe.coins"`
  * `params`: строка пары (напр. `"CITRO/USDT"`) — это ожидаемо.

**Пример запроса:**

```
{
  "command": "subscribe.tickers",
  "params": { "asset": "CITRO/USDT" }
}
```

**ACK:**

```
{
  "subscription_id": "c45df69d-a275-4467-92ac-900e9daad5d5",
  "response": "Subscribed to tickers"
}
```

**Пример потока:**

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

**Поля тикера:**

* Все числовые (`last_price`, `volume_24h`, `change_24h`, `high_24h`, `low_24h`) — строки; используйте десятичную математику.
* `symbol` — эхо пары `BASE/QUOTE`.
* `price_direction` — индикатор направления, напр. `"UP"`.

**Поведение / заметки:**

* Работает только если `asset` передан в формате `BASE/QUOTE`. Другие форматы поток не дадут.

---

## 6. Лимиты (Rate Limits)

API применяет лимиты, чтобы обеспечить стабильность сервиса.

### 6.1 Базовые лимиты

* Базовая полоса: ~5 запросов в секунду на API‑ключ.
* Короткие всплески: допустимы кратковременно — примерно до ~5 доп. запросов сверх базы.
* При превышении лимитов некоторые запросы могут замедляться или отклоняться с HTTP `429 Too Many Requests`.

### 6.2 Как обнаружить троттлинг

* Вы получаете HTTP `429 Too Many Requests`.
* Дополнительные заголовки вроде `Retry-After` не гарантируются.

### 6.3 Рекомендации для клиента

* Проектируйте клиента так, чтобы в устойчивом режиме держаться ниже 5 rps на ключ.

* При `429` делайте краткую паузу (например, 1–2 секунды).

* Размазывайте всплески, а не шлите все запросы одновременно.

* Помните: параллельные запросы и батч‑массивы JSON‑RPC всё равно учитываются в лимитах.
