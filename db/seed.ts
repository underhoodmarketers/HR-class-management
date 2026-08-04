import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./index";
import {
  users,
  locations,
  classTypes,
  packages,
  packageLocations,
  classSessions,
  waiverTemplate,
} from "./schema";

const WAIVER_BODY = `HOLISTIC RHYTHM — ASSUMPTION OF RISK, RELEASE, AND WAIVER OF LIABILITY

I understand that participation in Bollywood Zumba, dance fitness, and strength classes offered by Holistic Rhythm ("the Studio") involves strenuous physical activity, including but not limited to dancing, jumping, and stretching.

1. Assumption of Risk. I voluntarily participate with full knowledge that these activities carry a risk of injury. I represent that I am physically able to participate and have no medical condition that would prevent safe participation.

2. Release. In consideration of being permitted to participate, I release and hold harmless Holistic Rhythm, its instructors, and its host venues from any and all claims arising out of my participation, except for injury caused by gross negligence.

3. Medical Consent. In the event of injury, I authorize the Studio to seek emergency medical treatment on my behalf.

4. Media. I grant the Studio permission to use photos or video taken in class for promotional purposes, unless I notify the Studio in writing otherwise.

By typing my name and checking the box below, I acknowledge that I have read and understood this waiver and agree to its terms.`;

function nextWeekday(weekday: number, hour: number, minute: number) {
  // weekday: 0=Sun ... 6=Sat
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

async function main() {
  console.log("Seeding Holistic Rhythm…");

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "pre@holisticrhythm.com").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash,
      name: "Pre",
      role: "admin",
    })
    .onConflictDoNothing();

  // Studios
  const studioRows = await db
    .insert(locations)
    .values([
      { name: "Frisco", address: "Frisco, TX" },
      { name: "McKinney", address: "McKinney, TX" },
      { name: "Coppell", address: "Guru Parampara School of Arts, Coppell, TX" },
    ])
    .returning();

  // Class type
  const [zumba] = await db
    .insert(classTypes)
    .values({
      name: "Bollywood Zumba",
      description: "High-energy Bollywood dance cardio.",
      color: "#C2185B",
    })
    .returning();

  // Waiver
  await db.insert(waiverTemplate).values({
    title: "Holistic Rhythm Liability Waiver",
    body: WAIVER_BODY,
    version: 1,
  });

  // Packages
  const [dropIn] = await db
    .insert(packages)
    .values({
      name: "Drop-In (1 Class)",
      description: "Try a single class.",
      priceCents: 2000,
      credits: 1,
      durationDays: 30,
    })
    .returning();

  const [tenPack] = await db
    .insert(packages)
    .values({
      name: "10-Class Pack",
      description: "Ten classes at any studio.",
      priceCents: 15000,
      credits: 10,
      durationDays: 90,
    })
    .returning();

  await db
    .insert(packages)
    .values({
      name: "Unlimited Monthly",
      description: "Dance as much as you like for a month.",
      priceCents: 9900,
      credits: null,
      durationDays: 30,
    })
    .returning();

  // Drop-in scoped to Frisco only, as an example of location scoping.
  await db.insert(packageLocations).values({
    packageId: dropIn.id,
    locationId: studioRows[0].id,
  });

  // Sample sessions (recurring pattern for the next few weeks)
  const sessionValues = [];
  for (let week = 0; week < 4; week++) {
    const shift = week * 7 * 24 * 60 * 60 * 1000;
    // Mon 7:30pm Frisco
    const mon = nextWeekday(1, 19, 30);
    // Wed 7:30pm McKinney
    const wed = nextWeekday(3, 19, 30);
    // Tue 7:30pm Coppell
    const tue = nextWeekday(2, 19, 30);
    // Sat 12:00pm Coppell
    const sat = nextWeekday(6, 12, 0);

    const make = (start: Date, locationId: number) => ({
      classTypeId: zumba.id,
      locationId,
      startsAt: new Date(start.getTime() + shift),
      endsAt: new Date(start.getTime() + shift + 60 * 60 * 1000),
      capacity: 20,
      instructor: "Pre",
    });

    sessionValues.push(
      make(mon, studioRows[0].id),
      make(wed, studioRows[1].id),
      make(tue, studioRows[2].id),
      make(sat, studioRows[2].id)
    );
  }
  await db.insert(classSessions).values(sessionValues);

  console.log(`Done. Admin login: ${adminEmail} / ${adminPassword}`);
  console.log("Change the admin password after first login.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
