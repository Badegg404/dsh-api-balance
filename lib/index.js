// dsh-api-balance — host half.
// A multi-provider balance + usage widget for DSH Web. The host serves
// loopback-only /balance/* routes, reads config from the harness credentials
// store (~/.dsh/.credentials.yaml), and queries the selected provider.

// --- loopback trust fence (mirrors the DSH web plugin convention) ---
function isIPv4Loopback(v4) {
  const parts = v4.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isLoopbackAddress(address) {
  if (address === undefined) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return isIPv4Loopback(normalized.slice(7));
  return isIPv4Loopback(normalized);
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  return isIPv4Loopback(hostname);
}
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try { hostUrl = new URL("http://" + host); } catch { return false; }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === hostUrl.host; } catch { return false; }
}

// --- balance providers (money/credit balance) ---
const BALANCE_PROVIDERS = [
  {
    id: "agicto",
    label: "AGICTO",
    docUrl: "https://docs.agicto.com/api-reference/account/balance",
    extraFields: [{ key: "uuid", label: "账户 UUID", placeholder: "控制台账户页可查", required: true }],
    request: {
      method: "POST",
      url: "https://api.agicto.cn/v1/enterprise/account",
      headers: { "Authorization": "Bearer {key}", "Content-Type": "application/json" },
      body: '{"uuid":"{uuid}"}',
    },
    parse(res) {
      if (!res || res.code !== 0 || !res.data || typeof res.data.account === "undefined") {
        return { balance: null, error: (res && res.message) || "响应格式异常" };
      }
      return { balance: String(res.data.account) };
    },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    docUrl: "https://api-docs.deepseek.com/",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.deepseek.com/user/balance",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      if (!res || res.is_available !== true) return { balance: null, error: "余额不可用" };
      const infos = (res.balance_infos && res.balance_infos.length) ? res.balance_infos : [{}];
      return { balance: String(infos[0].total_balance ?? ""), currency: infos[0].currency || "" };
    },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    docUrl: "https://openrouter.ai/docs/api-reference/get-credits",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://openrouter.ai/api/v1/credits",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      if (!res || !res.data) return { balance: null, error: "响应格式异常" };
      const remaining = Number(res.data.total_credits) - Number(res.data.total_usage);
      return { balance: String(remaining) };
    },
  },
  {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    docUrl: "https://platform.moonshot.cn/docs/",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.moonshot.cn/v1/users/me/balance",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      const d = (res && res.data) ? res.data : {};
      const v = d.available_balance ?? d.balance;
      if (v === undefined) return { balance: null, error: "响应格式异常" };
      return { balance: String(v), currency: d.currency || "" };
    },
  },
  {
    id: "siliconflow",
    label: "硅基流动 SiliconFlow",
    docUrl: "https://docs.siliconflow.cn/",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.siliconflow.cn/v1/user/info",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      const d = (res && res.data) ? res.data : {};
      if (d.balance === undefined) return { balance: null, error: "响应格式异常" };
      return { balance: String(d.balance) };
    },
  },
  {
    id: "minimax",
    label: "MiniMax",
    currency: "CNY",
    docUrl: "https://platform.minimaxi.com/",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.minimaxi.com/v1/token_plan/remains",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      const d = (res && res.data) ? res.data : {};
      if (d.remain === undefined) return { balance: null, error: "响应格式异常" };
      return { balance: String(d.remain) };
    },
  },
  {
    id: "stepfun",
    label: "阶跃星辰 StepFun",
    currency: "CNY",
    docUrl: "https://platform.stepfun.com/",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.stepfun.com/v1/accounts",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      if (!res || res.balance === undefined) return { balance: null, error: "响应格式异常" };
      return { balance: String(res.balance) };
    },
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    currency: "USD",
    docUrl: "https://console.x.ai/",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.x.ai/v1/billing/credits",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      const t = (res && res.total) ? res.total : {};
      if (t.val === undefined) return { balance: null, error: "响应格式异常" };
      return { balance: String(Math.abs(Number(t.val)) / 100) };
    },
  },
];

