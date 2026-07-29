// Vercel serverless function: sends an employer welcome email via
// Resend. Called client-side right after a successful registration
// AND employer_profiles save - never blocks the registration flow
// itself (the caller fires this without awaiting failure), so a
// Resend outage never prevents someone from signing up. Separate from
// Supabase's own auth confirmation email.
const { sendBrandedEmail } = require("./_lib/sendEmail");
const { escapeHtml } = require("./_lib/emailBrand");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }
  const email = body && body.email;
  const contactName = (body && body.contactName) || "";
  const facilityName = (body && body.facilityName) || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "有効なメールアドレスが必要です。" });
    return;
  }

  const greetingName = contactName ? escapeHtml(contactName) + " 様" : "この度は";
  const facilityLine = facilityName ? "<p>" + escapeHtml(facilityName) + " 様のご登録を確認いたしました。</p>" : "";
  const bodyHtml =
    "<p>" + greetingName + "、Medical Spot Jobへの求人者登録が完了しました。</p>" +
    facilityLine +
    "<p>求人を掲載して、必要な人材の募集を始めましょう。</p>";

  const result = await sendBrandedEmail({
    type: "employer_welcome",
    to: email,
    subject: "求人者登録が完了しました｜Medical Spot Job",
    heading: "ご登録ありがとうございます",
    bodyHtml: bodyHtml,
    ctaText: "ログインする",
    ctaUrl: "https://medispotjob.vercel.app/login.html?role=employer"
  });

  res.status(result.ok ? 200 : 502).json({ success: result.ok });
};
