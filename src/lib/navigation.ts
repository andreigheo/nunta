import {
  Activity,
  Archive,
  Armchair,
  BedDouble,
  Bus,
  CalendarDays,
  Camera,
  ClipboardList,
  Compass,
  FileSignature,
  FileText,
  FolderGit2,
  Gift,
  Heart,
  Home,
  Images,
  LayoutDashboard,
  ListChecks,
  Mail,
  Map,
  MessageSquareHeart,
  PieChart,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Timer,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  Wand2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CapabilityKey } from "@weddingos/contracts";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  badgeTone?: "danger" | "warning" | "brand";
  capability: CapabilityKey;
  minimumPlan?: "PLUS" | "PRO";
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Începe aici",
    items: [
      {
        label: "Acasă",
        href: "/overview",
        icon: LayoutDashboard,
        capability: "planning.read",
      },
      { label: "Planul evenimentului", href: "/plan", icon: ListChecks, capability: "planning.read" },
      { label: "Buget", href: "/budget", icon: Wallet, capability: "budget.read" },
    ],
  },
  {
    id: "planning",
    label: "Program și progres",
    items: [
      { label: "Calendar", href: "/calendar", icon: CalendarDays, capability: "calendar.read" },
      { label: "Cronologie", href: "/timeline", icon: Timer, capability: "timeline.read" },
    ],
  },
  {
    id: "guests",
    label: "Invitați",
    items: [
      { label: "CRM Invitați", href: "/guests", icon: Users, capability: "guest.read" },
      { label: "Invitații", href: "/invitations", icon: Mail, capability: "invitation.read" },
      { label: "RSVP", href: "/rsvp", icon: ClipboardList, capability: "rsvp.read" },
      { label: "Plan de mese", href: "/seating", icon: Armchair, capability: "seating.read", minimumPlan: "PLUS" },
      { label: "Meniuri", href: "/menus", icon: UtensilsCrossed, capability: "menu.read" },
      { label: "Transport", href: "/transport", icon: Bus, capability: "transport.read", minimumPlan: "PLUS" },
      { label: "Cazare", href: "/accommodation", icon: BedDouble, capability: "accommodation.read" },
    ],
  },
  {
    id: "vendors",
    label: "Furnizori",
    items: [
      { label: "Marketplace", href: "/marketplace", icon: Compass, capability: "marketplace.read" },
      { label: "Favorite", href: "/favorites", icon: Heart, capability: "marketplace.favorite" },
      { label: "Liste scurte", href: "/shortlists", icon: Star, capability: "marketplace.shortlist" },
      { label: "Cereri ofertă", href: "/requests", icon: FileText, capability: "rfq.read", minimumPlan: "PLUS" },
      { label: "Oferte", href: "/offers", icon: FolderGit2, capability: "offer.read", minimumPlan: "PLUS" },
      { label: "Rezervări", href: "/bookings", icon: FileSignature, capability: "booking.read", minimumPlan: "PLUS" },
    ],
  },
  {
    id: "finance",
    label: "Finanțe & Documente",
    items: [
      { label: "Plăți", href: "/payments", icon: PieChart, capability: "payment.read" },
      { label: "Contracte", href: "/contracts", icon: FileSignature, capability: "contract.read", minimumPlan: "PLUS" },
      { label: "Documente", href: "/documents", icon: FileText, capability: "document.read", minimumPlan: "PLUS" },
    ],
  },
  {
    id: "creative",
    label: "Creativ",
    items: [
      { label: "Studio de design", href: "/design-studio", icon: Wand2, capability: "invitation.read" },
      { label: "Moodboarduri", href: "/moodboards", icon: Images, capability: "invitation.read" },
    ],
  },
  {
    id: "operations",
    label: "Operațiuni eveniment",
    items: [
      { label: "Riscuri & Plan B", href: "/risks", icon: ShieldAlert, capability: "risk.read", minimumPlan: "PRO" },
      { label: "Planuri B", href: "/contingency-plans", icon: ShieldAlert, capability: "contingency.read", minimumPlan: "PRO" },
      { label: "Automatizări", href: "/automations", icon: Workflow, capability: "automation.read", minimumPlan: "PLUS" },
      { label: "Ziua evenimentului", href: "/event-day", icon: Sparkles, capability: "wedding_day.read", minimumPlan: "PRO" },
      { label: "Momente", href: "/moments", icon: Camera, capability: "guest_moment.read", minimumPlan: "PRO" },
    ],
  },
  {
    id: "after",
    label: "După eveniment",
    items: [
      { label: "După eveniment", href: "/post-event", icon: Gift, capability: "gallery.read" },
      { label: "Recenzii", href: "/reviews", icon: MessageSquareHeart, capability: "review.read" },
      { label: "Arhivă", href: "/archive", icon: Archive, capability: "document.read" },
    ],
  },
  {
    id: "workspace",
    label: "Spațiu de lucru",
    items: [
      { label: "Echipă", href: "/team", icon: UsersRound, capability: "team.read" },
      { label: "Activitate", href: "/activity", icon: Activity, capability: "workspace.read" },
      { label: "Unelte", href: "/tools", icon: Map, capability: "workspace.read" },
      { label: "Setări", href: "/settings", icon: Settings, capability: "settings.read" },
    ],
  },
];

export const mobileNavItems = [
  { label: "Acasă", href: "/overview", icon: Home, capability: "planning.read" as CapabilityKey },
  { label: "Plan", href: "/plan", icon: ListChecks, capability: "planning.read" as CapabilityKey },
  { label: "Invitați", href: "/guests", icon: Users, capability: "guest.read" as CapabilityKey },
  { label: "Buget", href: "/budget", icon: Wallet, capability: "budget.read" as CapabilityKey },
];

const planRank = { FREE: 0, PLUS: 1, PRO: 2 } as const;

export function planIncludes(
  currentPlan: keyof typeof planRank,
  requiredPlan: Exclude<keyof typeof planRank, "FREE">,
) {
  return planRank[currentPlan] >= planRank[requiredPlan];
}

export function navigationItemForPath(pathname: string) {
  return navGroups
    .flatMap((group) => group.items)
    .find(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
}

const routeCapabilityOverrides: Array<{
  prefix: string;
  capability: CapabilityKey;
}> = [
  { prefix: "/invitations/editor", capability: "invitation.write" },
  {
    prefix: "/provider/checkout",
    capability: "online_payment.create_checkout",
  },
];

export function requiredCapabilityForPath(
  pathname: string,
): CapabilityKey | null {
  const override = routeCapabilityOverrides.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return override?.capability ?? navigationItemForPath(pathname)?.capability ?? null;
}
