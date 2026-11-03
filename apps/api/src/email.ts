import { EmailClient } from "@azure/communication-email";

export async function sendEmail(msg: { to: string; subject: string; text: string }) {
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const sender = process.env.EMAIL_FROM;

  // Without Azure settings (local development, tests), print the email instead
  if (!connectionString || !sender) {
    console.log(`[email not configured]\nTo: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}`);
    return;
  }

  const client = new EmailClient(connectionString);
  const poller = await client.beginSend({
    senderAddress: sender,
    content: { subject: msg.subject, plainText: msg.text },
    recipients: { to: [{ address: msg.to }] },
  });

  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") {
    throw new Error(`Email send failed with status: ${result.status}`);
  }
}