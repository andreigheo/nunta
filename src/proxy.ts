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

export function proxy(request: NextRequest) {
  const segment = request.nextUrl.pathname.split("/")[1] ?? "";
  if (!protectedSegments.has(segment)) return NextResponse.next();

  const session = request.cookies.get("weddingos_session")?.value;
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE_ENABLED === "true";
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
  signIn.searchParams.set("returnTo", request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
