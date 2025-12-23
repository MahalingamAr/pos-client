// client/src/lib/gmailShare.js
export function openGmailCompose({ to, subject, body, cc, bcc }) {
  const params = new URLSearchParams();
  if (to) params.set("to", to);
  if (cc) params.set("cc", cc);
  if (bcc) params.set("bcc", bcc);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);

  const url = `https://mail.google.com/mail/?view=cm&fs=1&${params.toString()}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

