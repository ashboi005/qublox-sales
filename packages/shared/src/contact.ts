// Contact helpers for manual WhatsApp outreach and phone-based deduplication.

const digits = (value: string) => value.replace(/\D/g, "");

// Last ten digits identify a number across "+91 ...", "0..." and spaced local formats.
export function phoneKey(phone: string) {
  const d = digits(phone);
  return d.length >= 8 ? d.slice(-10) : "";
}

// Returns the international number wa.me expects, or null when the country is ambiguous.
// Local 10-digit numbers default to India; US/Canada numbers need that country set.
export function whatsappNumber(phone: string, country: string) {
  const raw = phone.trim();
  const d = digits(raw);
  if (d.length < 8 || d.length > 15) return null;
  if (raw.startsWith("+") || raw.startsWith("00")) return raw.startsWith("00") ? d.slice(2) : d;
  const c = country.trim().toLowerCase();
  if (/^(united states|usa|us|canada)$/.test(c)) {
    if (d.length === 10) return `1${d}`;
    if (d.length === 11 && d.startsWith("1")) return d;
    return null;
  }
  if (!c || c === "india" || c === "in") {
    if (d.length === 10) return `91${d}`;
    if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
    if (d.length === 12 && d.startsWith("91")) return d;
  }
  return null;
}

export function whatsappLink(phone: string, country: string, text: string) {
  const number = whatsappNumber(phone, country);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

// Social profiles, link pages and directories are not the business's own website: there is
// nothing to audit and crawling them only wastes time (or reads the platform's own pages).
const notOwnSite =
  /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|whatsapp\.com|linktr\.ee|google\.com|g\.page|goo\.gl|youtube\.com|youtu\.be|twitter\.com|x\.com|linkedin\.com|pinterest\.com|justdial\.com|indiamart\.com|sulekha\.com|practo\.com|zomato\.com|swiggy\.com|tripadvisor\.[a-z.]+|booking\.com|yelp\.com|bit\.ly)$/i;
export function isSocialOrDirectory(url: string) {
  try {
    return notOwnSite.test(new URL(url).hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}
