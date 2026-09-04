import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/produs", "/contact"],
      disallow: [
        "/admin/",
        "/api/",
        "/guest/",
        "/onboarding/",
        "/settings/",
        "/vendor/",
        "/workspace/",
      ],
    },
    sitemap: "https://sarbato.space/sitemap.xml",
  };
}
