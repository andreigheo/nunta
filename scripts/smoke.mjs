const baseUrl = (
  process.env.SMOKE_BASE_URL ||
  process.argv[2] ||
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

const routes = [
  "/",
  "/produs",
  "/despre-noi",
  "/contact",
  "/sign-in",
  "/create-account",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/magic-link",
  "/expired-link",
  "/invitation",
  "/session-expired",
  "/access-denied",
  "/start",
  "/onboarding",
  "/overview",
  "/plan",
  "/calendar",
  "/timeline",
  "/guests",
  "/invitations",
  "/invitations/editor",
  "/rsvp",
  "/seating",
  "/menus",
  "/transport",
  "/accommodation",
  "/marketplace",
  "/marketplace/v-1",
  "/favorites",
  "/shortlists",
  "/requests",
  "/offers",
  "/bookings",
  "/budget",
  "/payments",
  "/contracts",
  "/documents",
  "/design-studio",
  "/moodboards",
  "/risks",
  "/contingency-plans",
  "/automations",
  "/wedding-day",
  "/moments",
  "/post-wedding",
  "/reviews",
  "/archive",
  "/team",
  "/activity",
  "/tools",
  "/settings",
  "/guest",
  "/vendor",
  "/vendor-invitation",
  "/vendor/bookings",
  "/vendor/contracts",
  "/vendor/offers",
  "/vendor/profile",
  "/vendor/requests",
  "/vendor/services",
  "/vendor/billing",
  "/vendor/payouts",
  "/vendor/reviews",
  "/admin",
  "/admin/trust",
  "/confidentialitate",
  "/termeni",
  "/rambursari",
  "/cookies",
  "/checkout",
];

async function checkRoute(route) {
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      redirect: "follow",
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(30_000),
    });
    const contentType = response.headers.get("content-type") || "";
    await response.text();
    const isHtml = contentType.includes("text/html");
    return {
      route,
      status: response.status,
      ok: response.ok && isHtml,
      detail: !response.ok
        ? `HTTP ${response.status}`
        : !isHtml
          ? `content-type ${contentType || "missing"}`
          : "OK",
    };
  } catch (error) {
    return {
      route,
      status: 0,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = new Array(routes.length);
let nextRoute = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (nextRoute < routes.length) {
    const index = nextRoute++;
    results[index] = await checkRoute(routes[index]);
  }
});
await Promise.all(workers);

for (const result of results) {
  const marker = result.ok ? "PASS" : "FAIL";
  console.log(
    `${marker.padEnd(4)} ${String(result.status || "-").padStart(3)} ${result.route} ${result.detail}`,
  );
}

const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} routes passed against ${baseUrl}.`,
);

if (failed.length > 0) process.exitCode = 1;
