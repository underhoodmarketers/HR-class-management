import Link from "next/link";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token || "";

  return (
    <main className="grid min-h-screen place-items-center bg-cream px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center font-display text-2xl font-600">
          Holistic <span className="text-magenta">Rhythm</span>
        </Link>
        <div className="card p-7">
          <h1 className="mb-1 text-lg font-700">Set a new password</h1>
          {token ? (
            <>
              <p className="mb-6 text-sm text-ink/50">Choose a new password for your account.</p>
              <ResetPasswordForm token={token} />
            </>
          ) : (
            <p className="text-sm text-ink/50">
              This link is missing its reset token. Request a new one from the{" "}
              <Link href="/forgot-password" className="text-magenta">
                forgot password
              </Link>{" "}
              page.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
