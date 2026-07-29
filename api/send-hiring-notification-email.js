// Vercel serverless function: emails the seeker a congratulatory
// notice specifically when their application status becomes 'hired'.
// Called by a Supabase Database Webhook on UPDATE of
// seeker_applications (configured in the Supabase dashboard, not in
// code). Separate from the general application-status LINE push,
// which covers every status transition - this is only the hiring
// moment, matching the "Hiring notification" requirement.
const { logEmailDelivery } = require("./_lib/email-log");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { RESEND_API_KEY, RESEND_EMAIL_DOMAIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!RESEND_API_KEY || !RESEND_EMAIL_DOMAIN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("send-hiring-notification-email: missing server config");
    res.status(200).json({ success: false, message: "サーバー設定が不足しています。" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }

  if (body.type !== "UPDATE" || body.table !== "seeker_applications") {
    res.status(200).json({ success: false, message: "ignored" });
    return;
  }
  const record = body.record;
  const oldRecord = body.old_record;
  if (!record || !oldRecord) {
    res.status(200).json({ success: false, message: "no record" });
    return;
  }

  // Only the moment status first becomes 'hired' - not every update
  // to an already-hired application (e.g. later moving to 'working').
  if (record.status !== "hired" || oldRecord.status === "hired") {
    res.status(200).json({ success: false, message: "not a new hire" });
    return;
  }

  const serviceHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  };

  const subject = "【Medical Spot Job】採用が決定しました";
  const jobTitle = record.job_title || "求人";
  const facilityName = record.facility_name || "";

  try {
    const seekerRes = await fetch(
      SUPABASE_URL + "/rest/v1/seeker_profiles?user_id=eq." + encodeURIComponent(record.user_id) +
        "&select=email,notification_preferences",
      { headers: serviceHeaders }
    );
    if (!seekerRes.ok) throw new Error("failed to fetch seeker");
    const seekers = await seekerRes.json();
    const seeker = seekers && seekers[0];
    const notifyEnabled =
      !seeker?.notification_preferences ||
      (seeker.notification_preferences.application_status !== false &&
        seeker.notification_preferences.email !== false);

    if (!seeker || !seeker.email) {
      await logEmailDelivery({ type: "hiring_notification", recipient: "-", subject, status: "skipped", error: "seeker not found", relatedId: record.id });
      res.status(200).json({ success: false, message: "seeker not found" });
      return;
    }
    if (!notifyEnabled) {
      await logEmailDelivery({ type: "hiring_notification", recipient: seeker.email, subject, status: "skipped", error: "notifications disabled", relatedId: record.id });
      res.status(200).json({ success: false, message: "notifications disabled" });
      return;
    }

    const html =
      "<p>おめでとうございます。以下の求人への採用が決定しました。</p>" +
      "<p><strong>" + facilityName + "</strong><br>" + jobTitle + "</p>" +
      "<p><a href=\"https://medispotjob.vercel.app/application-chat.html?id=" + encodeURIComponent(record.id) + "\">詳細を確認する</a></p>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Medical Spot Job <noreply@" + RESEND_EMAIL_DOMAIN + ">",
        to: [seeker.email],
        subject: subject,
        html: html
      })
    });

    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      console.error("Resend hiring notification failed", errorText);
      await logEmailDelivery({ type: "hiring_notification", recipient: seeker.email, subject, status: "failed", error: errorText, relatedId: record.id });
    } else {
      await logEmailDelivery({ type: "hiring_notification", recipient: seeker.email, subject, status: "sent", relatedId: record.id });
    }
  } catch (error) {
    console.error("send-hiring-notification-email error", error);
    await logEmailDelivery({ type: "hiring_notification", recipient: "-", subject, status: "failed", error: String(error), relatedId: record.id });
  }

  res.status(200).json({ success: true });
};
