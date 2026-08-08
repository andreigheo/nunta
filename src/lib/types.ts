/* ------------------------------------------------------------------ */
/*  WeddingOS domain types                                             */
/* ------------------------------------------------------------------ */

export type ID = string;

/* ---------- Workspace / wedding ---------- */

export interface Wedding {
  id: ID;
  title: string;
  partnerOne: string;
  partnerTwo: string;
  date: string; // ISO
  city: string;
  venueName?: string;
  estimatedGuests: number;
  targetBudget: number;
  currency: "RON" | "EUR";
  rsvpDeadline: string; // ISO
  style: string[];
  status: "planning" | "on-track" | "at-risk" | "completed" | "archived";
}

export interface TeamMember {
  id: ID;
  name: string;
  email: string;
  role: "owner" | "partner" | "planner" | "family" | "viewer";
  status: "active" | "invited";
  lastActive?: string;
}

/* ---------- Planning ---------- */

export type TaskStatus = "not-started" | "in-progress" | "waiting" | "blocked" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: ID;
  title: string;
  description?: string;
  category: string;
  owner: string;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: string; // ISO
  startDate?: string;
  dependsOn?: ID;
  comments: number;
  attachments: number;
  subtasks?: { id: ID; title: string; done: boolean }[];
  relatedVendor?: string;
  isPrivate?: boolean;
  version?: number;
  assigneeMembershipId?: ID | null;
  phaseId?: ID | null;
  milestoneId?: ID | null;
  blockedReason?: string | null;
}

/* ---------- Guests ---------- */

export type RsvpStatus = "confirmed" | "declined" | "unsure" | "no-response";
export type InvitationStatus = "not-sent" | "sent" | "delivered" | "opened";
export type GuestSide = "ana" | "mihai" | "common";
export type MenuChoice = "standard" | "vegetarian" | "vegan" | "copii" | "fara-gluten" | "none";

export interface Guest {
  id: ID;
  firstName: string;
  lastName: string;
  householdId: ID;
  side: GuestSide;
  relationship: string;
  email?: string;
  phone?: string;
  invitation: InvitationStatus;
  rsvp: RsvpStatus;
  menu: MenuChoice;
  allergies?: string;
  isChild?: boolean;
  isPlusOne?: boolean;
  transportNeeded: boolean;
  accommodationNeeded: boolean;
  tableId?: ID;
  events: string[]; // event ids
  lastContact?: string;
  notes?: string;
}

export interface Household {
  id: ID;
  name: string;
  city: string;
  language: "ro" | "en";
}

/* ---------- Budget ---------- */

export interface BudgetCategory {
  id: ID;
  name: string;
  icon: string;
  planned: number;
  estimated: number;
  contracted: number;
  paid: number;
}

export type ExpenseStatus = "estimate" | "quoted" | "contracted" | "partially-paid" | "paid";

export interface Expense {
  id: ID;
  name: string;
  categoryId: ID;
  vendor?: string;
  estimated: number;
  contracted: number;
  actual: number;
  paid: number;
  dueDate?: string;
  status: ExpenseStatus;
}

export type PaymentStatus = "overdue" | "due-soon" | "upcoming" | "paid";

export interface Payment {
  id: ID;
  name: string;
  vendor: string;
  categoryId: ID;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  method?: string;
}

/* ---------- Vendors ---------- */

export type VendorCategory =
  | "Fotograf"
  | "Videograf"
  | "DJ & Muzică"
  | "Florist"
  | "Catering"
  | "Locație"
  | "Decor"
  | "Tort & Dulciuri"
  | "Foto cabină"
  | "Transport";

export interface Vendor {
  id: ID;
  name: string;
  category: VendorCategory;
  city: string;
  verified: boolean;
  rating: number;
  reviews: number;
  startingPrice: number;
  availableOnDate: boolean;
  availabilityStatus?: "AVAILABLE" | "TENTATIVE" | "UNAVAILABLE" | "UNKNOWN";
  responseTime: string;
  styles: string[];
  description: string;
  favorite?: boolean;
}

export type BookingStage =
  | "contacted"
  | "quote-requested"
  | "quote-received"
  | "negotiating"
  | "selected"
  | "contracted"
  | "deposit-paid"
  | "completed"
  | "cancelled";

export interface Booking {
  id: ID;
  vendorName: string;
  category: VendorCategory;
  stage: BookingStage;
  value: number;
  owner: string;
  nextAction?: string;
  deadline?: string;
}

export type OfferStatus = "new" | "reviewing" | "clarification" | "negotiating" | "accepted" | "declined";

export interface Offer {
  id: ID;
  vendorName: string;
  category: VendorCategory;
  status: OfferStatus;
  basePrice: number;
  vatIncluded: boolean;
  receivedAt: string;
  validUntil: string;
  highlights: string[];
  concerns?: string[];
}

/* ---------- Contracts & documents ---------- */

export interface Contract {
  id: ID;
  name: string;
  vendor: string;
  type: "Prestări servicii" | "Locație" | "Catering" | "Altele";
  value: number;
  signed: boolean;
  signedAt?: string;
  nextPayment?: string;
  nextPaymentAmount?: number;
  riskLevel: "low" | "medium" | "high";
  expiresAt?: string;
}

/* ---------- Risks ---------- */

export interface Risk {
  id: ID;
  title: string;
  category: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  owner: string;
  plan?: string;
  status: "active" | "mitigated" | "resolved";
}

/* ---------- Notifications & activity ---------- */

export type NotificationModule = "tasks" | "guests" | "vendors" | "payments" | "risks" | "system";

export interface AppNotification {
  id: ID;
  module: NotificationModule;
  title: string;
  description: string;
  time: string; // ISO
  read: boolean;
  href: string;
}

export interface ActivityItem {
  id: ID;
  user: string;
  action: string;
  module: string;
  time: string;
  href: string;
}

/* ---------- Calendar ---------- */

export type CalendarEventType = "task" | "meeting" | "payment" | "vendor" | "contract" | "guest" | "wedding";

export interface CalendarEvent {
  id: ID;
  title: string;
  type: CalendarEventType;
  date: string; // ISO
  time?: string;
  location?: string;
}

/* ---------- AI Copilot ---------- */

export interface AIActionCard {
  id: ID;
  title: string;
  explanation: string;
  affected: string;
  preview: string[];
  status: "pending" | "approved" | "rejected";
}

export interface AIMessage {
  id: ID;
  role: "user" | "assistant";
  content: string;
  actionCard?: AIActionCard;
}

/* ---------- Seating ---------- */

export interface SeatTable {
  id: ID;
  name: string;
  shape: "round" | "rect";
  capacity: number;
  x: number; // percent on canvas
  y: number;
}

/* ---------- Misc ---------- */

export interface TimelineMilestone {
  id: ID;
  title: string;
  phase: string;
  month: string;
  done: boolean;
  critical?: boolean;
  delayed?: boolean;
}
