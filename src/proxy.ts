import { NextResponse, type NextRequest } from "next/server";

const protectedSegments = new Set([
  "overview",
  "onboarding",
  "plan",
  "calendar",
  "timeline",
  "guests",
  "invitations",
  "rsvp",
  "seating",
  "menus",
  "transport",
  "accommodation",
  "marketplace",
  "favorites",
  "shortlists",
  "requests",
  "offers",
  "bookings",
  "budget",
  "payments",
  "contracts",
  "documents",
  "design-studio",
  "moodboards",
  "risks",
  "wedding-day",
  "moments",
  "post-wedding",
  "reviews",
  "archive",
  "team",
  "activity",
  "tools",
  "settings",
]);

const realAuthEntryPaths = new Set([
  "/sign-in",
  "/create-account",
  "/forgot-password",
  "/reset-password",
  "/magic-link",
  "/verify-email",
]);

function expireCookie(
  response: NextResponse,
  name: "weddingos_session" | "weddingos_demo",
  httpOnly: boolean,
) {
  response.cookies.set(name, "", {
    httpOnly,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const production = process.env.NODE_ENV === "production";
  const demoEnabled =
    !production &&
    process.env.NEXT_PUBLIC_DEMO_MODE_ENABLED === "true";

  if (
    production &&
    (pathname === "/beta" ||
      pathname.startsWith("/beta/") ||
      pathname === "/beta-invitation" ||
      pathname === "/admin/beta")
  ) {
    return NextResponse.rewrite(new URL("/__sarbato_not_found__", request.url));
  }

  if (pathname === "/access-denied") {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("switch", "1");
    const response = NextResponse.redirect(signIn);
    expireCookie(response, "weddingos_session", true);
    expireCookie(response, "weddingos_demo", false);
    return response;
  }

  if (realAuthEntryPaths.has(pathname)) {
    const response = NextResponse.next();
    if (request.cookies.has("weddingos_demo")) {
      expireCookie(response, "weddingos_demo", false);
    }
    if (
      pathname === "/sign-in" &&
      request.nextUrl.searchParams.get("switch") === "1" &&
      request.cookies.has("weddingos_session")
    ) {
      expireCookie(response, "weddingos_session", true);
    }
    return response;
  }

  const segment = pathname.split("/")[1] ?? "";
  if (!protectedSegments.has(segment)) return NextResponse.next();

  const session = request.cookies.get("weddingos_session")?.value;
  const demoRequested = request.nextUrl.searchParams.get("demo") === "1";
  const demoCookie = request.cookies.get("weddingos_demo")?.value === "1";

  if (session) return NextResponse.next();
  if (demoEnabled && (demoRequested || demoCookie)) {
    const response = NextResponse.next();
    response.cookies.set("weddingos_demo", "1", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  }

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("returnTo", pathname);
  const response = NextResponse.redirect(signIn);
  if (!demoEnabled && request.cookies.has("weddingos_demo")) {
    expireCookie(response, "weddingos_demo", false);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
