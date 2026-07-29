// Shared branded HTML shell for every outgoing email - logo, heading,
// greeting/body card, one primary CTA button, and the standard
// automated-email footer. Centralized here so every template (welcome,
// application, message, hiring, rejection, ...) looks consistent
// without each function re-implementing the same markup.
//
// Callers must escape any user-generated text themselves before
// passing it in - this module only assembles layout, it doesn't know
// which fields are user-authored vs system-generated.
const BRAND = {
  name: "Medical Spot Job",
  logoUrl: "https://medispotjob.vercel.app/assets/icon-192.png",
  siteUrl: "https://medispotjob.vercel.app",
  publicSiteUrl: "https://medical-branch.jp",
  supportEmail: "support@medical-branch.jp",
  blue: "#005bac",
  blueDark: "#00427e",
  green: "#1a8754",
  ink: "#16212e",
  muted: "#5b6b7d",
  border: "#dde3ea",
  bg: "#f4f6f9"
};

function renderEmail({ heading, bodyHtml, ctaText, ctaUrl }) {
  const ctaBlock = ctaText && ctaUrl
    ? '<tr><td style="padding:8px 0 4px;">' +
        '<a href="' + ctaUrl + '" target="_blank" rel="noopener" ' +
        'style="display:inline-block;padding:14px 32px;color:#ffffff;background:' + BRAND.blue + ';' +
        'border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">' + ctaText + '</a>' +
      '</td></tr>'
    : "";

  return (
    '<!doctype html>' +
    '<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<title>' + heading + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + BRAND.bg + ';font-family:-apple-system,BlinkMacSystemFont,\'Hiragino Sans\',\'Yu Gothic\',sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + BRAND.bg + ';padding:32px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ' + BRAND.border + ';">' +

    // Header / logo bar
    '<tr><td style="padding:28px 32px 20px;text-align:center;background:linear-gradient(105deg,#f2f9ff,#effff6);border-bottom:1px solid ' + BRAND.border + ';">' +
    '<img src="' + BRAND.logoUrl + '" width="48" height="48" alt="' + BRAND.name + '" style="display:inline-block;border-radius:10px;">' +
    '<div style="margin-top:10px;color:' + BRAND.blueDark + ';font-size:15px;font-weight:800;">' + BRAND.name + '</div>' +
    '</td></tr>' +

    // Heading + body card
    '<tr><td style="padding:32px;">' +
    '<h1 style="margin:0 0 18px;color:' + BRAND.blueDark + ';font-size:20px;font-weight:800;line-height:1.4;">' + heading + '</h1>' +
    '<div style="color:' + BRAND.ink + ';font-size:14.5px;line-height:1.9;font-weight:500;">' + bodyHtml + '</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">' + ctaBlock + '</table>' +
    '</td></tr>' +

    // Support line
    '<tr><td style="padding:0 32px 28px;">' +
    '<p style="margin:0;color:' + BRAND.muted + ';font-size:12.5px;line-height:1.8;">' +
    'ご不明な点がございましたら、サポート窓口（' + BRAND.supportEmail + '）までお気軽にお問い合わせください。' +
    '</p></td></tr>' +

    // Footer
    '<tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid ' + BRAND.border + ';text-align:center;">' +
    '<p style="margin:0 0 4px;color:' + BRAND.blueDark + ';font-size:12.5px;font-weight:800;">' + BRAND.name + '</p>' +
    '<p style="margin:0 0 2px;color:' + BRAND.muted + ';font-size:11px;">このメールは自動送信されています。返信はできません。</p>' +
    '<p style="margin:0;color:' + BRAND.muted + ';font-size:11px;">' +
    '<a href="' + BRAND.publicSiteUrl + '" style="color:' + BRAND.muted + ';">' + BRAND.publicSiteUrl + '</a>' +
    ' ／ サポート: ' + BRAND.supportEmail +
    '</p></td></tr>' +

    '</table>' +
    '</td></tr>' +
    '</table>' +
    '</body></html>'
  );
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

module.exports = { BRAND, renderEmail, escapeHtml };
