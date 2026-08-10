import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  date,
  integer,
  boolean,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------- Users (admin + customers + instructors) ----------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  role: varchar("role", { length: 16 }).notNull().default("customer"), // "admin" | "customer" | "instructor"
  // Required for customers (waiver/age checks); not applicable to staff.
  dob: date("dob"),
  instagram: varchar("instagram", { length: 60 }),
  notes: text("notes"),
  // Preferred home studio, collected at signup. Required for new customer
  // signups at the app level; nullable here since older accounts predate it.
  locationId: integer("location_id").references(() => locations.id),
  // Banked "makeup class" credits — leftover credits swept in from a prior
  // package when a new one is bought. Never expire; drawn on only once a
  // membership's own per-cycle credits are exhausted.
  makeupCredits: integer("makeup_credits").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Locations ----------
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

// ---------- Class types (e.g., Bollywood Zumba, Strength) ----------
export const classTypes = pgTable("class_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).notNull().default("#C2185B"),
});

// ---------- Class sessions (calendar entries) ----------
export const classSessions = pgTable(
  "class_sessions",
  {
    id: serial("id").primaryKey(),
    classTypeId: integer("class_type_id")
      .notNull()
      .references(() => classTypes.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull().default(20),
    // Free-text display label — doesn't require an instructor account.
    instructor: varchar("instructor", { length: 160 }),
    // The instructor account that can see this class in their portal. Null
    // means any instructor assigned to the studio can see it (default).
    assignedInstructorId: integer("assigned_instructor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    canceled: boolean("canceled").notNull().default(false),
    // Classes created together as a weekly series share this id, so they can
    // be edited or removed as a group. Null for one-off classes.
    seriesId: varchar("series_id", { length: 40 }),
  },
  (t) => ({ startsIdx: index("sessions_starts_idx").on(t.startsAt) })
);

// ---------- Packages / membership plans ----------
export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  // credits = number of classes included; null = unlimited for the duration
  credits: integer("credits"),
  durationDays: integer("duration_days").notNull().default(30),
  active: boolean("active").notNull().default(true),
  // Autopay option: charge recurringPriceCents every billingWeeks, renewing
  // the same credits/duration. Null on either means no autopay option.
  recurringPriceCents: integer("recurring_price_cents"),
  billingWeeks: integer("billing_weeks"),
});

// Which locations a package grants access to. No rows = all locations.
export const packageLocations = pgTable(
  "package_locations",
  {
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.packageId, t.locationId] }) })
);

// Which studios an instructor is assigned to.
export const instructorLocations = pgTable(
  "instructor_locations",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.locationId] }) })
);

// ---------- Memberships (a customer's purchased package) ----------
export const memberships = pgTable("memberships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packageId: integer("package_id")
    .notNull()
    .references(() => packages.id),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | expired | pending | frozen
  creditsRemaining: integer("credits_remaining"), // null = unlimited
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  // When the current freeze started (admin-only pause) — null if not frozen.
  // On resume, the frozen span is added back onto endsAt so the customer
  // doesn't lose paid-for time, then this is cleared.
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  // Checkout session id (one-time purchases) or invoice id (subscription
  // renewals) that created this row — kept unique so webhook retries can't
  // double-grant credits.
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  billingType: varchar("billing_type", { length: 16 }).notNull().default("one_time"), // one_time | recurring
  // Set once an admin issues a $20-off promo code converting this trial
  // (Drop-In) booking into credit toward a real package — null until then.
  trialCreditCode: varchar("trial_credit_code", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Bookings ----------
export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    membershipId: integer("membership_id").references(() => memberships.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 16 }).notNull().default("booked"), // booked | canceled
    // True when this booking's credit was drawn from the user's makeup
    // credit pool (membershipId's own credits were exhausted at booking
    // time) — determines where a cancellation refund goes.
    fromMakeupCredit: boolean("from_makeup_credit").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: index("bookings_user_session_idx").on(t.userId, t.sessionId) })
);

