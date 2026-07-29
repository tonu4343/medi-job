// Vercel serverless function: emails the seeker a confirmation and the
// employer a new-application alert. Called by a Supabase Database
// Webhook on INSERT of seeker_applications (configured in the
// Supabase dashboard, not in code) - never called by the browser.
//
// Duplicate-submit protection isn't handled here: it comes for free
// from seeker_applications_user_job_unique (a real unique index on
// user_id+job_id), so a double-click that races two inserts has its
// second one rejected by Postgres before this webhook ever fires
// twice for the same application.
const { sendBrandedEmail, logSkippedEmail } = require("./_lib/sendEmail");
const { escapeHtml } = require("./_lib/emailBrand");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("send-application-emails: missing server config");
    res.status(200).json({ success: false, message: "サーバー設定が不足しています。" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }

  if (body.type !== "INSERT" || body.table !== "seeker_applications") {
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

  const jobTitle = escapeHtml(record.job_title || "求人");
  const facilityName = escapeHtml(record.facility_name || "");
  const appliedAt = escapeHtml(record.created_at ? new Date(record.created_at).toLocaleString("ja-JP") : "");

  // 1) Seeker confirmation - always sent, this is a direct
  // confirmation of the seeker's own action, not a preference-gated
  // notification about someone else's activity.
  const seekerSubject = "応募を受け付けました｜Medical Spot Job";
  if (record.seeker_email) {
    const seekerHtml =
      "<p>以下の求人への応募を受け付けました。</p>" +
      "<p><strong>" + facilityName + "</strong><br>" + jobTitle + "</p>" +
      "<p>応募日時: " + appliedAt + "<br>現在の状況: 応募済み</p>";
    await sendBrandedEmail({
      type: "application_confirmation",
      relatedId: record.id,
      to: record.seeker_email,
      subject: seekerSubject,
      heading: "応募を受け付けました",
      bodyHtml: seekerHtml,
      ctaText: "応募状況を確認する",
      ctaUrl: "https://medispotjob.vercel.app/application-detail.html?id=" + encodeURIComponent(record.id)
    });
  } else {
    await logSkippedEmail({ type: "application_confirmation", relatedId: record.id, subject: seekerSubject, reason: "no seeker_email on record" });
  }

  // 2) Employer alert - gated by their existing new_applications toggle.
  const employerSubject = "新しい応募がありました｜Medical Spot Job";
  if (record.employer_id) {
    try {
      const employerRes = await fetch(
        SUPABASE_URL + "/rest/v1/employer_profiles?user_id=eq." + encodeURIComponent(record.employer_id) +
          "&select=email,notification_preferences",
        { headers: serviceHeaders }
      );
      if (!employerRes.ok) throw new Error("failed to fetch employer: " + employerRes.status + " " + (await employerRes.text()));
      const employers = await employerRes.json();
      const employer = employers && employers[0];
      const notifyEnabled = !employer?.notification_preferences || employer.notification_preferences.new_application_email !== false;

      if (employer && employer.email && notifyEnabled) {
        const employerHtml =
          "<p>新しい応募がありました。</p>" +
          "<p><strong>" + jobTitle + "</strong></p>" +
          "<p>応募者: " + escapeHtml(record.seeker_name || "求職者") + "<br>応募日時: " + appliedAt + "</p>";
        await sendBrandedEmail({
          type: "application_alert",
          relatedId: record.id,
          to: employer.email,
          subject: employerSubject,
          heading: "新しい応募がありました",
          bodyHtml: employerHtml,
          ctaText: "応募者を確認する",
          ctaUrl: "https://medispotjob.vercel.app/employer-applicant.html?id=" + encodeURIComponent(record.id)
        });
      } else {
        await logSkippedEmail({
          type: "application_alert",
          relatedId: record.id,
          recipient: employer?.email,
          subject: employerSubject,
          reason: !employer?.email ? "employer not found" : "notifications disabled"
        });
      }
    } catch (error) {
      console.error("send-application-emails (employer alert) error", error);
    }
  }

  // Always 200 - this is a Database Webhook callback, not a client
  // request; a non-2xx here just triggers pointless Supabase retries.
  res.status(200).json({ success: true });
};
