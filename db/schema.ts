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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------- Users (admin + customers) ----------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  role: varchar("role", { length: 16 }).notNull().default("customer"), // "admin" | "customer"
  dob: date("dob").notNull(),
  instagram: varchar("instagram", { length: 60 }),
  notes: text("notes"),
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
    instructor: varchar("instructor", { length: 160 }),
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

// ---------- Memberships (a customer's purchased package) ----------
export const memberships = pgTable("memberships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packageId: integer("package_id")
    .notNull()
    .references(() => packages.id),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | expired | pending
  creditsRemaining: integer("credits_remaining"), // null = unlimited
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  // Checkout session id (one-time purchases) or invoice id (subscription
  // renewals) that created this row — kept unique so webhook retries can't
  // double-grant credits.
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  billingType: varchar("billing_type", { length: 16 }).notNull().default("one_time"), // one_time | recurring
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: index("bookings_user_session_idx").on(t.userId, t.sessionId) })
);

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

// ---------- Relations ----------
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  bookings: many(bookings),
  signatures: many(waiverSignatures),
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

export type User = typeof users.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
