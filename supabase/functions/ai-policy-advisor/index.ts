import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};
const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, "Content-Type": "application/json" } });

const ROLES = ["owner", "manager", "cashier", "user"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Please sign in." }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Please sign in." }, 401);
    const { data: isAdmin } = await sb.rpc("is_admin_or_owner", { _user_id: user.id });
    if (!isAdmin) return json({ error: "Only admins and owners can use the advisor." }, 403);

    const { policy, modules, current } = await req.json();
    if (typeof policy !== "string" || policy.trim().length < 10 || policy.length > 6000)
      return json({ error: "Describe your policies in 10–6000 characters." }, 400);
    const moduleKeys: string[] = (modules || []).map((m: any) => String(m.key));

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["summary", "modules", "role_permissions", "rules"],
      properties: {
        summary: { type: "string" },
        modules: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["key", "enabled", "reason"],
            properties: { key: { type: "string", enum: moduleKeys }, enabled: { type: "boolean" }, reason: { type: "string" } },
          },
        },
        role_permissions: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["role", "modules", "reason"],
            properties: {
              role: { type: "string", enum: ROLES },
              modules: { type: "array", items: { type: "string", enum: moduleKeys } },
              reason: { type: "string" },
            },
          },
        },
        rules: {
          type: "object", additionalProperties: false, required: ["pos_allow_manual_entry", "reason"],
          properties: { pos_allow_manual_entry: { type: "boolean" }, reason: { type: "string" } },
        },
      },
    };

    const input = [
      {
        role: "system",
        content:
          "You configure an inventory/POS business system. Given the admin's operational policies, recommend which modules to enable, which modules each role (owner, manager, cashier, user) may open, and module rules. Admin always has full access and is not listed. 'dashboard', 'settings' and 'users' modules must stay enabled. Give one entry per module and per role. Keep reasons short (one sentence) and in the same language as the policy text.",
      },
      {
        role: "user",
        content: `Available modules: ${JSON.stringify(modules)}\nCurrent settings: ${JSON.stringify(current)}\n\nOur policies:\n${policy}`,
      },
    ];

    const runId = req.headers.get("X-Lovable-AIG-Run-ID")?.trim();
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY") ?? "",
        "X-Lovable-AIG-SDK": "fetch",
        ...(runId ? { "X-Lovable-AIG-Run-ID": runId } : {}),
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "policy_recommendation", strict: true, schema } },
      }),
    });
    const aigHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (k.toLowerCase().startsWith("x-lovable-aig-")) aigHeaders[k] = v; });

    if (!res.ok || !res.body) {
      let message = "The AI advisor is unavailable right now.";
      try { const e = await res.json(); message = e?.error?.message || e?.message || message; } catch { /* ignore */ }
      if (res.status === 429) message = "Too many requests — please wait a moment and try again.";
      if (res.status === 402) message = message || "AI credits are used up for this workspace.";
      return json({ error: message }, res.status, aigHeaders);
    }

    // Read the stream server-side and collect the final JSON text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", failed = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") failed = "The AI declined to answer this request.";
          else if (ev.type === "response.failed" || ev.type === "error")
            failed = ev.response?.error?.message || ev.error?.message || ev.message || "The AI request failed.";
        } catch { /* partial line */ }
      }
    }
    if (failed || !text) return json({ error: failed || "The AI returned no answer." }, 502, aigHeaders);
    return json({ recommendation: JSON.parse(text) }, 200, aigHeaders);
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: cors });
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
