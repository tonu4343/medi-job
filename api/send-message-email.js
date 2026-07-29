// Vercel serverless function: emails a seeker when an employer sends a
// new chat message. Called by a Supabase Database Webhook on INSERT
// of application_messages (configured in the Supabase dashboard, not
// in code) - never called directly by the browser, so there's no
// client-supplied identity to verify; the webhook payload's row data
// is trusted the same way the LINE push functions trust it.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { RESEND_API_KEY, RESEND_EMAIL_DOMAIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!RESEND_API_KEY || !RESEND_EMAIL_DOMAIN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("send-message-email: missing server config");
    res.status(200).json({ success: false, message: "サーバー設定が不足しています。" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }

  if (body.type !== "INSERT" || body.table !== "application_messages") {
    res.status(200).json({ success: false, message: "ignored" });
    return;
  }
  const record = body.record;
  if (!record) {
    res.status(200).json({ success: false, message: "no record" });
    return;
  }

  const serviceHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  };

  try {
    const applicationRes = await fetch(
      SUPABASE_URL + "/rest/v1/seeker_applications?id=eq." + encodeURIComponent(record.application_id) +
        "&select=user_id,job_title,facility_name",
      { headers: serviceHeaders }
    );
    if (!applicationRes.ok) throw new Error("failed to fetch application");
    const applications = await applicationRes.json();
    const application = applications && applications[0];
    if (!application) {
      res.status(200).json({ success: false, message: "application not found" });
      return;
    }

    // Only notify when the employer sent it - a seeker's own message
    // to their own application doesn't need an email back to themselves.
    if (record.sender_id === application.user_id) {
      res.status(200).json({ success: false, message: "sender is the seeker" });
      return;
    }

    const seekerRes = await fetch(
      SUPABASE_URL + "/rest/v1/seeker_profiles?user_id=eq." + encodeURIComponent(application.user_id) +
        "&select=email,notification_preferences",
      { headers: serviceHeaders }
    );
    if (!seekerRes.ok) throw new Error("failed to fetch seeker");
    const seekers = await seekerRes.json();
    const seeker = seekers && seekers[0];
    const notifyEnabled = !seeker?.notification_preferences || seeker.notification_preferences.email !== false;
    if (!seeker || !seeker.email || !notifyEnabled) {
      res.status(200).json({ success: false, message: "not eligible" });
      return;
    }

    const jobTitle = application.job_title || application.facility_name || "応募";
    const preview = String(record.body || "").slice(0, 200);
    const html =
      "<p>" + jobTitle + " の応募について、新しいメッセージが届いています。</p>" +
      "<blockquote>" + preview.replace(/</g, "&lt;") + "</blockquote>" +
      "<p><a href=\"https://medispotjob.vercel.app/application-chat.html?id=" + encodeURIComponent(record.application_id) + "\">アプリで確認する</a></p>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Medi Job <noreply@" + RESEND_EMAIL_DOMAIN + ">",
        to: [seeker.email],
        subject: "【Medi Job】新しいメッセージが届いています",
        html: html
      })
    });
    if (!resendRes.ok) {
      console.error("Resend message email failed", await resendRes.text());
    }
  } catch (error) {
    console.error("send-message-email error", error);
  }

  // Always 200 - this is a Database Webhook callback, not a client
  // request; a non-2xx here just triggers pointless Supabase retries.
  res.status(200).json({ success: true });
};
