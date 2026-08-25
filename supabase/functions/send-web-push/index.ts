import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

function getSecretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      const key = Object.values(parsed).find((value) => value.startsWith("sb_secret_"));
      if (key) return key;
    } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
      },
    });
  }

  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response("VAPID secrets are not configured", { status: 500 });
  }

  const payload = await req.json();
  const row = payload.record ?? payload.new ?? payload;

  webpush.setVapidDetails(
    "mailto:admin@ureemtelecom.co.kr",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!supabaseUrl || !secretKey) {
    return new Response("Supabase server credentials are unavailable", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, secretKey);
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const product = row.product || "인터넷 상담";
  const name = row.name || "고객";
  const phone = row.phone || "";
  const body = `${name} · ${product}${phone ? ` · ${phone}` : ""}`;

  const notification = JSON.stringify({
    title: "🔔 유림텔레콤 신규 상담",
    body,
    tag: `consultation-${row.id ?? Date.now()}`,
    url: "/ureemchungnam-test/admin/",
  });

  let sent = 0;
  let removed = 0;

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        notification,
      );
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed += 1;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, total: subscriptions?.length ?? 0, removed }), {
    headers: { "Content-Type": "application/json" },
  });
});
