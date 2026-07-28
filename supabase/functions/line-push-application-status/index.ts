// Called by a Supabase Database Webhook on UPDATE of
// public.seeker_applications. Sends a LINE push message to the seeker
// when their application status actually changes, if they've linked
// LINE (via Login) and added the Official Account as a friend (via
// line-webhook's follow event), and haven't turned the
// notification_preferences.application_status toggle off.
//
// Database Webhooks fire on any UPDATE to the row, not just a status
// change (e.g. the employer's chat message field also lives outside
// this table, but other non-status fields could still trigger this
// webhook) - old_record/record are compared here so an unrelated
// update doesn't send a spurious push.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")!;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Mirrors the LABELS map in application-status.js so the push message
// text matches what the seeker sees in the app.
const STATUS_LABELS: Record<string, string> = {
  applied: "応募済み",
  screening: "選考中",
  offer_pending: "採用承諾待ち",
  hired: "採用決定",
  working: "勤務中",
  completed: "完了",
  rejected: "不採用",
  withdrawn: "辞退",
  cancelled: "キャンセル",
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    if (payload.type !== "UPDATE" || payload.table !== "seeker_applications") {
      return new Response("ignored", { status: 200 });
    }

    const record = payload.record;
    const oldRecord = payload.old_record;
    if (!record || !oldRecord || record.status === oldRecord.status) {
      return new Response("no status change", { status: 200 });
    }

    const { data: seeker, error: seekerError } = await admin
      .from("seeker_profiles")
      .select("line_user_id, line_messaging_linked_at, notification_preferences")
      .eq("user_id", record.user_id)
      .maybeSingle();
    if (seekerError) throw seekerError;

    const linked = seeker?.line_user_id && seeker?.line_messaging_linked_at;
    const notifyEnabled = seeker?.notification_preferences?.application_status !== false;
    if (!linked || !notifyEnabled) {
      return new Response("not linked or notifications off", { status: 200 });
    }

    const label = STATUS_LABELS[record.status] || record.status;
    const jobTitle = record.job_title || "求人";
    const text = `【応募状況が更新されました】\n${jobTitle}\nステータス: ${label}\n\n詳細はアプリでご確認ください。`;

    const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: seeker.line_user_id,
        messages: [{ type: "text", text }],
      }),
    });
    if (!pushRes.ok) {
      console.error("LINE push failed", await pushRes.text());
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
