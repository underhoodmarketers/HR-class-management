"use client";

import { useState } from "react";
import { requestZellePayment } from "@/app/actions/zelle";
import { SubmitButton } from "./SubmitButton";
import SchedulePicker from "@/components/SchedulePicker";
import { formatMoney } from "@/lib/utils";

type Slot = { locationId: number; weekday: number };

export default function ZelleButton({
  packageId,
  priceCents,
  recipient,
  instructions,
  className,
  isDropIn,
}: {
  packageId: number;
  priceCents: number;
  recipient: string | null;
  instructions: string | null;
  className: string;
  isDropIn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [stage, setStage] = useState<"schedule" | "form">(isDropIn ? "form" : "schedule");
  const [schedule, setSchedule] = useState<{ slots: Slot[]; startDate: string | null }>({
    slots: [],
    startDate: null,
  });

  if (!recipient) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStage(isDropIn ? "form" : "schedule");
          setOpen(true);
        }}
        className={className}
      >
        Pay via Zelle
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-600">Pay via Zelle</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-2 py-1 text-sm text-ink/40 hover:bg-ink/5"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {stage === "schedule" ? (
              <div className="space-y-4">
                <SchedulePicker packageId={packageId} onChange={setSchedule} />
                <button type="button" onClick={() => setStage("form")} className="btn-primary w-full">
                  Continue
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 rounded-xl bg-blush/40 p-4 text-sm">
                  <p>
                    Send <span className="font-700">{formatMoney(priceCents)}</span> via Zelle to:
                  </p>
                  <p className="mt-1 font-600 text-magenta-deep">{recipient}</p>
                  {instructions ? <p className="mt-2 text-ink/60">{instructions}</p> : null}
                </div>

                <form action={requestZellePayment} className="space-y-3">
                  <input type="hidden" name="packageId" value={packageId} />
                  {schedule.slots.length > 0 ? (
                    <input type="hidden" name="slots" value={JSON.stringify(schedule.slots)} />
                  ) : null}
                  {schedule.startDate ? (
                    <input type="hidden" name="startDate" value={schedule.startDate} />
                  ) : null}
                  <div>
                    <div className="relative mb-1.5 flex items-center gap-1.5">
                      <label className="label mb-0">Zelle confirmation number</label>
                      <button
                        type="button"
                        onClick={() => setShowHelp((v) => !v)}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-magenta bg-white text-xs font-bold text-magenta shadow-sm transition hover:bg-magenta hover:text-white"
                        aria-label="Where do I find this?"
                      >
                        ?
                      </button>

                      {showHelp ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-72 max-w-[80vw] rounded-xl border border-ink/10 bg-white p-3 text-xs text-ink/60 shadow-card">
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <p>
                              Open your banking app, tap{" "}
                              <span className="font-600 text-ink/80">&quot;See all transactions,&quot;</span>{" "}
                              find your Zelle payment to us, and copy the number shown next to the
                              recipient name.
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowHelp(false)}
                              className="shrink-0 rounded-full px-1.5 py-0.5 text-ink/40 hover:bg-ink/5"
                              aria-label="Close"
                            >
                              ✕
                            </button>
                          </div>
                          <img
                            src="/zelle-confirmation-example.png"
                            alt="Example bank transaction showing the Zelle confirmation number circled"
                            className="w-full rounded-lg border border-ink/10"
                          />
                        </div>
                      ) : null}
                    </div>
                    <input
                      name="confirmationNumber"
                      className="input"
                      placeholder="e.g. 30284130028"
                      required
                    />
                  </div>
                  <p className="text-xs text-ink/40">
                    We&apos;ll verify this against our bank activity and activate your membership
                    once confirmed.
                  </p>
                  <SubmitButton className="btn-primary w-full">Submit for review</SubmitButton>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
