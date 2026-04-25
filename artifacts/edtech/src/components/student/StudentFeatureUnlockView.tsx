import { ArrowLeft, CreditCard, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STUDENT_VERIFICATION_CONTACT_EMAIL } from "@/lib/student-access";
import { getStudentUnlockFeatureLabel, type StudentUnlockFeature, type StudentUnlockKind } from "@/lib/student-unlock";

type StudentFeatureUnlockViewProps = {
  feature: StudentUnlockFeature;
  kind?: StudentUnlockKind;
  label?: string | null;
  examLabel?: string | null;
  subjectLabel?: string | null;
  amount?: number | null;
  onBack?: () => void;
  onPay?: () => void;
  isPaying?: boolean;
  paymentError?: string | null;
  paymentReady?: boolean;
};

function formatAmount(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function StudentFeatureUnlockView({
  feature,
  kind = "feature",
  label,
  examLabel,
  subjectLabel,
  amount,
  onBack,
  onPay,
  isPaying = false,
  paymentError,
  paymentReady = false,
}: StudentFeatureUnlockViewProps) {
  const featureLabel = getStudentUnlockFeatureLabel(feature);
  const amountLabel = formatAmount(amount);
  const title =
    feature === "tests"
      ? label?.trim()
        ? `Unlock ${label.trim()}`
        : "Unlock Test Access"
      : label?.trim()
        ? `Unlock ${label.trim()}`
        : "Unlock Question Bank Access";

  const bodyCopy =
    kind === "chapter"
      ? "This chapter is locked for your account. Complete the one-time payment to continue with this topic."
      : kind === "test"
        ? "This test is locked for your account. Complete the one-time payment to continue with the attempt."
        : `This ${featureLabel.toLowerCase()} area is locked for your account. Complete the one-time payment to continue.`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-[#E5E7EB] bg-white"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        ) : null}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#F5D0A5] bg-[#FFF7E8] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#B45309]">
          <LockKeyhole className="h-3.5 w-3.5" />
          One-time unlock
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-[#F5D0A5] bg-[linear-gradient(135deg,#FFF8ED_0%,#FFFFFF_52%,#FFFBF5_100%)] shadow-[0_24px_60px_rgba(249,115,22,0.12)]">
        <div className="border-b border-[#F5E6D3] px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-[#D97706] text-white shadow-[0_16px_32px_rgba(217,119,6,0.22)]">
                <CreditCard className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#111827]">{title}</h1>
              <p className="mt-3 text-sm leading-7 text-[#6B7280]">{bodyCopy}</p>
            </div>

            <div className="rounded-[24px] border border-[#F5D0A5] bg-white/80 px-5 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9A6B2C]">Unlock amount</p>
              <div className="mt-3 text-[28px] font-black tracking-tight text-[#111827]">
                {amountLabel ?? "Not set"}
              </div>
              <p className="mt-2 text-xs leading-5 text-[#6B7280]">
                {amountLabel
                  ? "One-time amount configured for this student unlock."
                  : "The unlock amount has not been configured for this student yet."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[26px] border border-[#F3E8D6] bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9A6B2C]">Unlock details</p>
            <div className="mt-4 space-y-3 text-sm text-[#111827]">
              <div className="flex items-start justify-between gap-3 rounded-2xl bg-[#FFF9F2] px-4 py-3">
                <span className="text-[#6B7280]">Feature</span>
                <span className="font-semibold">{featureLabel}</span>
              </div>
              {label?.trim() ? (
                <div className="flex items-start justify-between gap-3 rounded-2xl bg-[#FFF9F2] px-4 py-3">
                  <span className="text-[#6B7280]">{kind === "chapter" ? "Chapter" : kind === "test" ? "Test" : "Item"}</span>
                  <span className="text-right font-semibold">{label.trim()}</span>
                </div>
              ) : null}
              {subjectLabel?.trim() ? (
                <div className="flex items-start justify-between gap-3 rounded-2xl bg-[#FFF9F2] px-4 py-3">
                  <span className="text-[#6B7280]">Subject</span>
                  <span className="text-right font-semibold">{subjectLabel.trim()}</span>
                </div>
              ) : null}
              {examLabel?.trim() ? (
                <div className="flex items-start justify-between gap-3 rounded-2xl bg-[#FFF9F2] px-4 py-3">
                  <span className="text-[#6B7280]">Exam</span>
                  <span className="text-right font-semibold">{examLabel.trim()}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[26px] border border-[#F3E8D6] bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9A6B2C]">Next step</p>
            <h2 className="mt-3 text-xl font-black tracking-tight text-[#111827]">Payment unlock flow</h2>
            <p className="mt-3 text-sm leading-7 text-[#6B7280]">
              This unlock request is ready for one-time payment. If the amount is not visible yet, the super admin still needs to assign it for this student.
            </p>

            <div className="mt-5 rounded-2xl border border-[#F3E8D6] bg-[#FFF9F2] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9A6B2C]">Support email</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <Mail className="h-4 w-4 text-[#D97706]" />
                <span className="break-all">{STUDENT_VERIFICATION_CONTACT_EMAIL}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <Button
                type="button"
                className="rounded-full bg-[#D97706] text-white hover:bg-[#B45309] disabled:bg-[#E5E7EB] disabled:text-[#94A3B8]"
                disabled={!amountLabel || !paymentReady || isPaying}
                onClick={onPay}
              >
                {isPaying ? "Processing..." : "Pay to Unlock"}
              </Button>
              <p className={`text-xs leading-5 ${paymentError ? "text-rose-600" : "text-[#6B7280]"}`}>
                {paymentError
                  ? paymentError
                  : amountLabel
                    ? paymentReady
                      ? "The Razorpay checkout will open and unlock this feature after the payment is verified."
                      : "Payment checkout is not configured yet. Ask the super admin to connect Razorpay."
                    : "Ask the super admin to set the unlock amount first."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
