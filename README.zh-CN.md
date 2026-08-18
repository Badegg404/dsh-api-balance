# dsh-api-balance

> **DSH 插件** · 在 DeepSeek Harness 会话标题栏悬浮显示多个 AI 平台的账户余额。

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-4ade80)](#) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](./README.md)

一个面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的持久化 Web 插件：在页面右上角标题栏（「Session log」按钮左侧）挂一个小胶囊，实时显示所选平台的账户余额；点开展开下拉卡片，可切换平台、填写 API Key 并手动刷新。

## 特性

- **多平台统一**：一个插件查询多个 AI 供应商余额，平台在 UI 里切换
- **持久化**：平台 / API Key / 附加参数存入 DSH 凭据库（`~/.dsh/.credentials.yaml`，权限 0600），重启不丢
- **实时刷新**：30 秒自动轮询 + 手动刷新
- **安全**：Host 路由仅接受 loopback 请求；API Key 永不回传前端、不写日志
- **主题适配**：全部样式走 DSH 主题 token，跟随明暗主题
- **易扩展**：新增平台只需在 Host 的 `PROVIDERS` 数组里加一条声明，前端自动渲染对应表单

## 支持平台

| 平台 | 余额接口 | 附加参数 |
| --- | --- | --- |
| AGICTO | `POST /v1/enterprise/account` | `uuid`（账户 UUID） |
| DeepSeek | `GET /user/balance` | — |
| OpenRouter | `GET /api/v1/credits` | — |
| Moonshot (Kimi) | `GET /v1/users/me/balance` | — |
| 硅基流动 SiliconFlow | `GET /v1/user/info` | — |
| OpenAI | `GET /v1/dashboard/billing/subscription` | — |

> 各平台余额接口可能随官方调整，解析失败时请以其官方文档为准；新增平台见下文「扩展新平台」。

## 架构

```
Host（Node 进程）                     Client（浏览器）
───────────────                     ──────────────
lib/index.js                         lib/client.js
 ├─ GET  /balance/providers          标题栏胶囊 + 下拉卡片
 ├─ GET  /balance/status               ├─ 平台下拉选择
 ├─ POST /balance/config               ├─ API Key 输入
 └─ POST /balance/clear                ├─ 附加参数（按平台动态渲染）
        │                              └─ 余额 / 刷新 / 清除
        └─ credentials 服务（~/.dsh/.credentials.yaml）
           BALANCE_PROVIDER / BALANCE_API_KEY / BALANCE_EXTRA
```

Host 通过 `webServer` 注册 loopback-only 的 `/balance/*` 路由，读取凭据库后请求对应平台的余额接口；Client 直接 `fetch` 同源路由，用 `React.createElement` 渲染挂件（`__ModuleLoader__` 打包格式，无需构建步骤）。

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

1. 打开一个会话，标题栏「Session log」左侧出现「余额监控」胶囊
2. 点开胶囊 → 选择平台 → 粘贴 API Key（AGICTO 还需填账户 UUID）→ 保存并查询
3. 余额显示在胶囊与下拉卡片里，30 秒自动刷新

## 展示

```
┌─ 标题栏 ───────────────────────────────────────────┐
│ 会话标题…        [● 余额监控 12.34 USD] [Session log] │
└────────────────────────────────────────────────────┘
            │ 点开
            ▼
┌─ 余额监控 ──────────────────────┐
│ 平台        [AGICTO          ▾] │
│ AGICTO 余额  ¥ 4.9974451        │
│ API Key     [••••••••]     显示 │
│ 账户 UUID   [a1b2c3...        ] │
│ [ 保存并查询 ]  [清除]  [刷新]    │
└─────────────────────────────────┘
```

## 扩展新平台

在 `lib/index.js` 的 `PROVIDERS` 数组中追加一条声明，前端表单会自动渲染：

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
    return { balance: String(res.data.balance) };    // 或 { balance: null, error: "..." }
  },
}
```

`request.headers` / `request.body` 中的 `{key}` 与 `{<额外字段名>}` 占位符会在请求前被替换；`parse` 返回 `{ balance }` 或 `{ balance: null, error }`。

## License

[MIT](LICENSE)
