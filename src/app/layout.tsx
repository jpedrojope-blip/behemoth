import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: "Behemoth — Clareza para decidir melhor",
  description: "O sistema operacional inteligente da empresa: dados conectados, problemas identificados e próximas decisões claras.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
