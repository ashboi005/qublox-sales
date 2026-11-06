import type { Metadata } from "next";
import localFont from "next/font/local";
import "../index.css";

const archivo = localFont({
  src: "../../public/fonts/archivo-latin-variable.woff2",
  variable: "--font-archivo",
  display: "swap",
  weight: "100 900",
});

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
    <html lang="en" className={`${archivo.variable} overflow-x-clip`}>
      <body className="overflow-x-clip">{children}</body>
    </html>
  );
}
