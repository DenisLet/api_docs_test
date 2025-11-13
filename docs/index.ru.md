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

> Поле `id` **необязательно** и может не передаваться; если передаётся — используйте **строковое** значение (например, `"1"`).

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

> Примечание: технически публичные методы принимают запрос даже при передаче "пустых" либо неполных заголовков. Для приватных методов соблюдение правил ниже — обязательно.

### 2.2 Получение API‑ключей

Пользователь получает ключи в интерфейсе:  
`Settings → API Management → Create new key`

Вы получите:

* **API Key** — публичный идентификатор.
* **API Secret** — секрет (храните только на стороне клиента/сервера).

### 2.3 Заголовки аутентификации (для приватных методов)

Для **приватных** методов пользователь должен отправлять следующие заголовки:

```
X-CITRO-API-KEY: <your API key>
X-CITRO-TIMESTAMP: <unix_ms>
X-CITRO-RECV-WINDOW: <ms>
X-CITRO-SIGNATURE: <hex>
```

Где:

* `X-CITRO-TIMESTAMP` — ваш клиентский таймстамп в миллисекундах Unix (UTC).
  Пример: `1759308923000`
* `X-CITRO-RECV-WINDOW` — допустимое "окно" приема запроса в миллисекундах (например, `5000` или `15000`). Если фактический дрейф часов + задержки \> этого значения, запрос будет отклонён.
* `X-CITRO-API-KEY` — ваш API‑ключ.
* `X-CITRO-SIGNATURE` — подпись HMAC (см. ниже).

Публичные методы можно вызывать **без** каких‑либо auth‑заголовков.

### 2.4 Формирование подписи

Подпись вычисляется как **HMAC-SHA256** по конкатенации следующих полей:

```
message = <timestamp><api_key><recv_window><body_raw>
signature = HEX( HMAC_SHA256( key = api_secret, message = message ) )
```

Где:

* **`<timestamp>`** — то же значение, что в заголовке `X-CITRO-TIMESTAMP` (в миллисекундах, **строкой**).
* **`<api_key>`** — ваш ключ из заголовка `X-CITRO-API-KEY`.
* **`<recv_window>`** — то же значение, что в заголовке `X-CITRO-RECV-WINDOW` (например, `"5000"`, **строкой**).
* **`<body_raw>`** — **сырой JSON-текст** HTTP-тела запроса (ровно тот, что отправляется в сеть).
* **`api_secret`** — ваш секрет.

⚠ Важно: и клиент, и сервер должны использовать **одни и те же байты** `body_raw`. Любое изменение форматирования (пробелы, переносы строк, порядок ключей) изменяет подпись. Подписывайте **ровно ту строку**, которую отправляете.

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

Для публичных методов можно:

* отправлять полный набор заголовков,
* отправлять только часть заголовков,
* **или не отправлять их вовсе** — запрос всё равно пройдёт.

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

| Поле | Тип | Описание |
| --- | --- | --- |
| jsonrpc | string | Версия протокола JSON-RPC ("2.0"). |
| id | string | Идентификатор запроса/ответа. |
| result.symbol | string | Пара в формате BASE/QUOTE, напр. BTC/USDT. |
| result.base_coin.name | string | Тикер базовой валюты (BASE). |
| result.base_coin.precision | number | Точность (кол-во знаков) для BASE. |
| result.quote_coin.name | string | Тикер котируемой валюты (QUOTE). |
| result.quote_coin.precision | number | Точность (кол-во знаков) для QUOTE. |
| result.icon | string | URL иконки инструмента. |
| result.min_order_qty | string | Минимальное количество (объём) ордера в BASE. |
| result.max_order_qty | string | Максимальное количество (объём) ордера в BASE. |
| result.min_order_amt | string | Минимальная сумма ордера в QUOTE. |
| result.max_order_amt | string | Максимальная сумма ордера в QUOTE. |
| result.quote_tick_size | string | Минимальный шаг цены (tick size) в котируемой валюте (QUOTE). |
| result.commission_limit_sell | string | Комиссия для лимитной продажи (доля). |
| result.commission_limit_buy | string | Комиссия для лимитной покупки (доля). |
| result.commission_market_sell | string | Комиссия для рыночной продажи (доля). |
| result.commission_market_buy | string | Комиссия для рыночной покупки (доля). |
| result.commission_stop_limit_sell | string | Комиссия для стоп-лимит продажи (доля). |
| result.commission_stop_limit_buy | string | Комиссия для стоп-лимит покупки (доля). |
| result.trade_base_precision | number | Кол-во знаков в объёме (BASE) при торгах. |
| result.trade_quote_precision | number | Кол-во знаков в цене/сумме (QUOTE) при торгах. |

