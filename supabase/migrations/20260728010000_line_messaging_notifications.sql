-- First real notification-delivery channel for this app (nothing sent
-- notifications before this - the toggles in seeker-settings.html's
-- 通知設定 were preferences with no dispatch behind them). Uses a
-- separate LINE Messaging API channel from the LINE Login channel
-- (same LINE Provider, so LINE's unified user ID means the "sub" we
-- already store as seeker_profiles.line_user_id from Login also
-- identifies the same person's Messaging API "follow" events).
--
-- line_messaging_linked_at is set/cleared by the line-webhook Edge
-- Function on LINE's follow/unfollow events. A push to someone who
-- hasn't added the Official Account as a friend simply fails on
-- LINE's side, so this column is what lets us skip that attempt and
-- show real connected/not-connected status in seeker-settings.html.
alter table public.seeker_profiles
  add column if not exists line_messaging_linked_at timestamptz;
