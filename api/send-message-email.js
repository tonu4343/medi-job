// Vercel serverless function: emails whichever side (seeker or
// employer) did NOT send a new chat message. Called by a Supabase
// Database Webhook on INSERT of application_messages (configured in
// the Supabase dashboard, not in code) - never called directly by the
// browser, so there's no client-supplied identity to verify; the
// webhook payload's row data is trusted the same way the LINE push
// functions trust it.
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

  function notifyEnabled(prefs) {
    return !prefs || (prefs.messages !== false && prefs.email !== false);
  }

  try {
    const applicationRes = await fetch(
      SUPABASE_URL + "/rest/v1/seeker_applications?id=eq." + encodeURIComponent(record.application_id) +
        "&select=user_id,employer_id,job_title,facility_name",
      { headers: serviceHeaders }
    );
    if (!applicationRes.ok) throw new Error("failed to fetch application");
    const applications = await applicationRes.json();
    const application = applications && applications[0];
    if (!application) {
      res.status(200).json({ success: false, message: "application not found" });
      return;
    }

    const senderIsSeeker = record.sender_id === application.user_id;
    const jobTitle = application.job_title || application.facility_name || "応募";
    // A short, safe preview only - never the full message, and never
    // any other personal detail beyond what's already in the message
    // text itself (which the sender chose to write here).
    const preview = String(record.body || "").slice(0, 80).replace(/</g, "&lt;");
    const chatUrl = "https://medispotjob.vercel.app/application-chat.html?id=" + encodeURIComponent(record.application_id);

    let recipientEmail = null;
    let subject = null;
    let html = null;

    if (senderIsSeeker) {
      // Notify the employer.
      const employerRes = await fetch(
        SUPABASE_URL + "/rest/v1/employer_profiles?user_id=eq." + encodeURIComponent(application.employer_id) +
          "&select=email,notification_preferences",
        { headers: serviceHeaders }
      );
      if (!employerRes.ok) throw new Error("failed to fetch employer");
      const employers = await employerRes.json();
      const employer = employers && employers[0];
      if (employer && employer.email && notifyEnabled(employer.notification_preferences)) {
        recipientEmail = employer.email;
        subject = "【Medical Spot Job】求職者から新しいメッセージが届いています";
        html =
          "<p>" + jobTitle + " の応募について、求職者から新しいメッセージが届いています。</p>" +
          "<blockquote>" + preview + "</blockquote>" +
          "<p><a href=\"" + chatUrl + "\">アプリで確認する</a></p>";
      }
    } else {
      // Notify the seeker.
      const seekerRes = await fetch(
        SUPABASE_URL + "/rest/v1/seeker_profiles?user_id=eq." + encodeURIComponent(application.user_id) +
          "&select=email,notification_preferences",
        { headers: serviceHeaders }
      );
      if (!seekerRes.ok) throw new Error("failed to fetch seeker");
      const seekers = await seekerRes.json();
      const seeker = seekers && seekers[0];
      if (seeker && seeker.email && notifyEnabled(seeker.notification_preferences)) {
        recipientEmail = seeker.email;
        subject = "【Medical Spot Job】求人者から新しいメッセージが届いています";
        html =
          "<p>" + jobTitle + " の応募について、求人者から新しいメッセージが届いています。</p>" +
          "<blockquote>" + preview + "</blockquote>" +
          "<p><a href=\"" + chatUrl + "\">アプリで確認する</a></p>";
      }
    }

    if (recipientEmail) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Medical Spot Job <noreply@" + RESEND_EMAIL_DOMAIN + ">",
          to: [recipientEmail],
          subject: subject,
          html: html
        })
      });
      if (!resendRes.ok) {
        console.error("Resend message email failed", await resendRes.text());
      }
    }
  } catch (error) {
    console.error("send-message-email error", error);
  }

  // Always 200 - this is a Database Webhook callback, not a client
  // request; a non-2xx here just triggers pointless Supabase retries.
  res.status(200).json({ success: true });
};