#### 3.1.2 `tickers`

**Назначение:** текущий тикер по инструменту (цена, 24h метрики).  

**Доступ:** публичный (без аутентификации).  

**Эндпоинт:** POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.pro/public/v1/jsonrpc)  

**Протокол:** JSON-RPC 2.0  

**Content-Type:** `application/json`  

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
| volume_24h      | string | Объём за 24 часа (в BASE). |
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

**Протокол:**  
JSON-RPC 2.0

**Content-Type:**  
`application/json`

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

> Примечание: в ответе поле `s` возвращается в формате с дефисом (`BTC-USDT`), это нормальная особенность формата ответа.

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

| Поле | Тип | Описание |
| --- | --- | --- |
| `s` | string | Символ инструмента в формате `BASE-QUOTE` (например, `BTC-USDT`). |
| `a` | array\<[string, string]\> | **Ask-уровни** (продажи). Каждый элемент — массив из двух строк: [price, size]. Цена в QUOTE, количество в BASE. Уровни упорядочены от лучшей цены к дальней. |
| `b` | array\<[string, string]\> | **Bid-уровни** (покупки). Формат аналогичен a: [price, size], упорядочены от лучшей цены к дальней. |
| `ts` | number | Серверный таймстемп книги в секундах с долями (Unix time, UTC). |

Все `price`/`size` — строки.
`price` использует `quote_tick_size` из `markets`.
`size` соблюдает `base_coin.precision` из `markets`.

#### 3.1.4 `ohlcv`

**Назначение:**
Получить свечи (OHLCV) по инструменту и таймфрейму.

**Доступ:**
Публичный

**Endpoint:**  
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)  

**Content-Type:**  
`application/json; charset=utf-8`

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

| Поле | Где | Тип | Обязат. | Допустимые значения | Описание |
| --- | --- | --- | --- | --- | --- |
| category | `params` | string | да | `spot` | Тип рынка. |
| symbol | `params` | string | да | напр. `CITRO/USDT` | Торговая пара. Сейчас поддержан **только** `CITRO/USDT`. |
| interval | `params` | string | да | см. таблицу ниже | Таймфрейм. |
| data | `params` | object | да | — | Объект доп. параметров (может быть `{}`). |
| data.start | `data` | integer \| null | нет | миллисекунды от Unix epoch (UTC) | Начало окна, **включительно**. |
| data.end | `data` | integer \| null | нет | миллисекунды от Unix epoch (UTC) | Конец окна, **включительно**. |
| data.limit | `data` | integer | нет | по умолчанию `200` | Кол-во свечей, верхняя граница может ограничиваться бэкендом. |

**Поддерживаемые интервалы (примеры):**

* `"1m"` — 1 минута
* `"5m"` — 5 минут
* `"15m"` — 15 минут
* `"1h"` — 1 час
* `"4h"` — 4 часа
* `"1D"` — 1 день
* `"1W"` — 1 неделя
* `"1M"` — 1 месяц

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

**Ошибки**  

| code | message | Когда возникает |
| --- | --- | --- |
| method_not_found | Method not found | Поле `method` отсутствует или не совпадает с поддерживаемым публичным методом (`markets`/`tickers`/`orderbook`/`ohlcv`). |
| invalid_params | Params for requested method are invalid | Неверные/отсутствующие параметры (`category` ≠ `spot`, нет `symbol`, типы не совпадают, лишние поля и т.п.). |
| invalid_pair | Pair is invalid or **doesn't exist** | `markets`: передан `symbol` корректного формата, но такой пары нет среди поддерживаемых. |
| invalid_symbol | Invalid symbol | `tickers`/`orderbook`/`ohlcv`: символ не поддерживается данным методом (напр., для `ohlcv` сейчас только `CITRO/USDT`). |
| auth_required | Authorization required for this method | **Нюанс:** если клиент передал какие-либо auth-заголовки (API-ключ и т.д.), публичный вызов трактуется как приватный, и при неполной/невалидной аутентификации вернётся эта ошибка. Без заголовков — не применяется. |
| internal_server_error | Internal server error | Неожиданная ошибка на стороне сервера (сбой БД, таймаут и т.п.). |
| recv_window_expired | Request is expired | Метка времени запроса вышла за окно при проверке `abs(server_now_ms − X-CITRO-TIMESTAMP) > X-CITRO-RECV-WINDOW`. Обычно из-за рассинхрона часов клиента или большой сетевой задержки. Рекомендуем: синхронизировать время (NTP) и/или увеличить `X-CITRO-RECV-WINDOW` |

