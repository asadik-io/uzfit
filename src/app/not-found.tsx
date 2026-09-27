import "@fontsource-variable/inter";
import Link from "next/link";
import "./globals.css";

// Requests outside any locale (rare, since the proxy redirects them) get a minimal page.
export default function RootNotFound() {
  return (
    <html lang="uz">
      <body className="flex min-h-dvh items-center justify-center p-6 text-center">
        <main className="flex flex-col items-center gap-3">
          <h1 className="text-2xl font-bold">404</h1>
          <p className="text-muted-foreground">Sahifa topilmadi · Страница не найдена · Page not found</p>
          <Link href="/" className="font-semibold text-primary underline">
            UzFit
          </Link>
        </main>
      </body>
    </html>
  );
}
