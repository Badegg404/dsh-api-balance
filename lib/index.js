// dsh-balance-monitor — host half.
// A multi-provider balance widget for DSH Web. The host serves loopback-only
// /balance/* routes, reads the active provider config from the harness
// credentials store (~/.dsh/.credentials.yaml), and queries the selected
// provider's balance endpoint.

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

// --- provider registry ---
// Each provider declares how to fetch and parse its balance. Add a provider by
// appending one entry below — the browser UI and routes pick it up automatically.
const PROVIDERS = [
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
    id: "openai",
    label: "OpenAI",
    docUrl: "https://platform.openai.com/docs/api-reference/billing",
    extraFields: [],
    request: {
      method: "GET",
      url: "https://api.openai.com/v1/dashboard/billing/subscription",
      headers: { "Authorization": "Bearer {key}" },
    },
    parse(res) {
      if (!res || typeof res.hard_limit_usd === "undefined") return { balance: null, error: "无订阅或响应格式异常" };
      return { balance: String(res.hard_limit_usd) };
    },
  },
];

const byId = new Map(PROVIDERS.map((p) => [p.id, p]));

const PROVIDER_REF = "BALANCE_PROVIDER";
const API_KEY_REF = "BALANCE_API_KEY";
const EXTRA_REF = "BALANCE_EXTRA";

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

async function resolveConfig(credentials) {
  let provider = "";
  let apiKey = "";
  let extra = {};
  const p = await credentials.resolve(PROVIDER_REF);
  const k = await credentials.resolve(API_KEY_REF);
  const e = await credentials.resolve(EXTRA_REF);
  if (p && typeof p.value === "string") provider = p.value;
  if (k && typeof k.value === "string") apiKey = k.value;
  if (e && typeof e.value === "string") { try { extra = JSON.parse(e.value) || {}; } catch { extra = {}; } }
  return { provider, apiKey, extra };
}

async function fetchBalance(provider, apiKey, extra) {
  const spec = provider.request;
  const vars = Object.assign({ key: apiKey }, extra || {});
  const headers = {};
  for (const [name, value] of Object.entries(spec.headers || {})) headers[name] = interpolate(value, vars);
  let body;
  if (spec.body !== undefined) body = interpolate(spec.body, vars);
  const res = await fetch(spec.url, {
    method: spec.method,
    headers,
    body,
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch { j = null; }
  const parsed = provider.parse(j);
  if (parsed.error) return { balance: null, balanceError: parsed.error, currency: "" };
  return { balance: parsed.balance, balanceError: null, currency: parsed.currency || provider.currency || "" };
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
      const list = PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        currency: p.currency || "",
        docUrl: p.docUrl || "",
        extraFields: p.extraFields || [],
      }));
      sendJson(res, 200, { ok: true, providers: list });
      return;
    }

    if (pathname === "/balance/status" && req.method === "GET") {
      const cfg = await resolveConfig(ctx.credentials);
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
        ok: true,
        configured: true,
        provider: cfg.provider,
        providerLabel: provider.label,
        extra: cfg.extra,
        balance: bal.balance,
        balanceError: bal.balanceError,
        currency: bal.currency,
        ts: Date.now(),
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
        if (provider) await ctx.credentials.set(PROVIDER_REF, provider);
        if (apiKey) await ctx.credentials.set(API_KEY_REF, apiKey);
        await ctx.credentials.set(EXTRA_REF, JSON.stringify(extra));
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e && e.message ? e.message : String(e) });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/balance/clear" && req.method === "POST") {
      try {
        await ctx.credentials.unset(PROVIDER_REF);
        await ctx.credentials.unset(API_KEY_REF);
        await ctx.credentials.unset(EXTRA_REF);
      } catch (e) {
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
  ctx.effect(() => dispose, "dsh-balance-monitor: /balance routes");
}