### 3.2 Приватные методы

#### 3.2.1 `create_order`

**Назначение:**
Создать ордер (market / limit / stop_limit) на спот‑рынке.

**Доступ:**
Приватный — требуются заголовки `X-CITRO-*` и валидная HMAC‑подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Content-Type:**  
`application/json; charset=utf-8`

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

Маркет‑ордер (ТОЛЬКО `amount` в BASE ИЛИ `total` в QUOTE; требуется указывать **только один** параметр):

```
{ "symbol": "BTC/USDT", "action": "buy",  "type": "market", "amount": "0.1" }
{ "symbol": "BTC/USDT", "action": "sell", "type": "market", "total":  "100"  }
```

Лимитный ордер (цена обязательна; одно из `amount` или `total`, требуется указывать **только один** параметр):

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

| Поле | Тип | Обязат. | Допустимые значения | Описание |
| --- | --- | --- | --- | --- |
| category | string | да | `spot` | Тип рынка. |
| data | object | да | — | Параметры ордера. |
| data.symbol | string | да | напр. `BTC/USDT` | Торговая пара. |
| data.action | string | да | `buy` \| `sell` | Направление. |
| data.type | string | да | `market` \| `limit` \| `stop_limit` | Тип ордера. |
| data.amount | string \| number | **см. прим.** | \>0 | Кол-во в BASE. Указывать **либо** `amount`, **либо** `total`.Взаимоисключимо с `total`. |
| data.total | string \| number | **см. прим.** | \>0 | Сумма в QUOTE. Взаимоисключимо с `amount`. |
| data.price | string \| number | для `limit`, `stop_limit` | \>0 | Лимит-цена (в QUOTE). |
| data.stop_price | string \| number | для `stop_limit` | \>0 | Стоп-триггер. По умолчанию: для `buy` — \>=, для `sell` — \<=. |

**Лимит открытых ордеров**: одновременно открытых ордеров не более 100 на аккаунт.

**Примечания по `amount` и `total`:**

* Если указан `amount`, `total` будет рассчитан как `amount × price` (для `market` — по фактической цене исполнения, для `limit` — по цене ордера).
* Если указан `total`, система вычислит `amount = floor(total / price, trade_base_precision)`; для `market` итоговый расход/получение в QUOTE может быть ≤ заявленного `total`.
* Указывать **оба сразу нельзя**; указание **ни одного** — ошибка.

**Валидации и правила точности**

* `symbol` должен существовать в `markets(category="spot")`.
* Для `price` соблюдайте шаг `quote_tick_size` и точность `trade_quote_precision`.
* Для `amount` — точность `trade_base_precision`.
* Минимумы/максимумы проверяются по `min_order_qty`/`max_order_qty` и/или `min_order_amt`/`max_order_amt` для соответствующего символа.
* Комиссии применяются согласно полям `commission_*` из `markets`.

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

##### Пакетные запросы (batch)  

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

1. Отправка **массива** JSON-RPC запросов в одном HTTP-запросе согласно спецификации JSON-RPC 2.0.
2. **Количество ореров в одном батче ограничего 10 шт.**
3. **Аутентификация:** те же `X-CITRO-*` заголовки и подпись HMAC, что и для одиночного вызова (на **весь** батч).
4. **Атомарность:** **не атомарно** — каждый элемент обрабатывается независимо (возможны частичные успехи/ошибки).
5. **Порядок ответов:** может **не совпадать** с порядком запросов; сопоставляйте по полю `id`.
6. **Рекомендация:** используйте **уникальные** `id` внутри батча.

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

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Внутренний идентификатор ордера. |
| price | string | **null**: нет цены у рыночных ордеров (**type = market**); для **limit/stop_limit** заполняется. |
| current_amount | string | Текущее неисполненное кол-во (для fulfilled = "0"). |
| original_amount | string | Исходное количество в BASE. |
| action | string | buy или sell. |
| pair.base / quote | string | Тикеры BASE/QUOTE. |
| status | string | Статус: created \| placed \| in_order_book \| partially_fulfilled \| completed \| fulfilled \| canceled \| marked_for_cancel |
| type | string | Тип ордера: market \| limit \| stop_limit. |
| create_date | string | Время создания (UTC, ISO-8601). |
| market_total_original | string | Запрошенный `total` для market (если указывался) |
| market_total_current | string | Фактически израсходовано/получено (market). |
| stop_price_gte | string | Стоп-условие >= (если применимо). |
| stop_price_lte | string | Стоп-условие <= (если применимо). |
| total | string | Итоговая сумма в QUOTE |
| fee | string | Комиссия, удержанная по ордеру (в QUOTE). |

