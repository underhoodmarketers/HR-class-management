import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; reset?: string };
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center font-display text-2xl font-600">
          Holistic <span className="text-magenta">Rhythm</span>
        </Link>
        <div className="card p-7">
          <h1 className="mb-1 text-lg font-700">Welcome back</h1>
          <p className="mb-6 text-sm text-ink/50">Sign in to your studio account.</p>
          {searchParams.reset ? (
            <p className="mb-4 rounded-lg bg-magenta/10 px-3 py-2 text-sm text-magenta-deep">
              Password updated. Sign in with your new password.
            </p>
          ) : null}
          <LoginForm next={searchParams.next} />
          <p className="mt-4 text-center text-sm">
            <Link href="/forgot-password" className="text-magenta hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-ink/60">
          New here?{" "}
          <Link
            href={
              searchParams.next
                ? `/signup?next=${encodeURIComponent(searchParams.next)}`
                : "/signup"
            }
            className="font-semibold text-magenta"
          >
            Create your profile
          </Link>
        </p>
      </div>
    </main>
  );
}
