import type {Metadata} from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "دار الطفل المسلم | إدارة الحلقات",
    description: "منصة دار الطفل المسلم لإدارة الحلقات ومتابعة الحفظ والمراجعة.",
    icons: {
        icon: "/favicon.svg",
        shortcut: "/favicon.svg",
    },
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ar" dir="rtl">
        <body className="antialiased">{children}</body>
        </html>
    );
}
