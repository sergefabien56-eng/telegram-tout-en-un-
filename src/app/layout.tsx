import type { Metadata } from "next";
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
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
