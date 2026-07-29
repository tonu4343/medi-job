// Vercel serverless function: emails whichever side (seeker or
// employer) did NOT send a new chat message. Called by a Supabase
// Database Webhook on INSERT of application_messages (configured in
// the Supabase dashboard, not in code) - never called directly by the
// browser, so there's no client-supplied identity to verify; the
// webhook payload's row data is trusted the same way the LINE push
// functions trust it.
const { sendBrandedEmail, logSkippedEmail } = require("./_lib/sendEmail");
const { escapeHtml } = require("./_lib/emailBrand");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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

  // Employer preferences now use one flag per category (new_message_email);
  // seeker preferences still use the older category+channel pair
  // (messages/email) - seeker_profiles wasn't part of this change.
  function employerNotifyEnabled(prefs) {
    return !prefs || prefs.new_message_email !== false;
  }
  function seekerNotifyEnabled(prefs) {
    return !prefs || (prefs.messages !== false && prefs.email !== false);
  }

  try {
    const applicationRes = await fetch(
      SUPABASE_URL + "/rest/v1/seeker_applications?id=eq." + encodeURIComponent(record.application_id) +
        "&select=user_id,employer_id,job_title,facility_name",
      { headers: serviceHeaders }
    );
    if (!applicationRes.ok) throw new Error("failed to fetch application: " + applicationRes.status + " " + (await applicationRes.text()));
    const applications = await applicationRes.json();
    const application = applications && applications[0];
    if (!application) {
      res.status(200).json({ success: false, message: "application not found" });
      return;
    }

    const senderIsSeeker = record.sender_id === application.user_id;
    const jobTitle = escapeHtml(application.job_title || application.facility_name || "応募");
    const facilityName = escapeHtml(application.facility_name || "医療機関");
    // A short, safe, escaped preview only - the full conversation stays
    // inside the app; this email exists purely to notify, not to relay
    // the message content itself.
    const preview = escapeHtml(String(record.body || "").slice(0, 100));
    const sentAt = escapeHtml(record.created_at ? new Date(record.created_at).toLocaleString("ja-JP") : "");

    if (senderIsSeeker) {
      // Notify the employer.
      const subject = "求職者から新しいメッセージが届きました";
      const employerRes = await fetch(
        SUPABASE_URL + "/rest/v1/employer_profiles?user_id=eq." + encodeURIComponent(application.employer_id) +
          "&select=email,notification_preferences",
        { headers: serviceHeaders }
      );
      if (!employerRes.ok) throw new Error("failed to fetch employer: " + employerRes.status + " " + (await employerRes.text()));
      const employers = await employerRes.json();
      const employer = employers && employers[0];
      if (employer && employer.email && employerNotifyEnabled(employer.notification_preferences)) {
        const html =
          "<p>" + jobTitle + " の応募について、求職者から新しいメッセージが届きました。</p>" +
          "<p>受信日時: " + sentAt + "</p>" +
          "<blockquote style=\"margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #005bac;color:#16212e;\">" + preview + "</blockquote>";
        await sendBrandedEmail({
          type: "message_notification_employer",
          relatedId: record.application_id,
          to: employer.email,
          subject: subject,
          heading: "新しいメッセージが届いています",
          bodyHtml: html,
          ctaText: "メッセージを確認する",
          ctaUrl: "https://medispotjob.vercel.app/employer-messages.html"
        });
      } else {
        await logSkippedEmail({
          type: "message_notification_employer",
          relatedId: record.application_id,
          recipient: employer?.email,
          subject: subject,
          reason: !employer?.email ? "employer not found" : "notifications disabled"
        });
      }
    } else {
      // Notify the seeker.
      const subject = "医療機関から新しいメッセージが届きました";
      const seekerRes = await fetch(
        SUPABASE_URL + "/rest/v1/seeker_profiles?user_id=eq." + encodeURIComponent(application.user_id) +
          "&select=email,notification_preferences",
        { headers: serviceHeaders }
      );
      if (!seekerRes.ok) throw new Error("failed to fetch seeker: " + seekerRes.status + " " + (await seekerRes.text()));
      const seekers = await seekerRes.json();
      const seeker = seekers && seekers[0];
      if (seeker && seeker.email && seekerNotifyEnabled(seeker.notification_preferences)) {
        const html =
          "<p>" + facilityName + "（" + jobTitle + "）から新しいメッセージが届きました。</p>" +
          "<p>受信日時: " + sentAt + "</p>" +
          "<blockquote style=\"margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #005bac;color:#16212e;\">" + preview + "</blockquote>";
        await sendBrandedEmail({
          type: "message_notification_seeker",
          relatedId: record.application_id,
          to: seeker.email,
          subject: subject,
          heading: "新しいメッセージが届いています",
          bodyHtml: html,
          ctaText: "メッセージを確認する",
          ctaUrl: "https://medispotjob.vercel.app/seeker-messages.html"
        });
      } else {
        await logSkippedEmail({
          type: "message_notification_seeker",
          relatedId: record.application_id,
          recipient: seeker?.email,
          subject: subject,
          reason: !seeker?.email ? "seeker not found" : "notifications disabled"
        });
      }
    }
  } catch (error) {
    console.error("send-message-email error", error);
  }

  // Always 200 - this is a Database Webhook callback, not a client
  // request; a non-2xx here just triggers pointless Supabase retries.
  res.status(200).json({ success: true });
};
