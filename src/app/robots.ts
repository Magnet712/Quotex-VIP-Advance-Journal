import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://quotex-vip-advance-journal.onrender.com";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/dashboard/"], // Keep admin & user logs private from Google Search
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