// ---------- Zelle payments (manual, off-platform payment method) ----------
// Where to send Zelle payments, editable by the admin. Single row.
export const zelleSettings = pgTable("zelle_settings", {
  id: serial("id").primaryKey(),
  recipient: varchar("recipient", { length: 200 }).notNull(),
  instructions: text("instructions"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A customer's self-reported Zelle payment, pending admin verification
// against their actual bank activity before a membership is granted.
export const zellePayments = pgTable("zelle_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packageId: integer("package_id")
    .notNull()
    .references(() => packages.id),
  amountCents: integer("amount_cents").notNull(),
  confirmationNumber: varchar("confirmation_number", { length: 100 }),
  status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | approved | rejected
  membershipId: integer("membership_id").references(() => memberships.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

// ---------- Password reset tokens (forgot-password email flow) ----------
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Waiver template + signatures ----------
export const waiverTemplate = pgTable("waiver_template", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const waiverSignatures = pgTable("waiver_signatures", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  signedName: varchar("signed_name", { length: 200 }).notNull(),
  version: integer("version").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Instructor pay (paid/due tracking per instructor per month) ----------
// The actual class list and $ owed are always computed live from
// class_sessions.assignedInstructorId — this table only remembers whether
// admin has marked a given instructor's month as paid.
export const instructorPayouts = pgTable(
  "instructor_payouts",
  {
    id: serial("id").primaryKey(),
    instructorId: integer("instructor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(), // "yyyy-mm"
    status: varchar("status", { length: 16 }).notNull().default("due"), // due | paid
    comments: text("comments"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({ uniq: uniqueIndex("instructor_payouts_instructor_month_idx").on(t.instructorId, t.month) })
);

// ---------- Relations ----------
export const usersRelations = relations(users, ({ one, many }) => ({
  memberships: many(memberships),
  bookings: many(bookings),
  signatures: many(waiverSignatures),
  instructorLocations: many(instructorLocations),
  zellePayments: many(zellePayments),
  payouts: many(instructorPayouts),
  location: one(locations, { fields: [users.locationId], references: [locations.id] }),
}));

export const instructorPayoutsRelations = relations(instructorPayouts, ({ one }) => ({
  instructor: one(users, { fields: [instructorPayouts.instructorId], references: [users.id] }),
}));

export const zellePaymentsRelations = relations(zellePayments, ({ one }) => ({
  user: one(users, { fields: [zellePayments.userId], references: [users.id] }),
  package: one(packages, { fields: [zellePayments.packageId], references: [packages.id] }),
  membership: one(memberships, {
    fields: [zellePayments.membershipId],
    references: [memberships.id],
  }),
}));

export const instructorLocationsRelations = relations(instructorLocations, ({ one }) => ({
  user: one(users, { fields: [instructorLocations.userId], references: [users.id] }),
  location: one(locations, {
    fields: [instructorLocations.locationId],
    references: [locations.id],
  }),
}));

export const classSessionsRelations = relations(classSessions, ({ one, many }) => ({
  classType: one(classTypes, {
    fields: [classSessions.classTypeId],
    references: [classTypes.id],
  }),
  location: one(locations, {
    fields: [classSessions.locationId],
    references: [locations.id],
  }),
  assignedInstructor: one(users, {
    fields: [classSessions.assignedInstructorId],
    references: [users.id],
  }),
  bookings: many(bookings),
}));

export const packagesRelations = relations(packages, ({ many }) => ({
  locations: many(packageLocations),
  memberships: many(memberships),
}));

export const packageLocationsRelations = relations(packageLocations, ({ one }) => ({
  package: one(packages, {
    fields: [packageLocations.packageId],
    references: [packages.id],
  }),
  location: one(locations, {
    fields: [packageLocations.locationId],
    references: [locations.id],
  }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  package: one(packages, {
    fields: [memberships.packageId],
    references: [packages.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  session: one(classSessions, {
    fields: [bookings.sessionId],
    references: [classSessions.id],
  }),
}));

export const waiverSignaturesRelations = relations(waiverSignatures, ({ one }) => ({
  user: one(users, { fields: [waiverSignatures.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
