// Vercel serverless function: emails the seeker when an employer
// sends a new chat message. Called by a Supabase Database Webhook on
// INSERT of application_messages (configured in the Supabase
// dashboard, not in code) - never called directly by the browser, so
// there's no client-supplied identity to verify; the webhook
// payload's row data is trusted the same way the LINE push functions
// trust it. Intentionally one-directional: the employer is never
// emailed about the seeker's own messages.
//
// Duplicate-send protection: each chat "send" click creates exactly
// one application_messages row, and this function only runs once per
// row via the Database Webhook - there's no retry/resend path here.
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

    // Only notify when the employer sent it - never email the employer
    // about their own message, and never email the seeker about their
    // own message either.
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

    const facilityName = application.facility_name || "医療機関";
    const jobTitle = application.job_title || "求人";
    // A short, safe, escaped preview only - the full conversation stays
    // inside the app; this email exists purely to notify, not to relay
    // the message content itself.
    const preview = String(record.body || "")
      .slice(0, 80)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const messagesUrl = "https://medispotjob.vercel.app/seeker-messages.html";
    const html =
      "<p>" + facilityName + "（" + jobTitle + "）から新しいメッセージが届きました。</p>" +
      "<blockquote>" + preview + "</blockquote>" +
      "<p><a href=\"" + messagesUrl + "\" style=\"display:inline-block;padding:10px 20px;color:#fff;background:#005bac;border-radius:6px;text-decoration:none;\">メッセージを確認する</a></p>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Medical Spot Job <noreply@" + RESEND_EMAIL_DOMAIN + ">",
        to: [seeker.email],
        subject: "医療機関から新しいメッセージが届きました",
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
