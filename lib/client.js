window.__ModuleLoader__.load({
  id: "@huaidan2025/dsh-api-balance",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    const CSS = `
.bmon-root { position: relative; display: inline-flex; align-items: center; }
.bmon-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 20px; cursor: pointer; white-space: nowrap; }
.bmon-chip:hover { background: var(--dsw-alias-bg-layer-1); }
.bmon-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-warn-primary); flex: none; }
.bmon-chip-dot.ok { background: var(--dsw-alias-state-success-primary); }
.bmon-chip-dot.err { background: var(--dsw-alias-state-error-primary); }
.bmon-chip-bal { font-weight: 600; color: var(--dsw-alias-state-success-primary); }
.bmon-chip-note { color: var(--dsw-alias-label-secondary); }
.bmon-drop { position: absolute; top: calc(100% + 10px); right: 0; width: 300px; z-index: 2000; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.25); overflow: hidden; }
.bmon-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.bmon-title { font-size: 13px; font-weight: 600; }
.bmon-btn { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer; }
.bmon-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.bmon-btn:disabled { opacity: 0.5; cursor: default; }
.bmon-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.bmon-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; gap: 8px; }
.bmon-label { color: var(--dsw-alias-label-secondary); }
.bmon-value { font-weight: 600; font-size: 15px; color: var(--dsw-alias-state-success-primary); }
.bmon-sub { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
.bmon-ok { color: var(--dsw-alias-state-success-primary); font-size: 11px; }
.bmon-warn { color: var(--dsw-alias-state-warn-primary); font-size: 11px; line-height: 1.4; }
.bmon-err { color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 1.4; }
.bmon-input { width: 100%; box-sizing: border-box; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 8px; font-size: 12px; }
.bmon-input::placeholder { color: var(--dsw-alias-label-secondary); }
.bmon-field { display: flex; flex-direction: column; gap: 4px; }
.bmon-field-label { font-size: 11px; color: var(--dsw-alias-label-secondary); }
`;

    function ensureCss() {
      const tagId = "@huaidan2025/dsh-api-balance/balance.css";
      if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
        const tag = document.createElement("style");
        tag.dataset.plugin = "@huaidan2025/dsh-api-balance";
        tag.dataset.pluginCss = tagId;
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }
    }

    const fmtTime = (ts) => {
      if (!ts) return "--";
      const d = new Date(ts);
      const p = (n) => (n < 10 ? "0" + n : "" + n);
      return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    };

    function apply(ctx) {
      ensureCss();
      const slots = ctx.get("slots");
      if (slots === undefined) return;
      const timer = ctx.get("timer");

      function BalanceWidget() {
        const [open, setOpen] = react.useState(false);
        const [providers, setProviders] = react.useState([]);
        const [provider, setProvider] = react.useState("");
        const [apiKey, setApiKey] = react.useState("");
        const [extra, setExtra] = react.useState({});
        const [showKey, setShowKey] = react.useState(false);
        const [status, setStatus] = react.useState(null);
        const [loading, setLoading] = react.useState(false);
        const [error, setError] = react.useState(null);
        const [lastTs, setLastTs] = react.useState(null);
        const [saving, setSaving] = react.useState(false);

        const refresh = async () => {
          setLoading(true);
          setError(null);
          try {
            const r = await fetch("/balance/status");
            const j = await r.json();
            setStatus(j);
            setLastTs(Date.now());
          } catch (e) {
            setError(e && e.message ? e.message : String(e));
          } finally {
            setLoading(false);
          }
        };

        react.useEffect(() => {
          (async () => {
            try {
              const r = await fetch("/balance/providers");
              const j = await r.json();
              if (j && Array.isArray(j.providers)) setProviders(j.providers);
            } catch (e) { /* ignore */ }
            try {
              const r = await fetch("/balance/status");
              const j = await r.json();
              setStatus(j);
              if (j && j.provider) setProvider(j.provider);
              if (j && j.extra && typeof j.extra === "object") setExtra(j.extra);
              setLastTs(Date.now());
            } catch (e) { /* ignore */ }
          })();
          let stop = null;
          if (timer) stop = timer.interval(refresh, 30000);
          return () => { if (stop) stop(); };
        }, []);

        const save = async () => {
          setSaving(true);
          try {
            const r = await fetch("/balance/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ provider: provider, apiKey: apiKey, extra: extra }),
            });
            const j = await r.json();
            if (j && j.error) setError(j.error);
            await refresh();
          } finally {
            setSaving(false);
          }
        };

        const clear = async () => {
          setSaving(true);
          try {
            const r = await fetch("/balance/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            const j = await r.json();
            if (j && j.error) setError(j.error);
            setApiKey("");
            setExtra({});
            setProvider("");
            await refresh();
          } finally {
            setSaving(false);
          }
        };

        const activeProvider = (status && status.provider) || provider;
        const active = providers.find((p) => p.id === activeProvider) || null;
        const extraFields = active ? (active.extraFields || []) : [];
        const configured = !!(status && status.configured);
        const balance = status && status.balance;
        const currency = status && status.currency;
        const providerLabel = (status && status.providerLabel) || (active && active.label) || "余额";
        const balanceError = status && status.balanceError;

        let dot = "bmon-chip-dot";
        if (!configured) dot += " err";
        else if (balance) dot += " ok";

        const chipChildren = [
          react.createElement("span", { key: "dot", className: dot }),
          react.createElement("span", { key: "lbl" }, providerLabel),
        ];
        if (balance) {
          chipChildren.push(react.createElement("span", { key: "bal", className: "bmon-chip-bal" }, balance + (currency ? " " + currency : "")));
        } else {
          chipChildren.push(react.createElement("span", { key: "note", className: "bmon-chip-note" }, configured ? "…" : "未配置"));
        }

        const chip = react.createElement("button", {
          type: "button",
          className: "bmon-chip",
          onClick: () => setOpen(!open),
          title: "余额监控",
        }, chipChildren);

        let dropdown = null;
        if (open) {
          const rows = [];
          rows.push(react.createElement("div", { key: "bal", className: "bmon-row" },
            react.createElement("span", { className: "bmon-label" }, providerLabel + " 余额"),
            react.createElement("span", { className: "bmon-value" }, balance != null ? (balance + (currency ? " " + currency : "")) : (loading ? "…" : (balanceError || "—"))),
          ));
          if (balanceError) rows.push(react.createElement("div", { key: "balerr", className: "bmon-warn" }, balanceError));
          if (error) rows.push(react.createElement("div", { key: "err", className: "bmon-err" }, "通信错误: " + error));
          rows.push(react.createElement("div", { key: "foot", className: "bmon-row" },
            react.createElement("span", { className: "bmon-sub" }, loading ? "更新中…" : ("更新于 " + fmtTime(lastTs))),
            react.createElement("button", { className: "bmon-btn", onClick: refresh, disabled: loading }, "刷新"),
          ));

          const providerOptions = providers.map((p) => react.createElement("option", { key: p.id, value: p.id }, p.label));

          const extraInputs = extraFields.map((f) => {
            const val = extra[f.key] || "";
            return react.createElement("div", { key: f.key, className: "bmon-field" },
              react.createElement("span", { className: "bmon-field-label" }, f.label + (f.required ? "（必填）" : "")),
              react.createElement("input", { className: "bmon-input", type: "text", placeholder: f.placeholder || "", value: val, onChange: (e) => setExtra(Object.assign({}, extra, { [f.key]: e.target.value })) }),
            );
          });

          dropdown = react.createElement("div", { className: "bmon-drop" },
            react.createElement("div", { className: "bmon-head" },
              react.createElement("span", { className: "bmon-title" }, "余额监控"),
              react.createElement("button", { className: "bmon-btn", onClick: () => setOpen(false) }, "收起"),
            ),
            react.createElement("div", { className: "bmon-body" },
              rows,
              react.createElement("div", { className: "bmon-field" },
                react.createElement("span", { className: "bmon-field-label" }, "平台"),
                react.createElement("select", { className: "bmon-input", value: activeProvider, onChange: (e) => { setProvider(e.target.value); setExtra({}); } }, providerOptions),
              ),
              react.createElement("div", { className: "bmon-field" },
                react.createElement("div", { className: "bmon-row" },
                  react.createElement("span", { className: "bmon-field-label" }, "API Key"),
                  configured ? react.createElement("span", { className: "bmon-ok" }, "✓ 已保存") : null,
                ),
                react.createElement("div", { style: { display: "flex", gap: "6px" } },
                  react.createElement("input", { className: "bmon-input", type: showKey ? "text" : "password", placeholder: configured ? "已保存，留空不修改" : "粘贴 API Key", value: apiKey, onChange: (e) => setApiKey(e.target.value) }),
                  react.createElement("button", { className: "bmon-btn", onClick: () => setShowKey(!showKey) }, showKey ? "隐藏" : "显示"),
                ),
              ),
              extraInputs,
              react.createElement("div", { style: { display: "flex", gap: "6px" } },
                react.createElement("button", { className: "bmon-btn", onClick: save, disabled: saving, style: { flex: 1, padding: "7px 8px" } }, saving ? "保存中…" : "保存并查询"),
                configured ? react.createElement("button", { className: "bmon-btn", onClick: clear, disabled: saving }, "清除") : null,
              ),
            ),
          );
        }

        return react.createElement("div", { className: "bmon-root" }, chip, dropdown);
      }

      slots.inject("conversation.session.header.utilities", () => slots.register(
        { name: "conversation.session.header.utilities", id: "dsh-api-balance", order: -2, label: "余额监控" },
        () => react.createElement(BalanceWidget),
      ));
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
