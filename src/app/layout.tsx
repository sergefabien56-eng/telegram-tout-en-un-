import type { Metadata } from "next";
import { SidebarScript } from "@/components/sidebar-script";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TOUT EN UN — Business Manager",
    template: "%s · TOUT EN UN",
  },
  description:
    "Gestion commerciale multi-boutiques Jumia — commandes, produits, stocks, finances et MIMI, sur Telegram et sur le web.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <SidebarScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
