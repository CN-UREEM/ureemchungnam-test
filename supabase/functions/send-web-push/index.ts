import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  const payload = await req.json();
  const row = payload.record ?? payload.new ?? payload;

  webpush.setVapidDetails(
    "mailto:admin@ureemtelecom.co.kr",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) return new Response(error.message, { status: 500, headers: cors });

  const product = row.product || "인터넷 상담";
  const name = row.name || "고객";
  const phone = row.phone || "";
  const body = `${name} · ${product}${phone ? ` · ${phone}` : ""}`;
  const notification = JSON.stringify({
    title: "🔔 유림텔레콤 신규 상담",
    body,
    tag: `consultation-${row.id ?? Date.now()}`,
    url: "/ureemchungnam-test/admin/dashboard.html",
  });

  const results = await Promise.allSettled((subscriptions ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, notification);
      return { id: sub.id, ok: true };
    } catch (e) {
      const status = e?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
      return { id: sub.id, ok: false, status };
    }
  }));

  const sent = results.filter(x => x.status === "fulfilled" && x.value.ok).length;
  return new Response(JSON.stringify({ ok: true, sent, total: subscriptions?.length ?? 0 }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
