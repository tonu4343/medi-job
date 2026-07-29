// Shared by every api/send-*.js function. Files under api/_lib are not
// turned into routes by Vercel (leading underscore), so this is safe
// to import without becoming its own endpoint.
//
// Never throws - a logging failure must not affect whether the actual
// email send is reported as successful to the caller.
async function logEmailDelivery({ type, recipient, subject, status, error, relatedId, resendMessageId }) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(SUPABASE_URL + "/rest/v1/email_delivery_logs", {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        email_type: type,
        recipient_email: recipient,
        subject: subject,
        status: status,
        error_message: error || null,
        related_id: relatedId || null,
        resend_message_id: resendMessageId || null
      })
    });
  } catch (e) {
    console.error("logEmailDelivery failed", e);
  }
}

module.exports = { logEmailDelivery };
