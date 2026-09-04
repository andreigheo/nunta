import type { MetadataRoute } from "next";

const siteUrl = "https://sarbato.space";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/produs",
    "/contact",
    "/confidentialitate",
    "/termeni",
    "/rambursari",
    "/cookies",
  ];

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/produs" ? 0.9 : 0.6,
  }));
}

