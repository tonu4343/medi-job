// LINE Login, Method A (custom access token via Edge Function), per
// SparkleVision's implementation spec. Exchanges the LINE authorization
// code for tokens, verifies the ID token itself (LINE signs with
// HS256 using the Channel Secret - NOT a JWKS/RS256 provider, despite
// being OIDC-shaped), and finds-or-creates the matching seeker.
//
// Deviates from the generic spec in one place: seeker profile data
// goes into this app's existing public.seeker_profiles table (matched
// by line_user_id) instead of a new generic "profiles" table, because
// every other seeker page (dashboard, resume, applications, messages,
// account-status checks) already reads/writes seeker_profiles keyed by
// user_id. A separate table would leave LINE-authenticated users with
// a valid session but invisible to the rest of the app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.9.6/index.ts";

const CHANNEL_ID = Deno.env.get("LINE_CHANNEL_ID")!;
const CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const REDIRECT_URI = Deno.env.get("LINE_REDIRECT_URI")!;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { code } = await req.json();
    if (!code) throw new Error("code is required");

    // 1) Authorization code -> tokens
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CHANNEL_ID,
        client_secret: CHANNEL_SECRET,
      }),
    });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const { id_token } = await tokenRes.json();

    // 2) Verify the ID token. LINE uses HS256 (the Channel Secret is
    // the signing key) - an RS256/JWKS lookup here would be wrong.
    const { payload } = await jose.jwtVerify(
      id_token,
      new TextEncoder().encode(CHANNEL_SECRET),
      { issuer: "https://access.line.me", audience: CHANNEL_ID }
    );
    const lineUserId = payload.sub as string;
    // seeker_profiles.email is not-null; LINE only returns a real email
    // if the channel has email-scope approval and the user consented.
    const email = (payload.email as string) ?? `${lineUserId}@line.local`;
    const name = (payload.name as string) ?? "";
    const picture = payload.picture as string | undefined;

    // 3) Find or create the seeker, matched by line_user_id (stable
    // per channel; re-creating the LINE channel would issue new sub
    // values even for the same real person).
    const { data: existingByLine, error: existingByLineError } = await admin
      .from("seeker_profiles")
      .select("user_id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (existingByLineError) throw existingByLineError;

    let userId = existingByLine?.user_id as string | undefined;

    if (userId) {
      // Repeat LINE login - keep the display name in sync (LINE names
      // can change) but never touch fields the seeker filled in
      // themselves elsewhere (license, resume, etc.).
      const { error: updateError } = await admin
        .from("seeker_profiles")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (updateError) throw updateError;
    } else {
      // No LINE-linked account yet. If LINE handed back a real email
      // (only possible once the channel's email scope is approved -
      // the synthetic @line.local fallback can never match a real
      // signup) and a seeker already registered that email via
      // password signup, link this LINE identity onto that existing
      // account instead of creating a disconnected duplicate - so the
      // same person can sign in with either method afterward.
      const hasRealEmail = typeof payload.email === "string";
      if (hasRealEmail) {
        const { data: existingByEmail, error: existingByEmailError } = await admin
          .from("seeker_profiles")
          .select("user_id")
          .eq("email", email)
          .maybeSingle();
        if (existingByEmailError) throw existingByEmailError;
        userId = existingByEmail?.user_id as string | undefined;
      }

      if (userId) {
        const { error: linkError } = await admin
          .from("seeker_profiles")
          .update({ line_user_id: lineUserId, name, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        if (linkError) throw linkError;
      } else {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { line_user_id: lineUserId, name, picture, provider: "line" },
        });
        if (createError) throw createError;
        userId = created.user.id;

        const { error: insertError } = await admin.from("seeker_profiles").insert({
          user_id: userId,
          line_user_id: lineUserId,
          name,
          email,
          source_path: "line-login",
        });
        if (insertError) throw insertError;
      }
    }

    // 4) Issue a magic-link token the client can redeem for a real
    // session via supabase.auth.verifyOtp() - this is what lets a
    // server-side Admin API user creation turn into a signed-in
    // browser session without ever handling a password.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw linkErr;

    // The client only calls verifyOtp with token_hash (passing email
    // alongside it broke verification in production), so email isn't
    // needed in the response.
    return new Response(
      JSON.stringify({ token_hash: link.properties.hashed_token }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
