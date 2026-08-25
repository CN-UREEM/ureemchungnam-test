-- 1) Supabase Database > Extensions에서 pg_net을 먼저 활성화하세요.
-- 2) Supabase Vault에 secret을 아래 이름으로 저장하세요.
--    name: ureem_webhook_secret
--    value: Edge Function Secret WEBHOOK_SECRET과 동일한 값
--
-- 3) 아래 SQL을 SQL Editor에서 실행하세요.

create or replace function public.notify_ureem_web_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret
    into webhook_secret
  from vault.decrypted_secrets
  where name = 'ureem_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise warning 'ureem_webhook_secret is missing from Supabase Vault';
    return new;
  end if;

  perform net.http_post(
    url := 'https://ptzbbmevdefnfjjinnie.supabase.co/functions/v1/send-web-push',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'internet_consultations',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists trg_ureem_web_push on public.internet_consultations;

create trigger trg_ureem_web_push
after insert on public.internet_consultations
for each row
execute function public.notify_ureem_web_push();
