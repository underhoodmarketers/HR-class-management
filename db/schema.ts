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
  // Banked "makeup class" credits — leftover credits swept in from a prior
  // package when a new one is bought. Never expire; drawn on only once a
  // membership's own per-cycle credits are exhausted.
  makeupCredits: integer("makeup_credits").notNull().default(0),
  // Classes an admin checked this customer into while they had no package
  // or no remaining credits. Repaid automatically out of the credits granted
  // by their next real purchase (see applyOwedCredits in lib/queries.ts).
  creditsOwed: integer("credits_owed").notNull().default(0),
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

// A customer's preferred studio(s), chosen at signup and editable after —
// a customer can pick more than one.
export const userLocations = pgTable(
  "user_locations",
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
  // Set once the "expires in 7 days" / "expires today" emails go out, so the
  // daily cron never sends either one twice for the same membership.
  expiryReminderSentAt: timestamp("expiry_reminder_sent_at", { withTimezone: true }),
  expiredEmailSentAt: timestamp("expired_email_sent_at", { withTimezone: true }),
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
    // True when this booking was checked in by an admin with no package or
    // no remaining credits at all — added to the customer's creditsOwed
    // instead of deducting anything, so a cancellation refund restores it.
    fromOwedCredit: boolean("from_owed_credit").notNull().default(false),
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

// ---------- Location finances (revenue vs. expenses, per studio) ----------
// Manually-entered non-instructor costs (studio rent, advertising, etc.) —
// instructor pay is intentionally excluded here since it's already computed
// live from class_sessions in the Instructor Pay report; this table would
// just double-count it.
export const locationExpenses = pgTable("location_expenses", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Historical revenue imported from the old registration sheets, for months
// before real purchases flowed through the app. Going forward, revenue is
// computed live from memberships — nothing new should be written here.
export const locationRevenueHistory = pgTable("location_revenue_history", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  customerName: varchar("customer_name", { length: 200 }),
  amountCents: integer("amount_cents").notNull(),
  comment: text("comment"),
});

// ---------- Promo codes (restrictions layer on top of Stripe coupons) ----------
// Stripe still owns the actual discount mechanics (coupon + promotion
// code); this table tracks which one and lets checkout enforce
// restrictions Stripe has no concept of (packages, customers, locations
// are all app-specific). No rows in a given restriction table = that
// dimension is unrestricted, same convention as package_locations.
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  stripeCouponId: varchar("stripe_coupon_id", { length: 255 }).notNull(),
  stripePromotionCodeId: varchar("stripe_promotion_code_id", { length: 255 }).notNull(),
  // How many times ONE customer may redeem this code — separate from
  // Stripe's own max_redemptions, which is a total pool shared across
  // everyone. Null = no per-customer limit.
  maxUsesPerCustomer: integer("max_uses_per_customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per successful checkout that applied a promo code — only the
// initial redemption, not each autopay renewal invoice — so per-customer
// usage can be enforced (Stripe has no concept of this).
export const promoCodeRedemptions = pgTable("promo_code_redemptions", {
  id: serial("id").primaryKey(),
  promoCodeId: integer("promo_code_id")
    .notNull()
    .references(() => promoCodes.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  membershipId: integer("membership_id").references(() => memberships.id, {
    onDelete: "set null",
  }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promoCodePackages = pgTable(
  "promo_code_packages",
  {
    promoCodeId: integer("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.promoCodeId, t.packageId] }) })
);

export const promoCodeCustomers = pgTable(
  "promo_code_customers",
  {
    promoCodeId: integer("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.promoCodeId, t.userId] }) })
);

export const promoCodeLocations = pgTable(
  "promo_code_locations",
  {
    promoCodeId: integer("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.promoCodeId, t.locationId] }) })
);

// ---------- Relations ----------
export const usersRelations = relations(users, ({ one, many }) => ({
  memberships: many(memberships),
  bookings: many(bookings),
  signatures: many(waiverSignatures),
  instructorLocations: many(instructorLocations),
  locations: many(userLocations),
  zellePayments: many(zellePayments),
  payouts: many(instructorPayouts),
}));

export const instructorPayoutsRelations = relations(instructorPayouts, ({ one }) => ({
  instructor: one(users, { fields: [instructorPayouts.instructorId], references: [users.id] }),
}));

export const locationExpensesRelations = relations(locationExpenses, ({ one }) => ({
  location: one(locations, { fields: [locationExpenses.locationId], references: [locations.id] }),
}));

export const locationRevenueHistoryRelations = relations(locationRevenueHistory, ({ one }) => ({
  location: one(locations, { fields: [locationRevenueHistory.locationId], references: [locations.id] }),
}));

export const promoCodesRelations = relations(promoCodes, ({ many }) => ({
  packages: many(promoCodePackages),
  customers: many(promoCodeCustomers),
  locations: many(promoCodeLocations),
  redemptions: many(promoCodeRedemptions),
}));

export const promoCodeRedemptionsRelations = relations(promoCodeRedemptions, ({ one }) => ({
  promoCode: one(promoCodes, {
    fields: [promoCodeRedemptions.promoCodeId],
    references: [promoCodes.id],
  }),
  user: one(users, { fields: [promoCodeRedemptions.userId], references: [users.id] }),
}));

export const promoCodePackagesRelations = relations(promoCodePackages, ({ one }) => ({
  promoCode: one(promoCodes, { fields: [promoCodePackages.promoCodeId], references: [promoCodes.id] }),
  package: one(packages, { fields: [promoCodePackages.packageId], references: [packages.id] }),
}));

export const promoCodeCustomersRelations = relations(promoCodeCustomers, ({ one }) => ({
  promoCode: one(promoCodes, { fields: [promoCodeCustomers.promoCodeId], references: [promoCodes.id] }),
  user: one(users, { fields: [promoCodeCustomers.userId], references: [users.id] }),
}));

export const promoCodeLocationsRelations = relations(promoCodeLocations, ({ one }) => ({
  promoCode: one(promoCodes, { fields: [promoCodeLocations.promoCodeId], references: [promoCodes.id] }),
  location: one(locations, { fields: [promoCodeLocations.locationId], references: [locations.id] }),
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

export const userLocationsRelations = relations(userLocations, ({ one }) => ({
  user: one(users, { fields: [userLocations.userId], references: [users.id] }),
  location: one(locations, {
    fields: [userLocations.locationId],
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
  membership: one(memberships, {
    fields: [bookings.membershipId],
    references: [memberships.id],
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
