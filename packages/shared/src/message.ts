// Message helpers shared by drafting, review and dispatch.
// Drafts store `{{sender}}`; it renders as the sending teammate's first name.
export const SENDER_TOKEN = "{{sender}}";
const senderPattern = /\{\{\s*sender\s*\}\}/gi;

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

export function renderMessage(text: string, senderName: string) {
  return text.replace(senderPattern, firstName(senderName) || "The Qublox team");
}

// Placeholders that would reach a prospect literally, such as {{first_name}} or [Your Name].
export function unsupportedPlaceholders(text: string) {
  const found = [
    ...(text.match(/\{\{[^}]*\}\}/g) || []).filter((t) => !/^\{\{\s*sender\s*\}\}$/i.test(t)),
    ...(text.match(/\[[A-Z][A-Za-z ]{1,30}\]/g) || []),
  ];
  return [...new Set(found)];
}

// Deterministic cleanup for model output. The prompt asks for the same; this enforces it.
export function cleanDraftText(text: string) {
  return text
    .replace(/[‐‑]/g, "-")
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s+-{1,2}\s+/g, ", ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\[(?:your name|name|sender|sender name|your first name)\]/gi, SENDER_TOKEN)
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Condensed from the humanizer skill's word and phrase lists. Advisory only.
const tells = [
  "seamless",
  "cutting-edge",
  "elevate",
  "game-changer",
  "game changer",
  "unlock",
  "leverage",
  "streamline",
  "robust",
  "crucial",
  "delve",
  "showcase",
  "landscape",
  "vibrant",
  "tailored",
  "synergy",
  "revolutionize",
  "empower",
  "testament",
  "pivotal",
  "additionally",
  "i hope this email finds you well",
  "i hope this message finds you well",
  "in today's digital",
  "take your business to the next level",
];
export function styleWarnings(text: string) {
  const lower = text.toLowerCase();
  const warnings = tells
    .filter((word) => new RegExp(`\\b${word.replace(/[-']/g, "\\$&")}\\b`).test(lower))
    .map((word) => `Sounds generated: "${word}"`);
  if (/[–—]/.test(text)) warnings.push("Contains a long dash; use a full stop instead.");
  if (/!/.test(text)) warnings.push("Contains an exclamation mark.");
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 140) warnings.push(`${words} words; first emails read better under 120.`);
  return warnings;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const signOffs = "Best|Thanks|Thank you|Regards|Cheers|Warm regards|Kind regards|Best regards";

// Repairs the layout models most often get wrong: an invented or company-named sender,
// a duplicated sign-off, and a body returned as one long line.
export function enforceSenderLayout(body: string, company: string) {
  let text = body;
  const intro = new RegExp(`\\b([A-Z][\\w.'-]{0,30}) here from ${escapeRegex(company)}\\b`);
  const invented = text.match(intro)?.[1];
  if (invented && invented !== "{{sender}}") {
    text = text.replace(intro, `${SENDER_TOKEN} here from ${company}`);
    if (invented.toLowerCase() !== company.toLowerCase())
      text = text.replace(new RegExp(`(^|\\s)${escapeRegex(invented)}\\s*$`), `$1${SENDER_TOKEN}`);
  }
  text = text.replace(/(\{\{sender\}\}\s*\n\s*)+\{\{sender\}\}\s*$/, SENDER_TOKEN);
  // A truncated sign-off ("Kind,") and a blank line before the name.
  text = text
    .replace(/\n(Kind|Warm|Best)\s*,\s*\n/g, (_, word: string) =>
      word === "Best" ? "\nBest,\n" : `\n${word} regards,\n`,
    )
    .replace(/(\n[A-Z][A-Za-z ]{1,20},)\s*\n\s*\n(\{\{sender\}\})\s*$/, "$1\n$2");
  if (!text.includes("\n")) {
    text = text
      .replace(/^((?:Hi|Hello|Dear)\b[^,\n]{0,80},)\s+/, "$1\n\n")
      .replace(new RegExp(`\\s+(${signOffs})(,?)\\s+(\\{\\{sender\\}\\})$`), "\n\n$1$2\n$3");
  }
  return text.trim();
}
