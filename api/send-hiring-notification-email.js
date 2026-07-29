// Vercel serverless function: emails the seeker a congratulatory
// notice and the employer a hiring-procedure-complete notice,
// specifically when an application's status becomes 'hired'. Called
// by a Supabase Database Webhook on UPDATE of seeker_applications
// (configured in the Supabase dashboard, not in code). Separate from
// the general application-status LINE push, which covers every
// status transition - this is only the hiring moment.
const { sendBrandedEmail, logSkippedEmail } = require("./_lib/sendEmail");
const { escapeHtml } = require("./_lib/emailBrand");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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

  const jobTitle = escapeHtml(record.job_title || "求人");
  const facilityName = escapeHtml(record.facility_name || "");
  const hiredAt = escapeHtml(new Date().toLocaleString("ja-JP"));

  // 1) Seeker congratulations - links to Application Detail, not chat.
  const seekerSubject = "採用決定のお知らせ｜Medical Spot Job";
  try {
    const seekerRes = await fetch(
      SUPABASE_URL + "/rest/v1/seeker_profiles?user_id=eq." + encodeURIComponent(record.user_id) +
        "&select=email,notification_preferences",
      { headers: serviceHeaders }
    );
    if (!seekerRes.ok) throw new Error("failed to fetch seeker: " + seekerRes.status + " " + (await seekerRes.text()));
    const seekers = await seekerRes.json();
    const seeker = seekers && seekers[0];
    const notifyEnabled =
      !seeker?.notification_preferences ||
      (seeker.notification_preferences.application_status !== false &&
        seeker.notification_preferences.email !== false);

    if (seeker && seeker.email && notifyEnabled) {
      const seekerHtml =
        "<p>おめでとうございます。以下の求人への採用が決定しました。</p>" +
        "<p><strong>" + facilityName + "</strong><br>" + jobTitle + "</p>" +
        "<p>採用決定日: " + hiredAt + "</p>" +
        "<p>今後の流れについては、応募詳細ページよりご確認いただけます。ご不明な点があれば、施設担当者へメッセージでお問い合わせください。</p>";
      await sendBrandedEmail({
        type: "hiring_notification_seeker",
        relatedId: record.id,
        to: seeker.email,
        subject: seekerSubject,
        heading: "採用が決定しました",
        bodyHtml: seekerHtml,
        ctaText: "採用内容を確認する",
        ctaUrl: "https://medispotjob.vercel.app/application-detail.html?id=" + encodeURIComponent(record.id)
      });
    } else {
      await logSkippedEmail({
        type: "hiring_notification_seeker",
        relatedId: record.id,
        recipient: seeker?.email,
        subject: seekerSubject,
        reason: !seeker?.email ? "seeker not found" : "notifications disabled"
      });
    }
  } catch (error) {
    console.error("send-hiring-notification-email (seeker) error", error);
  }

  // 2) Employer hiring-procedure-complete confirmation.
  const employerSubject = "採用手続きが完了しました";
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
      const notifyEnabled = !employer?.notification_preferences || employer.notification_preferences.hiring_status_email !== false;

      if (employer && employer.email && notifyEnabled) {
        const employerHtml =
          "<p>以下の応募について、採用手続きが完了しました。</p>" +
          "<p><strong>" + jobTitle + "</strong></p>" +
          "<p>採用者: " + escapeHtml(record.seeker_name || "求職者") + "<br>採用決定日: " + hiredAt + "</p>";
        await sendBrandedEmail({
          type: "hiring_notification_employer",
          relatedId: record.id,
          to: employer.email,
          subject: employerSubject,
          heading: "採用手続きが完了しました",
          bodyHtml: employerHtml,
          ctaText: "応募者を確認する",
          ctaUrl: "https://medispotjob.vercel.app/employer-applicant.html?id=" + encodeURIComponent(record.id)
        });
      } else {
        await logSkippedEmail({
          type: "hiring_notification_employer",
          relatedId: record.id,
          recipient: employer?.email,
          subject: employerSubject,
          reason: !employer?.email ? "employer not found" : "notifications disabled"
        });
      }
    } catch (error) {
      console.error("send-hiring-notification-email (employer) error", error);
    }
  }

  res.status(200).json({ success: true });
};
