import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { escapeHtml, sendEmail } from "./email";
import { prisma } from "./prisma";

function getBaseUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3100").replace(/\/+$/, "");
}

export const auth = betterAuth({
  appName: "Food",
  baseURL: getBaseUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Reset your Food password",
        text: `Reset your Food password: ${url}`,
        html: `<p>Reset your Food password using the secure link below.</p><p><a href="${escapeHtml(url)}">Reset password</a></p>`,
      }).catch((error) => console.error("Unable to send password reset email", error));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Verify your Food account",
        text: `Verify your Food account: ${url}`,
        html: `<p>Welcome to Food. Verify your email address using the secure link below.</p><p><a href="${escapeHtml(url)}">Verify email</a></p>`,
      }).catch((error) => console.error("Unable to send verification email", error));
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      async sendInvitationEmail(data) {
        const invitationUrl = `${getBaseUrl()}/households/invitations/${encodeURIComponent(data.id)}`;

        void sendEmail({
          to: data.email,
          subject: `Join ${data.organization.name} on Food`,
          text: `${data.inviter.user.name} invited you to join ${data.organization.name} on Food: ${invitationUrl}`,
          html: `<p>${escapeHtml(data.inviter.user.name)} invited you to join <strong>${escapeHtml(data.organization.name)}</strong> on Food.</p><p><a href="${escapeHtml(invitationUrl)}">View household invitation</a></p>`,
        }).catch((error) => console.error("Unable to send household invitation", error));
      },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
