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
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { RESEND_API_KEY, RESEND_EMAIL_DOMAIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!RESEND_API_KEY || !RESEND_EMAIL_DOMAIN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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

  const jobTitle = record.job_title || "求人";
  const facilityName = record.facility_name || "";
  const appliedAt = record.created_at ? new Date(record.created_at).toLocaleString("ja-JP") : "";

  async function sendEmail(to, subject, html) {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Medical Spot Job <noreply@" + RESEND_EMAIL_DOMAIN + ">",
        to: [to],
        subject: subject,
        html: html
      })
    });
    if (!resendRes.ok) {
      console.error("Resend application email failed", await resendRes.text());
    }
  }

  try {
    // 1) Seeker confirmation - always sent, this is a direct
    // confirmation of the seeker's own action, not a preference-gated
    // notification about someone else's activity.
    if (record.seeker_email) {
      const seekerHtml =
        "<p>以下の求人への応募を受け付けました。</p>" +
        "<p><strong>" + facilityName + "</strong><br>" + jobTitle + "</p>" +
        "<p>応募日時: " + appliedAt + "</p>" +
        "<p><a href=\"https://medispotjob.vercel.app/application-chat.html?id=" + encodeURIComponent(record.id) + "\">応募状況を確認する</a></p>";
      await sendEmail(record.seeker_email, "【Medical Spot Job】応募を受け付けました", seekerHtml);
    }

    // 2) Employer alert - gated by their existing new_applications toggle.
    if (record.employer_id) {
      const employerRes = await fetch(
        SUPABASE_URL + "/rest/v1/employer_profiles?user_id=eq." + encodeURIComponent(record.employer_id) +
          "&select=email,notification_preferences",
        { headers: serviceHeaders }
      );
      if (!employerRes.ok) throw new Error("failed to fetch employer");
      const employers = await employerRes.json();
      const employer = employers && employers[0];
      const notifyEnabled =
        !employer?.notification_preferences ||
        (employer.notification_preferences.new_applications !== false &&
          employer.notification_preferences.email !== false);

      if (employer && employer.email && notifyEnabled) {
        const employerHtml =
          "<p>新しい応募がありました。</p>" +
          "<p><strong>" + jobTitle + "</strong></p>" +
          "<p>応募者: " + (record.seeker_name || "求職者") + "</p>" +
          "<p>応募日時: " + appliedAt + "</p>" +
          "<p><a href=\"https://medispotjob.vercel.app/employer-applicant.html?id=" + encodeURIComponent(record.id) + "\">応募者を確認する</a></p>";
        await sendEmail(employer.email, "【Medical Spot Job】新しい応募がありました", employerHtml);
      }
    }
  } catch (error) {
    console.error("send-application-emails error", error);
  }

  // Always 200 - this is a Database Webhook callback, not a client
  // request; a non-2xx here just triggers pointless Supabase retries.
  res.status(200).json({ success: true });
};
