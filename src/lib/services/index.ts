/**
 * Service interfaces — the frontend talks to these abstractions only.
 * Mock implementations below resolve with demo data; replacing them with
 * HTTP-backed implementations requires no changes in the UI layer.
 */

import type {
  Task,
  Guest,
  BudgetCategory,
  Expense,
  Payment,
  Vendor,
  Offer,
  Booking,
  Risk,
  AppNotification,
  ActivityItem,
  Contract,
} from "@/lib/types";
import { tasks } from "@/lib/data/tasks";
import { guests, guestStats } from "@/lib/data/guests";
import { budgetCategories, expenses, payments } from "@/lib/data/budget";
import { vendors, offers, bookings, contracts } from "@/lib/data/vendors";
import { risks, notifications, activity } from "@/lib/data/operations";

export interface TaskService {
  list(): Promise<Task[]>;
  update(id: string, patch: Partial<Task>): Promise<Task>;
  create(input: Omit<Task, "id">): Promise<Task>;
  remove(id: string): Promise<void>;
}

export interface GuestService {
  list(): Promise<Guest[]>;
  stats(): Promise<typeof guestStats>;
}

export interface BudgetService {
  categories(): Promise<BudgetCategory[]>;
  expenses(): Promise<Expense[]>;
  payments(): Promise<Payment[]>;
}

export interface VendorService {
  marketplace(): Promise<Vendor[]>;
  offers(): Promise<Offer[]>;
  bookings(): Promise<Booking[]>;
  contracts(): Promise<Contract[]>;
}

export interface OperationsService {
  risks(): Promise<Risk[]>;
  notifications(): Promise<AppNotification[]>;
  activity(): Promise<ActivityItem[]>;
}

/* ------------------------------------------------------------------ */
/*  Mock implementations                                               */
/* ------------------------------------------------------------------ */

const latency = () => new Promise((r) => setTimeout(r, 120));

export const mockTaskService: TaskService = {
  async list() {
    await latency();
    return tasks;
  },
  async update(id, patch) {
    await latency();
    const found = tasks.find((t) => t.id === id);
    if (!found) throw new Error(`Task ${id} not found`);
    return { ...found, ...patch };
  },
  async create(input) {
    await latency();
    return { ...input, id: `t-${Date.now()}` };
  },
  async remove() {
    await latency();
  },
};

export const mockGuestService: GuestService = {
  async list() {
    await latency();
    return guests;
  },
  async stats() {
    await latency();
    return guestStats;
  },
};

export const mockBudgetService: BudgetService = {
  async categories() {
    await latency();
    return budgetCategories;
  },
  async expenses() {
    await latency();
    return expenses;
  },
  async payments() {
    await latency();
    return payments;
  },
};

export const mockVendorService: VendorService = {
  async marketplace() {
    await latency();
    return vendors;
  },
  async offers() {
    await latency();
    return offers;
  },
  async bookings() {
    await latency();
    return bookings;
  },
  async contracts() {
    await latency();
    return contracts;
  },
};

export const mockOperationsService: OperationsService = {
  async risks() {
    await latency();
    return risks;
  },
  async notifications() {
    await latency();
    return notifications;
  },
  async activity() {
    await latency();
    return activity;
  },
};
