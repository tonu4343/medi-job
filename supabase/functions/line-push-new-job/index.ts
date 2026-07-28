// Called by a Supabase Database Webhook on INSERT of public.jobs.
// Broadcasts every new job posting to every seeker who has LINE
// linked and hasn't turned off notification_preferences.new_jobs -
// no area/style matching, since seeker_profiles.preferred_area and
// jobs.location are both free text with no structured link between
// them (a substring match would be too unreliable to be useful).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")!;
const SITE_URL = "https://medispotjob.vercel.app";

// LINE's multicast endpoint accepts at most 500 recipients per call.
const MULTICAST_BATCH_SIZE = 500;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    if (payload.type !== "INSERT" || payload.table !== "jobs") {
      return new Response("ignored", { status: 200 });
    }

    const job = payload.record;
    if (!job || job.status !== "open") {
      return new Response("job not open", { status: 200 });
    }

    const { data: seekers, error: seekersError } = await admin
      .from("seeker_profiles")
      .select("line_user_id, notification_preferences")
      .not("line_user_id", "is", null)
      .not("line_messaging_linked_at", "is", null);
    if (seekersError) throw seekersError;

    const recipientIds = (seekers || [])
      .filter((s) => s.notification_preferences?.new_jobs !== false)
      .map((s) => s.line_user_id as string);

    if (recipientIds.length === 0) {
      return new Response("no recipients", { status: 200 });
    }

    const facility = job.facility_name || "求人";
    const title = job.title || "新着求人";
    const location = job.location ? `\n勤務地: ${job.location}` : "";
    const text = `【新着求人】\n${facility}\n${title}${location}\n\n${SITE_URL}/job-detail.html?id=${job.id}`;

    for (const batch of chunk(recipientIds, MULTICAST_BATCH_SIZE)) {
      const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          to: batch,
          messages: [{ type: "text", text }],
        }),
      });
      if (!res.ok) {
        console.error("LINE multicast failed", await res.text());
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
