import Link from "next/link";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center font-display text-2xl font-600">
          Holistic <span className="text-magenta">Rhythm</span>
        </Link>
        <div className="card p-7">
          <h1 className="mb-1 text-lg font-700">Reset your password</h1>
          <p className="mb-6 text-sm text-ink/50">
            Enter your account email and we&apos;ll send you a link to set a new password.
          </p>
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-center text-sm text-ink/60">
          <Link href="/login" className="font-semibold text-magenta">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
