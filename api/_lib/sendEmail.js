// Centralized Resend sender used by every api/send-*.js function.
// Wraps template rendering + the actual Resend call + delivery
// logging in one place, so individual trigger functions only need to
// supply their own subject/heading/body/CTA and never touch Resend's
// API or the logging call directly.
const { renderEmail } = require("./emailBrand");
const { logEmailDelivery } = require("./email-log");

// type/relatedId are for email_delivery_logs only, not sent to Resend.
async function sendBrandedEmail({ type, relatedId, to, subject, heading, bodyHtml, ctaText, ctaUrl }) {
  const { RESEND_API_KEY, RESEND_EMAIL_DOMAIN } = process.env;
  if (!RESEND_API_KEY || !RESEND_EMAIL_DOMAIN) {
    console.error(type + ": missing RESEND_API_KEY/RESEND_EMAIL_DOMAIN");
    await logEmailDelivery({ type, recipient: to, subject, status: "failed", error: "missing server config", relatedId });
    return { ok: false };
  }

  const html = renderEmail({ heading: heading || subject, bodyHtml, ctaText, ctaUrl });

  try {
    const res = await fetch("https://api.resend.com/emails", {
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

    const resultText = await res.text();
    let result = null;
    try { result = JSON.parse(resultText); } catch (e) { /* non-JSON response */ }

    if (!res.ok) {
      console.error(type + ": Resend send failed", resultText);
      await logEmailDelivery({ type, recipient: to, subject, status: "failed", error: resultText, relatedId });
      return { ok: false };
    }

    await logEmailDelivery({ type, recipient: to, subject, status: "sent", relatedId, resendMessageId: result && result.id });
    return { ok: true, id: result && result.id };
  } catch (error) {
    console.error(type + ": Resend send threw", error);
    await logEmailDelivery({ type, recipient: to, subject, status: "failed", error: String(error), relatedId });
    return { ok: false };
  }
}

// For the "skipped" case (recipient not found / notifications off) -
// keeps every function logging skips the same way without duplicating
// the logEmailDelivery call shape everywhere.
async function logSkippedEmail({ type, relatedId, recipient, subject, reason }) {
  await logEmailDelivery({ type, recipient: recipient || "-", subject, status: "skipped", error: reason, relatedId });
}

module.exports = { sendBrandedEmail, logSkippedEmail };
