export async function sendEmail(msg: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.log(`[email not configured]\nTo: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Email provider error: ${res.status}`);
  }
}