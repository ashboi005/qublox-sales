import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: { default: "Qublox · Sales workspace", template: "%s · Qublox" },
  description: "Private prospect research and outreach review for Qublox.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-clip">
      <body className="overflow-x-clip">{children}</body>
    </html>
  );
}
