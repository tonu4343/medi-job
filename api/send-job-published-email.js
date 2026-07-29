// Vercel serverless function: confirms to the employer that their job
// posting was published. Called by a Supabase Database Webhook on
// INSERT of jobs (configured in the Supabase dashboard, not in code).
// Separate from the seeker-facing LINE broadcast on the same table/
// event (line-push-new-job) - this one is a direct confirmation of the
// employer's own action, so it's sent unconditionally, not gated by
// any notification toggle.
const { sendBrandedEmail, logSkippedEmail } = require("./_lib/sendEmail");
const { escapeHtml } = require("./_lib/emailBrand");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("send-job-published-email: missing server config");
    res.status(200).json({ success: false, message: "サーバー設定が不足しています。" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }
  if (body.type !== "INSERT" || body.table !== "jobs") {
    res.status(200).json({ success: false, message: "ignored" });
    return;
  }
  const job = body.record;
  const subject = "求人掲載が完了しました｜Medical Spot Job";
  if (!job || !job.employer_id) {
    res.status(200).json({ success: false, message: "no record" });
    return;
  }

  try {
    const employerRes = await fetch(
      SUPABASE_URL + "/rest/v1/employer_profiles?user_id=eq." + encodeURIComponent(job.employer_id) + "&select=email",
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY } }
    );
    if (!employerRes.ok) throw new Error("failed to fetch employer: " + employerRes.status + " " + (await employerRes.text()));
    const employers = await employerRes.json();
    const employer = employers && employers[0];
    if (!employer || !employer.email) {
      await logSkippedEmail({ type: "job_published", relatedId: job.id, subject, reason: "employer not found" });
      res.status(200).json({ success: false, message: "employer not found" });
      return;
    }

    const postedAt = job.created_at ? new Date(job.created_at).toLocaleString("ja-JP") : "";
    const bodyHtml =
      "<p>以下の求人の掲載が完了しました。</p>" +
      "<p><strong>" + escapeHtml(job.title || "求人") + "</strong><br>" + escapeHtml(job.facility_name || "") + "</p>" +
      "<p>掲載日時: " + escapeHtml(postedAt) + "<br>掲載ステータス: " + (job.status === "open" ? "公開中" : escapeHtml(job.status || "-")) + "</p>";

    const result = await sendBrandedEmail({
      type: "job_published",
      relatedId: job.id,
      to: employer.email,
      subject: subject,
      heading: "求人掲載が完了しました",
      bodyHtml: bodyHtml,
      ctaText: "求人を確認する",
      ctaUrl: "https://medispotjob.vercel.app/employer-jobs.html"
    });
    res.status(200).json({ success: result.ok });
  } catch (error) {
    console.error("send-job-published-email error", error);
    res.status(200).json({ success: false });
  }
};
