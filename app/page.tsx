import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/portal");

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink text-white">
      {/* Ambient brand glow */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-[36rem] w-[36rem] rounded-full bg-brand-gradient opacity-30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-52 -left-40 h-[30rem] w-[30rem] rounded-full bg-magenta opacity-20 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-600 tracking-tight">
          Holistic <span className="text-gold">Rhythm</span>
        </span>
        <Link href="/login" className="text-sm font-semibold text-white/80 hover:text-white">
          Sign in
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-10 md:grid-cols-2 md:pt-20">
        <div className="flex flex-col justify-center">
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gold">
            Bollywood Zumba · Frisco · McKinney · Coppell
          </span>
          <h1 className="font-display text-5xl font-700 leading-[1.05] md:text-6xl">
            Move to your
            <br />
            own <span className="bg-brand-gradient bg-clip-text text-transparent">rhythm.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-white/70">
            Book classes, manage your membership, and dance across all our studios — one
            profile, every location.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary">
              Join Holistic Rhythm
            </Link>
            <Link href="/login" className="btn-ghost border-white/30 bg-transparent text-white hover:bg-white/10">
              Member sign in
            </Link>
          </div>
        </div>

        <div className="flex items-center">
          <div className="w-full space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            {[
              { t: "Pick your package", d: "Class packs or unlimited monthly, checkout by card." },
              { t: "Sign once, dance anywhere", d: "Your liability waiver is built into signup." },
              { t: "See your schedule", d: "Only the classes your package unlocks, by location." },
            ].map((f, i) => (
              <div key={i} className="flex gap-4 rounded-2xl bg-white/5 p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-700">
                  {i + 1}
                </span>
                <div>
                  <p className="font-600">{f.t}</p>
                  <p className="text-sm text-white/60">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
