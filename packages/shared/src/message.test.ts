import { expect, test } from "bun:test";
import {
  cleanDraftText,
  enforceSenderLayout,
  firstName,
  renderMessage,
  styleWarnings,
  unsupportedPlaceholders,
} from "./message";

test("sender placeholder renders the sending teammate's first name", () => {
  const body = "Hi Sharma Hotels team,\n\n{{sender}} here from Qublox.\n\nThanks,\n{{sender}}";
  expect(renderMessage(body, "Mania Kapoor")).toBe(
    "Hi Sharma Hotels team,\n\nMania here from Qublox.\n\nThanks,\nMania",
  );
  expect(renderMessage("{{ Sender }} here", "  ")).toBe("The Qublox team here");
  expect(firstName("dr. a")).toBe("dr.");
});

test("cleanup removes dashes, curly quotes and stray name placeholders", () => {
  expect(cleanDraftText("Your site looks great — the menu is clear – and fast")).toBe(
    "Your site looks great, the menu is clear, and fast",
  );
  expect(cleanDraftText("Open 10–6 daily")).toBe("Open 10-6 daily");
  expect(cleanDraftText("It’s “nice”")).toBe('It\'s "nice"');
  expect(cleanDraftText("Best,\n[Your Name]")).toBe("Best,\n{{sender}}");
  expect(cleanDraftText("Line one  \n\n\n\nLine two")).toBe("Line one\n\nLine two");
});

test("only the sender placeholder may survive into an approved message", () => {
  expect(unsupportedPlaceholders("Hi {{sender}}")).toEqual([]);
  expect(unsupportedPlaceholders("Hi {{first_name}}, I'm [Company]")).toEqual([
    "{{first_name}}",
    "[Company]",
  ]);
});

test("style warnings flag common AI tells without blocking approval", () => {
  const warnings = styleWarnings(
    "I hope this email finds you well! We deliver seamless, cutting-edge solutions — let's elevate your brand.",
  );
  expect(warnings.join(" ")).toContain("seamless");
  expect(warnings.join(" ")).toContain("dash");
  expect(warnings.join(" ")).toContain("exclamation");
  expect(styleWarnings("Hi team,\n\nAsha here from Qublox. Saw your menu online.")).toEqual([]);
});

test("layout repair restores the sender token and line breaks models drop", () => {
  expect(
    enforceSenderLayout(
      "Hi Fictional Workshop team, Alex here from Qublox. I noticed the form. Would it help? Best, Alex",
      "Qublox",
    ),
  ).toBe(
    "Hi Fictional Workshop team,\n\n{{sender}} here from Qublox. I noticed the form. Would it help?\n\nBest,\n{{sender}}",
  );
  expect(
    enforceSenderLayout(
      "Hi team,\n\nQublox here from Qublox.\n\nWould it help?\n\nBest,\n{{sender}}\n{{sender}}",
      "Qublox",
    ),
  ).toBe("Hi team,\n\n{{sender}} here from Qublox.\n\nWould it help?\n\nBest,\n{{sender}}");
  const good = "Hi Ravi,\n\n{{sender}} here from Qublox. Quick question.\n\nThanks,\n{{sender}}";
  expect(enforceSenderLayout(good, "Qublox")).toBe(good);
});

test("non-breaking hyphens become plain hyphens", () => {
  expect(cleanDraftText("easy‑to‑use")).toBe("easy-to-use");
});
