// Vercel serverless function: sends a seeker welcome email via Resend.
// Called client-side right after a successful registration - never
// blocks the registration flow itself (the caller fires this without
// awaiting failure), so a Resend outage never prevents someone from
// signing up.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  const { RESEND_API_KEY, RESEND_EMAIL_DOMAIN } = process.env;
  if (!RESEND_API_KEY || !RESEND_EMAIL_DOMAIN) {
    res.status(500).json({ success: false, message: "サーバー設定が不足しています。" });
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

  const greetingName = name ? name + " 様" : "この度は";
  const html =
    "<p>" + greetingName + "、Medical Spot Jobにご登録いただきありがとうございます。</p>" +
    "<p>プロフィールを充実させて、あなたに合った求人を見つけましょう。</p>" +
    "<p><a href=\"https://medispotjob.vercel.app/seeker-dashboard.html\">マイページへ移動する</a></p>" +
    "<p>Medical Spot Job 運営事務局</p>";

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Medical Spot Job <noreply@" + RESEND_EMAIL_DOMAIN + ">",
        to: [email],
        subject: "ご登録ありがとうございます｜Medical Spot Job",
        html: html
      })
    });
    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      console.error("Resend welcome email failed", errorText);
      res.status(502).json({ success: false, message: "メール送信に失敗しました。" });
      return;
    }
  } catch (error) {
    console.error("Resend welcome email threw", error);
    res.status(502).json({ success: false, message: "メール送信に失敗しました。" });
    return;
  }

  res.status(200).json({ success: true });
};
