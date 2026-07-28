// Receives events from the LINE Messaging API Official Account
// (separate channel from LINE Login, but same LINE Provider - so the
// "sub"/userId LINE hands us here is the same one we already stored
// as seeker_profiles.line_user_id from the Login flow). We only care
// about follow/unfollow: that's what determines whether a push
// message will actually succeed, since LINE rejects pushes to anyone
// who hasn't added the Official Account as a friend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHANNEL_SECRET = Deno.env.get("LINE_MESSAGING_CHANNEL_SECRET")!;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");
  const valid = await verifySignature(rawBody, signature);
  if (!valid) return new Response("invalid signature", { status: 401 });

  // LINE requires a fast 200 response regardless of what we do with
  // the events, and retries on non-200 - so failures here are logged,
  // not surfaced as an error status, to avoid endless LINE-side retries.
  try {
    const body = JSON.parse(rawBody);
    const events = Array.isArray(body.events) ? body.events : [];

    for (const event of events) {
      const lineUserId = event?.source?.userId;
      if (!lineUserId) continue;

      if (event.type === "follow") {
        await admin
          .from("seeker_profiles")
          .update({ line_messaging_linked_at: new Date().toISOString() })
          .eq("line_user_id", lineUserId);
      } else if (event.type === "unfollow") {
        await admin
          .from("seeker_profiles")
          .update({ line_messaging_linked_at: null })
          .eq("line_user_id", lineUserId);
      }
    }
  } catch (e) {
    console.error(e);
  }

  return new Response("ok", { status: 200 });
});
