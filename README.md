# dsh-api-balance

> **DSH Plugin** · A floating account-balance widget for DeepSeek Harness that shows multiple AI providers' balances in the session header.

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4ade80)](#) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文文档](./README.zh-CN.md)

A persistent web plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness): it pins a small pill to the top-right header (to the left of the "Session log" button) showing the selected provider's account balance in real time. Click it to expand a dropdown where you can switch provider, enter an API key, and refresh manually.

## Features

- **Multi-provider**: one plugin queries multiple AI vendors; switch provider in the UI
- **Persistent**: provider / API key / extra params are stored in the DSH credentials store (`~/.dsh/.credentials.yaml`, mode 0600), surviving restarts
- **Live refresh**: 30s auto-poll + manual refresh
- **Secure**: host routes accept loopback requests only; API keys are never sent back to the frontend or logged
- **Theme-aware**: all styles use DSH theme tokens, following light/dark mode
- **Extensible**: add a provider by appending one entry to `PROVIDERS` on the host; the UI renders the matching form automatically

## Supported providers

| Provider | Balance endpoint | Extra params |
| --- | --- | --- |
| AGICTO | `POST /v1/enterprise/account` | `uuid` (account UUID) |
| DeepSeek | `GET /user/balance` | — |
| OpenRouter | `GET /api/v1/credits` | — |
| Moonshot (Kimi) | `GET /v1/users/me/balance` | — |
| SiliconFlow | `GET /v1/user/info` | — |
| OpenAI | `GET /v1/dashboard/billing/subscription` | — |

> Provider endpoints may change upstream; if a provider fails to parse, consult its official docs. See "Adding a provider" below.

## Architecture

```
Host (Node process)                 Client (browser)
───────────────                    ──────────────
lib/index.js                        lib/client.js
 ├─ GET  /balance/providers         header pill + dropdown
 ├─ GET  /balance/status              ├─ provider selector
 ├─ POST /balance/config              ├─ API key input
 └─ POST /balance/clear               ├─ extra fields (per provider)
        │                             └─ balance / refresh / clear
        └─ credentials service (~/.dsh/.credentials.yaml)
           BALANCE_PROVIDER / BALANCE_API_KEY / BALANCE_EXTRA
```

The host registers loopback-only `/balance/*` routes via `webServer`, reads the credentials store, and queries the selected provider's balance endpoint; the client fetches the same-origin routes directly and renders the widget with `React.createElement` (bundled in `__ModuleLoader__` format, no build step).

## Install

### Option A: `dsh plugin` command

```bash
dsh plugin --profile web add https://github.com/Badegg404/dsh-api-balance.git
```

### Option B: manual install

1. Place this repo somewhere local (e.g. `~/.dsh/profiles/web/plugins/dsh-api-balance/`)
2. Edit `~/.dsh/profiles/web/package.json`:

```jsonc
{
  "dependencies": {
    "@Badegg404/dsh-api-balance": "file:plugins/dsh-api-balance"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ...existing bundles...
        "@Badegg404/dsh-api-balance"
      ]
    }
  }
}
```

3. `pnpm install`, then restart DSH.

## Usage

1. Open a session; the "Balance" pill appears to the left of the "Session log" button
2. Click it → pick a provider → paste the API key (AGICTO also needs the account UUID) → save
3. The balance shows in the pill and dropdown, auto-refreshing every 30s

## Screenshot

```
┌─ Header ─────────────────────────────────────────────┐
│ session title…   [● Balance 12.34 USD] [Session log] │
└──────────────────────────────────────────────────────┘
            │ click
            ▼
┌─ Balance Monitor ─────────────────┐
│ Provider     [AGICTO          ▾]  │
│ AGICTO       ¥ 4.9974451          │
│ API Key      [••••••••]     show  │
│ Account UUID [a1b2c3...        ]  │
│ [ Save ]  [Clear]  [Refresh]      │
└───────────────────────────────────┘
```

## Adding a provider

Append one entry to `PROVIDERS` in `lib/index.js`; the form renders automatically:

```js
{
  id: "myplatform",
  label: "My Platform",
  currency: "USD",                        // optional display currency
  extraFields: [],                        // extra params (e.g. agicto's uuid)
  request: {
    method: "GET",
    url: "https://api.example.com/v1/balance",
    headers: { "Authorization": "Bearer {key}" },   // {key} → API key
    // body: '{"uuid":"{uuid}"}',                    // enable if needed; {field} → extra param
  },
  parse(res) {
    return { balance: String(res.data.balance) };    // or { balance: null, error: "..." }
  },
}
```

Placeholders `{key}` and `{<extra field>}` in `request.headers` / `request.body` are substituted before the request; `parse` returns `{ balance }` or `{ balance: null, error }`.

## License

[MIT](LICENSE)