// --- usage providers (consumption / quota over time) ---
const USAGE_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    currency: "USD",
    docUrl: "https://platform.openai.com/usage",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.openai.com/v1/organization/costs?start_time={start_ts}&end_time={end_ts}&bucket_width=1d",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      if (!res || !Array.isArray(res.data)) return { summary: null, error: "无用量数据" };
      let cost = 0;
      for (const item of res.data) for (const b of (item.results || [])) cost += Number(b.amount || 0);
      return { summary: "近30天费用: $" + cost.toFixed(2) };
    },
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    docUrl: "https://open.bigmodel.cn/",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
      headers: { "Authorization": "{key}" },
    },
    parse(res) {
      if (!res || res.code !== 200) return { summary: null, error: (res && res.msg) || "响应格式异常" };
      const limits = (res.data && res.data.limits) || [];
      if (!limits.length) return { summary: null, error: "无配额信息" };
      const parts = limits.map((l) => (l.remaining ?? 0) + "/" + (l.number ?? 0));
      return { summary: "配额(剩余/总量): " + parts.join(" · ") };
    },
  },
  {
    id: "together",
    label: "Together AI",
    currency: "USD",
    docUrl: "https://api.together.ai/settings/organization",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.together.xyz/v1/billing/usage?start_date={start_date}&end_date={end_date}",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      if (!res || res.total_cost === undefined) return { summary: null, error: "响应格式异常" };
      return { summary: "近30天费用: $" + Number(res.total_cost).toFixed(2) };
    },
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    currency: "USD",
    docUrl: "https://console.anthropic.com/settings/usage",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.anthropic.com/v1/organizations/cost_report?start_time={start_iso}&end_time={end_iso}&bucket_width=1d",
      headers: { "x-api-key": "{key}", "anthropic-version": "2023-06-01" },
    },
    parse(res) {
      if (!res || !Array.isArray(res.data)) return { summary: null, error: "无用量数据（需 Admin Key）" };
      let cost = 0;
      for (const item of res.data) for (const b of (item.results || [])) cost += Number(b.amount || 0);
      return { summary: "近30天费用: $" + cost.toFixed(2) };
    },
  },
];

const byId = new Map([...BALANCE_PROVIDERS, ...USAGE_PROVIDERS].map((p) => [p.id, p]));

const REFS = {
  balance: { provider: "BALANCE_PROVIDER", apiKey: "BALANCE_API_KEY", extra: "BALANCE_EXTRA" },
  usage: { provider: "USAGE_PROVIDER", apiKey: "USAGE_API_KEY", extra: "USAGE_EXTRA" },
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { if (data.length < 1048576) data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function interpolate(template, vars) {
  if (typeof template !== "string") return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m));
}

