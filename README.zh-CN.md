# dsh-api-balance

> **DSH 插件** · 在 DeepSeek Harness 会话标题栏悬浮显示多个 AI 平台的账户余额与用量。

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4ade80)](#) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](./README.md)

一个面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的持久化 Web 插件：在页面右上角标题栏（「Session log」按钮左侧）挂一个小胶囊，实时显示所选平台的账户余额；点开展开下拉卡片，内含**「余额监控」**与**「用量监控」**两个 tab —— 余额显示账户/额度余额，用量显示近 30 天费用或 token 配额。可切换平台、填写 API Key 并手动刷新。

## 特性

- **多平台统一**：一个插件查询多个 AI 供应商余额，平台在 UI 里切换
- **双 tab**：「余额监控」显示账户余额；「用量监控」显示近 30 天费用 / token 配额 —— 两个 tab 各自独立保存平台、API Key 与刷新
- **持久化**：平台 / API Key / 附加参数存入 DSH 凭据库（`~/.dsh/.credentials.yaml`，权限 0600），重启不丢
- **实时刷新**：30 秒自动轮询 + 手动刷新
- **安全**：Host 路由仅接受 loopback 请求；API Key 永不回传前端、不写日志
- **主题适配**：全部样式走 DSH 主题 token，跟随明暗主题
- **易扩展**：新增平台只需在 Host 的 `PROVIDERS` 数组里加一条声明，前端自动渲染对应表单

## 支持平台

### 余额

| 平台 | 接口 | 附加参数 |
| --- | --- | --- |
| AGICTO | `POST /v1/enterprise/account` | `uuid`（账户 UUID） |
| DeepSeek | `GET /user/balance` | — |
| OpenRouter | `GET /api/v1/credits` | — |
| Moonshot (Kimi) | `GET /v1/users/me/balance` | — |
| 硅基流动 SiliconFlow | `GET /v1/user/info` | — |
| MiniMax | `GET /v1/token_plan/remains` | — |
| 阶跃星辰 StepFun | `GET /v1/accounts` | — |
| xAI (Grok) | `GET /v1/billing/credits` | — |

### 用量

| 平台 | 接口 |
| --- | --- |
| OpenAI | `GET /v1/organization/costs` |
| 智谱 GLM | `GET /api/monitor/usage/quota/limit` |
| Together AI | `GET /v1/billing/usage` |
| Anthropic (Claude) | `GET /v1/organizations/cost_report` |

> 各平台余额接口可能随官方调整，解析失败时请以其官方文档为准；新增平台见下文「扩展新平台」。

## 架构

```
Host（Node 进程）                     Client（浏览器）
───────────────                     ──────────────
lib/index.js                         lib/client.js
 ├─ GET  /balance/providers          标题栏胶囊 + 下拉卡片（双 tab）
 ├─ GET  /balance/status               ├─ 余额 tab：余额显示
 ├─ GET  /balance/usage                ├─ 用量 tab：30天费用/配额
 ├─ POST /balance/config               ├─ 平台下拉选择
 ├─ POST /balance/usage-config         ├─ API Key 输入
 ├─ POST /balance/clear                └─ 附加参数（按平台动态渲染）
 └─ POST /balance/usage-clear
        │
        └─ credentials 服务（~/.dsh/.credentials.yaml）
           BALANCE_PROVIDER / BALANCE_API_KEY / BALANCE_EXTRA
           USAGE_PROVIDER  / USAGE_API_KEY  / USAGE_EXTRA
```

Host 通过 `webServer` 注册 loopback-only 的 `/balance/*` 路由，读取凭据库后请求对应平台的余额或用量接口；Client 直接 `fetch` 同源路由，用 `React.createElement` 渲染挂件（含余额/用量双 tab，`__ModuleLoader__` 打包格式，无需构建步骤）。

## 安装

### 方式一：`dsh plugin` 命令

```bash
dsh plugin --profile web add https://github.com/Badegg404/dsh-api-balance.git
```

### 方式二：手动安装

1. 把本仓库放到本地（如 `~/.dsh/profiles/web/plugins/dsh-api-balance/`）
2. 编辑 `~/.dsh/profiles/web/package.json`：

```jsonc
{
  "dependencies": {
    "@Badegg404/dsh-api-balance": "file:plugins/dsh-api-balance"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ...已有 bundles...
        "@Badegg404/dsh-api-balance"
      ]
    }
  }
}
```

3. `pnpm install`，然后重启 DSH。

## 使用

1. 打开一个会话，标题栏「Session log」左侧出现胶囊
2. 「余额监控」tab：选余额平台 → 粘贴 API Key（AGICTO 还需填账户 UUID）→ 保存并查询；余额显示在胶囊与 tab 里，30 秒自动刷新
3. 切到「用量监控」tab：选用量平台（如 OpenAI）→ 粘贴 API Key → 保存并查询；显示近 30 天费用（智谱为 token 配额），同样自动刷新

## 展示

```
┌─ 标题栏 ───────────────────────────────────────────┐
│ 会话标题…        [● 余额监控 12.34 USD] [Session log] │
└────────────────────────────────────────────────────┘
            │ 点开
            ▼
┌─ 账户监控 ──────────────────────┐
│ [ 余额监控 ] [ 用量监控 ]         │
├─────────────────────────────────┤
│ 平台        [AGICTO          ▾] │
│ AGICTO 余额  ¥ 4.9974451        │
│ API Key     [••••••••]          │
│ 账户 UUID   [a1b2c3...        ] │
│ [ 保存并查询 ]  [清除]  [刷新]    │
└─────────────────────────────────┘
```

## 扩展新平台

在 `lib/index.js` 的 `BALANCE_PROVIDERS`（余额）或 `USAGE_PROVIDERS`（用量）数组中追加一条声明，前端表单会自动渲染：

```js
{
  id: "myplatform",
  label: "My Platform",
  currency: "USD",                        // 显示用货币符号（可选）
  extraFields: [],                        // 附加参数（如 agicto 的 uuid）
  request: {
    method: "GET",
    url: "https://api.example.com/v1/balance",
    headers: { "Authorization": "Bearer {key}" },   // {key} → API Key
    // body: '{"uuid":"{uuid}"}',                    // 需要时启用，{字段名} → 附加参数
  },
  parse(res) {
    // 余额平台：返回 { balance: "12.34" }（或 { balance: null, error: "..." }）
    // 用量平台：返回 { summary: "近30天费用: $1.23" }（或 { summary: null, error: "..." }）
  },
}
```

`request.headers` / `request.body` 中的 `{key}` 与 `{<额外字段名>}` 占位符会在请求前被替换；用量平台还可使用 `{start_date}` / `{end_date}` / `{start_ts}` / `{end_ts}` / `{start_iso}` / `{end_iso}`（自动计算近 30 天窗口）。

## License

[MIT](LICENSE)