> Для `stop_limit`система автоматически выберет условие: для `buy` — `stop_price_gte`, для `sell` — `stop_price_lte`.

#### 3.2.2 `cancel_order`

**Назначение:**
Отменить один существующий ордер.

**Доступ:**
Приватный — требуются заголовки `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Content-Type:**  
`application/json; charset=utf-8`

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

  * При отмене незаполненный остаток будет освобождён.
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

**Content-Type:**  
`application/json; charset=utf-8`

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

  * При отмене незаполненный остаток будет освобождён.
* Терминальные статусы нельзя отменить: `fulfilled` / `completed`, `canceled`.

  * `order_already_fulfilled` — уже полностью исполнен.
  * `order_already_canceled` — уже отменён.
* `marked_for_cancel`: повторный вызов идемпотентен → снова вернётся успех.
* Маркет‑ордера нельзя отменить. Попытка отмены вернёт `order_is_market`.
* Стоп‑лимиты можно отменять до триггера ИЛИ после, пока статус отменяемый и есть остаток.
* Проверка прав: если ордер не принадлежит вашему API‑ключу → `permission_denied` / аналогичная.

#### 3.2.4 `active_orders`

**Назначение:**
Получить список **активных** ордеров пользователя (новые/размещённые/частично исполненные, включая ожидающие стоп-условия).

**Доступ:**
Приватный — требуются заголовки `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)

**Content-Type:**  
`application/json; charset=utf-8`

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

| Поле | Тип | Обязат. | Допустимые значения | Описание |
| --- | --- | --- | --- | --- |
| category | string | да | `spot` | Тип рынка. |
| data | object | да | — | Объект фильтров (может быть пустым `{}`). |
| data.start_date | string \| null | нет | `YYYY-MM-DD` | Нижняя граница по `create_date` (UTC), **включительно**. |
| data.end_date | string \| null | нет | `YYYY-MM-DD` | Верхняя граница по `create_date` (UTC), **включительно**. |
| data.order_by | string \| null | нет | см. ниже | Правило сортировки. |
| data.symbol | string \| null | нет | напр. `BTC/USDT` | Фильтр по паре. |

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

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Внутренний ID ордера. |
| price | string \| null | Лимит-цена; для market — null. |
| current_amount | string | Неисполненный остаток (BASE). |
| original_amount | string | Исходное количество (BASE). |
| action | string | buy \| sell. |
| pair.base / pair.quote | string | Тикеры BASE/QUOTE. |
| status | string | created \| placed \| partially_filled и т.п. |
| type | string | market \| limit \| stop_limit. |
| create_date | string | Время создания (UTC, ISO-8601). |
| market_total_original | string \| null | Запрошенный total для market (если задавался). |
| market_total_current | string \| null | Фактически израсходовано/получено (market). |
| stop_price_gte / stop_price_lte | string \| null | Стоп-условия для stop_limit. |
| total | string \| null | Сумма в QUOTE. |
| fee | string | Комиссия (QUOTE). |
| commission_buy / sell | string | Ставки комиссий (доля) для инструмента. |
| weighted_average_price | string \| null | Средневзвешенная цена исполненной части (QUOTE). |
| deals_amount | string \| null | Суммарно исполнено (BASE), если есть. |

#### 3.2.5 `orders_history`

**Назначение:**
Пагинированная история ордеров.

