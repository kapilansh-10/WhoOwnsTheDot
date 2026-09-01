import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhoOwnsTheDot — pay $1 more and it’s yours",
  description: "The internet has one dot. Own it until someone pays a dollar more.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "WhoOwnsTheDot — pay $1 more and it’s yours",
    description: "The internet has one dot. Own it until someone pays a dollar more.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
