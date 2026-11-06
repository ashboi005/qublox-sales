import nodemailer from "nodemailer";
import { connect } from "node:tls";
import type { Mailbox } from "./mail-config";

export type EmailSnapshot = { id: string; toAddress: string; subject: string; body: string };
export type SendEmail = (
  mailbox: Mailbox,
  message: EmailSnapshot,
  deadlineAt: Date,
) => Promise<{ messageId: string }>;
type OwnedSocket = { destroy(error?: Error): unknown };
export async function withSmtpDeadline<T>(
  operation: (own: (socket: OwnedSocket) => void) => Promise<T>,
  timeoutMs = 45000,
): Promise<T> {
  if (timeoutMs <= 0)
    throw Object.assign(new Error("SMTP deadline expired before opening a connection."), {
      code: "EDEADLINE",
    });
  let socket: OwnedSocket | undefined,
    expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      socket?.destroy();
      reject(
        Object.assign(new Error("SMTP attempt deadline reached; acceptance is unknown."), {
          code: "ETIMEDOUT",
        }),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      operation((s) => {
        socket = s;
        if (expired) s.destroy();
      }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function gmailSender(name: string): SendEmail {
  return async (mailbox, message, deadlineAt) => {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      pool: false,
      auth: { user: mailbox.email, pass: mailbox.appPassword },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      disableFileAccess: true,
      disableUrlAccess: true,
      getSocket: (_options, callback) => {
        if (Date.now() >= deadlineAt.getTime()) {
          callback(
            Object.assign(new Error("SMTP deadline expired before opening a connection."), {
              code: "EDEADLINE",
            }),
          );
          return;
        }
        // Owning the TLS socket lets the absolute deadline actually terminate SMTP.
        const socket = connect({
          host: "smtp.gmail.com",
          port: 465,
          servername: "smtp.gmail.com",
          rejectUnauthorized: true,
        });
        ownSocket(socket);
        let returned = false;
        const connectionTimer = setTimeout(
          () =>
            socket.destroy(
              Object.assign(new Error("TLS connection timed out"), { code: "ETIMEDOUT" }),
            ),
          10000,
        );
        socket.once("error", (error) => {
          clearTimeout(connectionTimer);
          if (!returned) {
            returned = true;
            callback(error);
          }
        });
        socket.once("secureConnect", () => {
          clearTimeout(connectionTimer);
          if (!returned) {
            returned = true;
            callback(null, { connection: socket, secured: true });
          }
        });
      },
    });
    let ownSocket: (socket: OwnedSocket) => void = (socket) => socket.destroy();
    try {
      return await withSmtpDeadline(async (own) => {
        ownSocket = own;
        const info = await transport.sendMail({
          from: { name, address: mailbox.email },
          to: { address: message.toAddress, name: "" },
          subject: message.subject,
          text: message.body,
          messageId: `<${message.id}@${mailbox.email.split("@")[1]}>`,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        if (!info.accepted?.length) throw { code: "EENVELOPE" };
        return { messageId: info.messageId };
      }, deadlineAt.getTime() - Date.now());
    } finally {
      transport.close();
    }
  };
}
