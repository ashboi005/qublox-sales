export function allowedEmails(value: string): ReadonlySet<string> {
  return new Set(value.split(",").map(email => email.trim().toLowerCase()).filter(Boolean));
}

export function isTeamMember(email: string, allowed: ReadonlySet<string>) {
  return allowed.has(email.trim().toLowerCase());
}