**Доступ:**
Приватный — требуются `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)  

**Content-Type:**  
`application/json; charset=utf-8`

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

| Поле | Тип | Обязат. | Допустимые значения | Описание |
| --- | --- | --- | --- | --- |
| category | string | да | `spot` | Тип рынка. |
| page | integer \| string | да | `1..1000` | Номер страницы (по умолчанию `1`). |
| page_size | integer \| string | да | `1..100` | Размер страницы (по умолчанию `50`). |
| data | object | нет | — | Объект фильтров (может быть `{}`). |
| data.start_date | string \| null | нет | `YYYY-MM-DD` | Нижняя граница по `create_date` (UTC), **включительно**. |
| data.end_date | string \| null | нет | `YYYY-MM-DD` | Верхняя граница по `create_date` (UTC), **включительно**. |
| data.order_by | string \| null | нет | см. ниже | Правило сортировки. |
| data.symbol | string \| null | нет | напр. `BTC/USDT` | Фильтр по паре. |
| data.history | string \| boolean | **желат.** | `true` | **Рекомендуется всегда** **`true`**, иначе результат может не соответствовать истории ордеров. |

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

| Поле | Тип | Описание |
| --- | --- | --- |
| id | string | Внутренний ID ордера. |
| price | string \| null | Лимит-цена; для market — null. |
| current_amount | string \| null | Неисполненный остаток (BASE); для полностью исполненных может быть "0" или null (как в примерах). |
| original_amount | string | Исходное количество (BASE). |
| action | string | buy \| sell. |
| pair.base / pair.quote | string | Тикеры BASE/QUOTE. |
| status | string | Например: completed, canceled, могут встречаться и другие финальные статусы. |
| type | string | market \| limit \| stop_limit. |
| create_date | string | Время создания (UTC, ISO-8601). |
| market_total_original | string \| null | Запрошенный total (для market, если задавался). |
| market_total_current | string \| null | Фактически израсходовано/получено (market). |
| stop_price_gte / lte | string \| null | Стоп-условия для stop_limit. |
| total | string \| null | Сумма в QUOTE (если применимо). |
| fee | string | Итоговая комиссия (QUOTE). |
| commission_buy / sell | string | Ставки комиссий (доля), действовавшие для инструмента. |
| weighted_average_price | string \| null | Средневзвешенная цена исполнения (QUOTE) по сделкам ордера. |
| deals_amount | string \| null | Суммарно исполнено (BASE). |

#### 3.2.6 `get_balance`

**Назначение:**
Листинг балансов по спотовым ассетам пользователя (без эквивалента/оценки в фиате).

**Доступ:**
Приватный — требуются `X-CITRO-*` и подпись.

**Endpoint:**
POST [https://api.citronus.com/public/v1/jsonrpc](https://api.citronus.com/public/v1/jsonrpc)  

**Content-Type:**  
`application/json; charset=utf-8`

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

| Поле | Тип | Обязат. | Допустимые значения | Описание |
| --- | --- | --- | --- | --- |
| category | string | да | `spot` | Тип рынка. Возвращаются только спотовые балансы. |
| data | object | нет | — | Объект фильтров (может отсутствовать). |
| data.coin_name | string \| null | нет | напр. `USDT` | Фильтр по тикеру монеты. Кейсы чувствительны так же, как в REST. |
| data.include_null | string \| boolean \| null | нет | `true`/`false` | Управляет показом нулевых балансов. По умолчанию `false` (нули скрыты). |

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

| code | message | Когда возникает | Методы |
| --- | --- | --- | --- |
| method_not_found | Method not found | `method` отсутствует/опечатан. | все |
| auth_required | Authorization required for this method | Нет/неполные заголовки `X-CITRO-*`. | все |
| invalid_signature | Invalid signature | Подпись не совпала с `timestamp+api_key+recv_window+raw_body`. | все |
| invalid_params | Params for requested method are invalid | Нет `category="spot"`, некорректные/лишние поля `params`/`data`. | все |
| internal_server_error | Internal server error | Неожиданная ошибка сервера. | все |
| invalid_pair | Invalid pair | Пара (`symbol`) не поддерживается. | create_order, cancel_all_orders, active_orders, orders_history |
| validation_error | Validation error | Ошибки валидации. | active_orders, orders_history, get_balance |
| page_out_of_range | page must be between 1 and 1000. | `page` вне диапазона. | orders_history |
| page_size_out_of_range | page_size must be between 1 and 100. | `page_size` вне диапазона. | orders_history |
| invalid_order_value | Invalid order value | Нарушены шаг/точности/границы значений. | create_order |
| not_found_coins_for_hold | Не удалось определить число средств для удержания | Ошибка расчёта холда. | create_order |
| not_enough_amount | Недостаточно средств | Недостаточно баланса. | create_order |
| no_market_offers | Нет подходящих предложений на рынке для выполнения ордера | Для `type=market` нет ликвидности. | create_order |
| order_not_found | Order not found | `order_id` не существует. | cancel_order |
| order_already_fulfilled | Order already fulfilled | Пытаемся отменить полностью исполненный ордер. | cancel_order |
| order_already_canceled | Order already canceled | Повторная отмена уже отменённого ордера. | cancel_order |
| order_is_market | Market orders cannot be canceled | Нельзя отменить рыночный ордер. | cancel_order |
| permission_denied | Order does not belong to this API key | Ордер не принадлежит этому API-ключу (пример из 403). | cancel_order |
| rate_limited | Too many requests | Превышен лимит запросов. | все |
| recv_window_expired | Request is expired | Метка времени запроса вышла за окно при проверке `abs(server_now_ms − X-CITRO-TIMESTAMP) > X-CITRO-RECV-WINDOW`. Обычно из-за рассинхрона часов клиента или большой сетевой задержки. Рекомендуем: синхронизировать время (NTP) и/или увеличить `X-CITRO-RECV-WINDOW` | все |

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

### `ping` *(не требуется аутентификация)*

* Название: `PingMethod`
* Назначение: проверка соединения.
* Ответ **должен** иметь вид:

```
{ "response": "ping" }
```

### 5.5 Методы подписок

#### 5.5.1 `subscribe.balance`

**Имя:** `BalanceSubscribeMethod`  
**Auth:** Требуется  
**Назначение:** Подписка на обновления балансов кошельков.  

**Параметры (`params`):**

* `asset` (**string**, обязателен) — целевой канал:
  * `SPOT` — агрегированный список всех монет спотового кошелька (листинг).
  * `SPOT-<COIN>` — точечные апдейты по одной монете, напр. `SPOT-XRP`.

> Примечание: в входящих апдейтах верхнеуровневое поле `params` имеет вид
> `"<account_id>_listings.SPOT"` для листинга или `"<account_id>_tickers.SPOT-<COIN>"` для конкретной монеты. Это **канальный ключ** (с префиксом идентификатора аккаунта).

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

**Формат полей (листинг/монетные апдейты):**

* Числовые значения (`available`, `in_orders`, `total`, `equivalent.amount`) отдаются **строками**.
* `coin.precision` — целое число (кол-во знаков после запятой).
* `equivalent.currency` — строковый код валюты эквивалента (например, `USD`).

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

> Примечание: в канале по одной монете схема может отличаться от листинга (например, `balance` вместо `available/in_orders/total`). Клиенту следует обрабатывать оба варианта.



**Поведение и примечания**

* Подписка приватная: требуется корректная подпись кадра по правилу
  `sign = HMAC_SHA256(secret, timestamp + api_key + recv_window + pre_cmd)`.
* `method` во входящих апдейтах приходит как `subscribe.wallets` — это **семейство каналов балансов**. Это нормально и не является ошибкой названия метода.
* Снапшот для `SPOT` приходит массивом в `data.data`, затем — точечные апдейты по монетам (один объект в `data`).
* Для `SPOT-<COIN>` приходят апдейты только по выбранной монете.
* Все денежные/количественные величины приходят **строками**; используйте точную (decimal) арифметику на клиенте.

#### 5.5.2 `subscribe.orderbook`

**Имя:** `OrderBookSubscribeMethod`  
**Auth:** Не требуется  
**Назначение:** Подписка на изменения стакана заявок.  

**Параметры (`params`):**

* `symbol` (**string**, обязателен) — торговая пара в формате `BASE-QUOTE`, например `BTC-USDT`.
  Требования: верхний регистр, дефис между базовой и котируемой валютами.
* `interval` (**string**, обязателен) — частота/режим обновлений, одно из значений из таблицы **INTERVALS** ниже.
  Возвращается в ACK косвенно (как часть `params` в виде `BTC-USDT_<interval>`).

  > Внутри `data.topic` число после `orderbook.` — **код канала**, а не переданный вами `interval`.




**INTERVALS**

'100' → 100 milliseconds

'300' → 300 milliseconds

'500' → 500 milliseconds

'1'   → 1 second

'3'   → 3 seconds

'5'   → 5 seconds

'15'  → 15 seconds

'30'  → 30 seconds

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

* **Типы:**
  * Все числовые значения в массиве уровней — **строки**.
  * `ts` — целое (UNIX seconds). `hmts` — строка (человекочитаемая дата/время).
* **Структура стакана:**
  * `a` — массив асков (asks), каждый элемент — пара `[price, size]`.
  * `b` — массив бидов (bids), каждый элемент — пара `[price, size]`.
  * `s` — символ (пара) `BASE-QUOTE`.
  * `lp` — последняя цена .
* **Канальный ключ vs интервал:**
  * Верхнеуровневый `params` у апдейтов — это строка `"<SYMBOL>_<INTERVAL>"`.
  * `data.topic` имеет вид `"orderbook.<code>.<SYMBOL>"`, где `<code>` — **внутренний код канала**, он может не совпадать с переданным `interval`.

#### 5.5.3 `subscribe.klines`

**Имя:** `KlinesSubscribeMethod`  
**Auth:** Не требуется  
**Назначение:** Подписка на данные свечей.  

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

Каждый элемент массива — одна свеча OHLCV.

* `start` (**integer**, ms) — начало интервала свечи, UNIX time в **миллисекундах**.
* `end` (**integer**, ms) — конец интервала свечи (включительно/исключительно — см. ниже); UNIX ms.
* `interval` (**string**) — запрошенный таймфрейм (см. таблицу INTERVALS в разделе метода).
* `open` (**string**) — цена открытия.
* `close` (**string**) — цена закрытия (для незакрытых свечей — текущая).
* `high` (**string**) — максимум за интервал.
* `low` (**string**) — минимум за интервал.
* `volume` (**string**) — объём в **базовой** валюте (BASE). Суммарное количество BASE за **все сделки** внутри свечи
* `turnover` (**string**) — оборот в **котируемой** валюте (QUOTE). Суммарный оборот в QUOTE за **все сделки** внутри свечи
* `confirm` (**boolean**) — финализация:
  * `false` — свеча **ещё формируется** (данные могут обновляться);
  * `true` — свеча **закрыта**, значения стабильны.
* `timestamp` (**integer**, ms) — серверный момент формирования именно этой записи (может совпадать с верхним `ts`, но относится к конкретной свече).

> Все ценовые и объёмные поля (`open/close/high/low/volume/turnover`) приходят **строками**. Для расчётов используйте Decimal/BigNumber.

#### 5.5.4 `subscribe.tickers`

**Имя:** `TickersSubscribeMethod`  
**Auth:** Не требуется  
**Назначение:** Подписка на тикер выбранной торговой пары.  

**Параметры (`params`):**  

* `asset` (**string**, обязателен) — торговая пара в формате `BASE/QUOTE`, например `CITRO/USDT`.

  > Примечание: другие форматы (например, `SPOT-BTC` или просто `BTC`) **не поддерживаются** этим методом — подписка сработает **только** при передаче пары `BASE/QUOTE`.

> В входящих апдейтах поле `params` возвращает пару (например, `"CITRO/USDT"`), а поле `method` приходит как `subscribe.coins` — это семейство каналов тикеров. Это ожидаемо и не является ошибкой имени метода.

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

Поля `data`

* Все числовые значения (`last_price`, `volume_24h`, `change_24h`, `high_24h`, `low_24h`) — **строки**. Рекомендуется парсить в Decimal.
* `symbol` — строка, эхо пары `BASE/QUOTE`.
* `price_direction` — строка-индикатор направления (например, `"UP"`).

Поведение и примечания

* Работает **только** при `asset` в формате `BASE/QUOTE`. При других значениях сервер не даёт рабочий стрим.

---

## 6. Лимиты (Rate Limits)

API применяет лимиты, чтобы обеспечить стабильность сервиса.

### 6.1 Базовые лимиты

* Базовая полоса: ~5 запросов в секунду на API‑ключ.
* Пиковый запас (burst):** кратковременно допускается до `+5` запросов сверх базового лимита.
* При превышении лимитов некоторые запросы могут замедляться или отклоняться с HTTP `429 Too Many Requests`.

### 6.2 Как обнаружить троттлинг

* Вы получаете HTTP `429 Too Many Requests`.
* Дополнительные заголовки вроде `Retry-After` не гарантируются.

### 6.3 Рекомендации для клиента

* Планируйте трафик так, чтобы **устойчиво не превышать 5 rps** на ключ.
* При получении **429** подождите короткую паузу (например, 1–2 секунды).
* Равномерно распределяйте пакеты запросов
* Помните, что **параллельные и батч-запросы** тоже учитываются в лимите.
