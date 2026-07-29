// Vercel serverless function: notifies the seeker when their
// application status becomes 'rejected'. Called by a Supabase
// Database Webhook on UPDATE of seeker_applications (configured in
// the Supabase dashboard, not in code). Uses standard polite Japanese
// rejection wording appropriate for medical professionals - never
// harsh or blunt.
const { sendBrandedEmail, logSkippedEmail } = require("./_lib/sendEmail");
const { escapeHtml } = require("./_lib/emailBrand");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("send-rejection-email: missing server config");
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
  if (record.status !== "rejected" || oldRecord.status === "rejected") {
    res.status(200).json({ success: false, message: "not a new rejection" });
    return;
  }

  const subject = "選考結果のお知らせ";
  const jobTitle = escapeHtml(record.job_title || "求人");
  const facilityName = escapeHtml(record.facility_name || "");

  try {
    const seekerRes = await fetch(
      SUPABASE_URL + "/rest/v1/seeker_profiles?user_id=eq." + encodeURIComponent(record.user_id) +
        "&select=email,notification_preferences",
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY } }
    );
    if (!seekerRes.ok) throw new Error("failed to fetch seeker: " + seekerRes.status + " " + (await seekerRes.text()));
    const seekers = await seekerRes.json();
    const seeker = seekers && seekers[0];
    const notifyEnabled =
      !seeker?.notification_preferences ||
      (seeker.notification_preferences.application_status !== false &&
        seeker.notification_preferences.email !== false);

    if (seeker && seeker.email && notifyEnabled) {
      const html =
        "<p>この度は、下記求人にご応募いただき誠にありがとうございました。</p>" +
        "<p><strong>" + facilityName + "</strong><br>" + jobTitle + "</p>" +
        "<p>慎重に検討させていただきました結果、誠に残念ながら今回はご期待に沿うことができない結果となりました。</p>" +
        "<p>せっかくご応募いただいたにもかかわらず、このようなお知らせとなりましたことを心よりお詫び申し上げます。今後とも他の求人にてご縁がございましたら幸いです。</p>";
      await sendBrandedEmail({
        type: "rejection_notification",
        relatedId: record.id,
        to: seeker.email,
        subject: subject,
        heading: "選考結果のお知らせ",
        bodyHtml: html,
        ctaText: "応募状況を確認する",
        ctaUrl: "https://medispotjob.vercel.app/application-detail.html?id=" + encodeURIComponent(record.id)
      });
    } else {
      await logSkippedEmail({
        type: "rejection_notification",
        relatedId: record.id,
        recipient: seeker?.email,
        subject: subject,
        reason: !seeker?.email ? "seeker not found" : "notifications disabled"
      });
    }
  } catch (error) {
    console.error("send-rejection-email error", error);
  }

  res.status(200).json({ success: true });
};
