import type { MetadataRoute } from "next";

/** Web app manifest for installability. Uzbek is the default language of the app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "UzFit",
    short_name: "UzFit",
    description: "Toshkent boʻylab sport zallari va studiyalar uchun bitta abonement.",
    lang: "uz",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#047857",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
