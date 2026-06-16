import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EKS Inventory",
  description: "AWS EKS multi-account microservice inventory dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
