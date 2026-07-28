// Called by a Supabase Database Webhook on INSERT of
// public.application_messages. Sends a LINE push to the seeker when
// the EMPLOYER sends a new chat message (never the reverse - a seeker
// doesn't need to be notified of their own message), if they've
// linked LINE and haven't turned off notification_preferences.messages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")!;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    if (payload.type !== "INSERT" || payload.table !== "application_messages") {
      return new Response("ignored", { status: 200 });
    }

    const record = payload.record;
    if (!record) return new Response("no record", { status: 200 });

    const { data: application, error: applicationError } = await admin
      .from("seeker_applications")
      .select("user_id, job_title, facility_name")
      .eq("id", record.application_id)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return new Response("application not found", { status: 200 });

    // Only notify when the employer sent it - a seeker's own message
    // to their own application doesn't need a push back to themselves.
    if (record.sender_id === application.user_id) {
      return new Response("sender is the seeker", { status: 200 });
    }

    const { data: seeker, error: seekerError } = await admin
      .from("seeker_profiles")
      .select("line_user_id, line_messaging_linked_at, notification_preferences")
      .eq("user_id", application.user_id)
      .maybeSingle();
    if (seekerError) throw seekerError;

    const linked = seeker?.line_user_id && seeker?.line_messaging_linked_at;
    const notifyEnabled = seeker?.notification_preferences?.messages !== false;
    if (!linked || !notifyEnabled) {
      return new Response("not linked or notifications off", { status: 200 });
    }

    const jobTitle = application.job_title || application.facility_name || "応募";
    const preview = String(record.body || "").slice(0, 80);
    const text = `【新しいメッセージ】\n${jobTitle}\n\n${preview}\n\nアプリでご確認ください。`;

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
