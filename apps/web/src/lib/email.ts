import nodemailer from "nodemailer";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim();

  if (!host || !Number.isInteger(port) || port <= 0 || !user || !password || !from) {
    throw new Error(
      "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM must be configured.",
    );
  }

  return { host, port, user, password, from };
}

export async function sendEmail(message: EmailMessage) {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
