// Vercel serverless function: sends a seeker welcome email via Resend.
// Called client-side right after a successful registration - never
// blocks the registration flow itself (the caller fires this without
// awaiting failure), so a Resend outage never prevents someone from
// signing up.
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
  const name = (body && body.name) || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "有効なメールアドレスが必要です。" });
    return;
  }

  const greetingName = name ? escapeHtml(name) + " 様" : "この度は";
  const bodyHtml =
    "<p>" + greetingName + "、Medical Spot Jobへのご登録が完了しました。</p>" +
    "<p>看護師・検査技師・リハビリ職など、医療資格を活かせるスポット求人・業務委託・非常勤の求人を多数掲載しています。ぜひあなたに合った求人を探してみてください。</p>";

  const result = await sendBrandedEmail({
    type: "seeker_welcome",
    to: email,
    subject: "求職者登録が完了しました｜Medical Spot Job",
    heading: "ご登録ありがとうございます",
    bodyHtml: bodyHtml,
    ctaText: "求人を探す",
    ctaUrl: "https://medispotjob.vercel.app/seeker-jobs.html"
  });

  res.status(result.ok ? 200 : 502).json({ success: result.ok });
};
