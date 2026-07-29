-- Captures Resend's own message id per send attempt, so a delivery
-- can be cross-referenced in Resend's dashboard directly from
-- admin-email-logs.html instead of only having our internal log.
alter table public.email_delivery_logs
  add column if not exists resend_message_id text;