async function doRequest(spec, vars) {
  const url = interpolate(spec.url, vars);
  const headers = {};
  for (const [name, value] of Object.entries(spec.headers || {})) headers[name] = interpolate(value, vars);
  let body;
  if (spec.body !== undefined) body = interpolate(spec.body, vars);
  const res = await fetch(url, {
    method: spec.method,
    headers,
    body,
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch { j = null; }
  return j;
}

async function resolveConfig(credentials, kind) {
  const refs = REFS[kind];
  let provider = "";
  let apiKey = "";
  let extra = {};
  const p = await credentials.resolve(refs.provider);
  const k = await credentials.resolve(refs.apiKey);
  const e = await credentials.resolve(refs.extra);
  if (p && typeof p.value === "string") provider = p.value;
  if (k && typeof k.value === "string") apiKey = k.value;
  if (e && typeof e.value === "string") { try { extra = JSON.parse(e.value) || {}; } catch { extra = {}; } }
  return { provider, apiKey, extra };
}

async function saveConfig(credentials, kind, provider, apiKey, extra) {
  const refs = REFS[kind];
  if (provider) await credentials.set(refs.provider, provider);
  if (apiKey) await credentials.set(refs.apiKey, apiKey);
  await credentials.set(refs.extra, JSON.stringify(extra || {}));
}

async function clearConfig(credentials, kind) {
  const refs = REFS[kind];
  await credentials.unset(refs.provider);
  await credentials.unset(refs.apiKey);
  await credentials.unset(refs.extra);
}

function meta(p) {
  return { id: p.id, label: p.label, currency: p.currency || "", docUrl: p.docUrl || "", extraFields: p.extraFields || [] };
}

function dateVars() {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const p2 = (n) => (n < 10 ? "0" + n : "" + n);
  const ymd = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  return {
    start_date: ymd(start),
    end_date: ymd(now),
    start_ts: String(Math.floor(start.getTime() / 1000)),
    end_ts: String(Math.floor(now.getTime() / 1000)),
    start_iso: start.toISOString(),
    end_iso: now.toISOString(),
  };
}

async function fetchBalance(provider, apiKey, extra) {
  const j = await doRequest(provider.request, Object.assign({ key: apiKey }, extra || {}));
  const parsed = provider.parse(j);
  if (parsed.error) return { balance: null, balanceError: parsed.error, currency: "" };
  return { balance: parsed.balance, balanceError: null, currency: parsed.currency || provider.currency || "" };
}

async function fetchUsage(provider, apiKey, extra) {
  const j = await doRequest(provider.request, Object.assign({ key: apiKey }, extra || {}, dateVars()));
  const parsed = provider.parse(j);
  return { summary: parsed.summary, error: parsed.error };
}

export const inject = ["webServer", "credentials"];

export function apply(ctx) {
  const handle = async (req, res) => {
    if (!isLoopbackRequest(req)) {
      sendJson(res, 403, { ok: false, error: "forbidden: loopback-only" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://x");
    const pathname = url.pathname;

    if (pathname === "/balance/providers" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        balance: BALANCE_PROVIDERS.map(meta),
        usage: USAGE_PROVIDERS.map(meta),
      });
      return;
    }

    if (pathname === "/balance/status" && req.method === "GET") {
      const cfg = await resolveConfig(ctx.credentials, "balance");
      if (cfg.apiKey.length === 0 || cfg.provider.length === 0) {
        sendJson(res, 200, { ok: false, error: "no-config", provider: cfg.provider, configured: false });
        return;
      }
      const provider = byId.get(cfg.provider);
      if (!provider) {
        sendJson(res, 200, { ok: false, error: "unknown-provider", provider: cfg.provider, configured: true });
        return;
      }
      const bal = await fetchBalance(provider, cfg.apiKey, cfg.extra);
      sendJson(res, 200, {
        ok: true, configured: true, provider: cfg.provider, providerLabel: provider.label,
        balance: bal.balance, balanceError: bal.balanceError, currency: bal.currency, ts: Date.now(),
      });
      return;
    }

    if (pathname === "/balance/usage" && req.method === "GET") {
      const cfg = await resolveConfig(ctx.credentials, "usage");
      if (cfg.apiKey.length === 0 || cfg.provider.length === 0) {
        sendJson(res, 200, { ok: false, error: "no-config", provider: cfg.provider, configured: false });
        return;
      }
      const provider = byId.get(cfg.provider);
      if (!provider) {
        sendJson(res, 200, { ok: false, error: "unknown-provider", provider: cfg.provider, configured: true });
        return;
      }
      const u = await fetchUsage(provider, cfg.apiKey, cfg.extra);
      sendJson(res, 200, {
        ok: true, configured: true, provider: cfg.provider, providerLabel: provider.label,
        summary: u.summary, error: u.error, ts: Date.now(),
      });
      return;
    }

    if (pathname === "/balance/config" && req.method === "POST") {
      const body = await readBody(req);
      let p = null;
      try { p = JSON.parse(body || "{}"); } catch { p = null; }
      if (!p || typeof p !== "object") { sendJson(res, 400, { ok: false, error: "bad request" }); return; }
      const provider = typeof p.provider === "string" ? p.provider.trim() : "";
      const apiKey = typeof p.apiKey === "string" ? p.apiKey.trim() : "";
      const extra = (p.extra && typeof p.extra === "object") ? p.extra : {};
      if (provider && !byId.has(provider)) { sendJson(res, 400, { ok: false, error: "unknown provider: " + provider }); return; }
      try {
        await saveConfig(ctx.credentials, "balance", provider, apiKey, extra);
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e && e.message ? e.message : String(e) });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/balance/usage-config" && req.method === "POST") {
      const body = await readBody(req);
      let p = null;
      try { p = JSON.parse(body || "{}"); } catch { p = null; }
      if (!p || typeof p !== "object") { sendJson(res, 400, { ok: false, error: "bad request" }); return; }
      const provider = typeof p.provider === "string" ? p.provider.trim() : "";
      const apiKey = typeof p.apiKey === "string" ? p.apiKey.trim() : "";
      const extra = (p.extra && typeof p.extra === "object") ? p.extra : {};
      if (provider && !byId.has(provider)) { sendJson(res, 400, { ok: false, error: "unknown provider: " + provider }); return; }
      try {
        await saveConfig(ctx.credentials, "usage", provider, apiKey, extra);
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e && e.message ? e.message : String(e) });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/balance/clear" && req.method === "POST") {
      try { await clearConfig(ctx.credentials, "balance"); } catch (e) {
        sendJson(res, 500, { ok: false, error: e && e.message ? e.message : String(e) });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/balance/usage-clear" && req.method === "POST") {
      try { await clearConfig(ctx.credentials, "usage"); } catch (e) {
        sendJson(res, 500, { ok: false, error: e && e.message ? e.message : String(e) });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    res.writeHead(404);
    res.end();
  };

  const dispose = ctx.webServer.register({ kind: "prefix", path: "/balance", handler: handle });
  ctx.effect(() => dispose, "dsh-api-balance: /balance routes");
}
