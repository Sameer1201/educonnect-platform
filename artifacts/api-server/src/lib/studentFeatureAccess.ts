type StudentFeatureAccess = {
  testsLocked: boolean;
  questionBankLocked: boolean;
  testAnalysisLocked: boolean;
};

export type StudentFeatureUnlockPricing = {
  testsAmount: number | null;
  questionBankAmount: number | null;
  testAnalysisAmount: number | null;
};

export type FeatureKey = "tests" | "question-bank" | "test-analysis";

export type StudentFeaturePaymentHistoryEntry = {
  id: string;
  feature: FeatureKey;
  featureLabel: string;
  amount: number;
  amountPaise: number;
  currency: string;
  orderId: string;
  paymentId: string;
  status: string;
  paidAt: string;
};

const DEFAULT_STUDENT_FEATURE_ACCESS: StudentFeatureAccess = {
  testsLocked: false,
  questionBankLocked: false,
  testAnalysisLocked: false,
};

const DEFAULT_STUDENT_FEATURE_UNLOCK_PRICING: StudentFeatureUnlockPricing = {
  testsAmount: null,
  questionBankAmount: null,
  testAnalysisAmount: null,
};

export function getStudentFeatureLabel(feature: FeatureKey) {
  if (feature === "tests") return "Tests";
  if (feature === "question-bank") return "Question Bank";
  return "Test Analysis";
}

function getProfileRecord(raw: unknown) {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function getFeatureAccessRecord(raw: unknown) {
  const profile = getProfileRecord(raw);
  const featureAccess = profile.featureAccess;
  return featureAccess && typeof featureAccess === "object"
    ? (featureAccess as Record<string, unknown>)
    : {};
}

function getFeaturePricingRecord(raw: unknown) {
  const profile = getProfileRecord(raw);
  const featureUnlockPricing = profile.featureUnlockPricing;
  return featureUnlockPricing && typeof featureUnlockPricing === "object"
    ? (featureUnlockPricing as Record<string, unknown>)
    : {};
}

function parsePositiveAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function getStudentFeatureAccess(rawProfile: unknown): StudentFeatureAccess {
  const featureAccess = getFeatureAccessRecord(rawProfile);
  return {
    testsLocked: Boolean(featureAccess.testsLocked),
    questionBankLocked: Boolean(featureAccess.questionBankLocked),
    testAnalysisLocked: Boolean(featureAccess.testAnalysisLocked),
  };
}

export function mergeStudentFeatureAccess(
  rawProfile: unknown,
  updates: Partial<StudentFeatureAccess>,
) {
  const profile = getProfileRecord(rawProfile);
  const current = getStudentFeatureAccess(rawProfile);
  return {
    ...profile,
    featureAccess: {
      ...current,
      ...updates,
    },
  };
}

export function getStudentFeatureUnlockPricing(rawProfile: unknown): StudentFeatureUnlockPricing {
  const pricing = getFeaturePricingRecord(rawProfile);
  return {
    testsAmount: parsePositiveAmount(pricing.testsAmount),
    questionBankAmount: parsePositiveAmount(pricing.questionBankAmount),
    testAnalysisAmount: parsePositiveAmount(pricing.testAnalysisAmount),
  };
}

export function mergeStudentFeatureUnlockPricing(
  rawProfile: unknown,
  updates: Partial<StudentFeatureUnlockPricing>,
) {
  const profile = getProfileRecord(rawProfile);
  const current = getStudentFeatureUnlockPricing(rawProfile);
  return {
    ...profile,
    featureUnlockPricing: {
      ...DEFAULT_STUDENT_FEATURE_UNLOCK_PRICING,
      ...current,
      ...updates,
    },
  };
}

export function isStudentFeatureLocked(
  user: { role?: string | null; studentProfileData?: string | null } | null | undefined,
  feature: FeatureKey,
) {
  if (user?.role !== "student") return false;

  let parsedProfile: unknown = null;
  if (typeof user.studentProfileData === "string" && user.studentProfileData.trim()) {
    try {
      parsedProfile = JSON.parse(user.studentProfileData);
    } catch {
      parsedProfile = null;
    }
  }

  const access = getStudentFeatureAccess(parsedProfile);
  if (feature === "tests") return access.testsLocked;
  if (feature === "question-bank") return access.questionBankLocked;
  return access.testAnalysisLocked;
}

export function getStudentFeaturePaymentHistory(rawProfile: unknown): StudentFeaturePaymentHistoryEntry[] {
  const profile = getProfileRecord(rawProfile);
  const rawHistory = profile.featurePaymentHistory;
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .map((entry): StudentFeaturePaymentHistoryEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const feature = record.feature === "tests" || record.feature === "question-bank" || record.feature === "test-analysis"
        ? record.feature
        : null;
      const amount = Number(record.amount);
      const amountPaise = Number(record.amountPaise);
      const orderId = typeof record.orderId === "string" ? record.orderId : "";
      const paymentId = typeof record.paymentId === "string" ? record.paymentId : "";
      const paidAt = typeof record.paidAt === "string" ? record.paidAt : "";
      if (!feature || !Number.isFinite(amount) || !Number.isFinite(amountPaise) || !orderId || !paymentId || !paidAt) {
        return null;
      }
      return {
        id: typeof record.id === "string" && record.id ? record.id : paymentId,
        feature,
        featureLabel: typeof record.featureLabel === "string" && record.featureLabel ? record.featureLabel : getStudentFeatureLabel(feature),
        amount,
        amountPaise,
        currency: typeof record.currency === "string" && record.currency ? record.currency : "INR",
        orderId,
        paymentId,
        status: typeof record.status === "string" && record.status ? record.status : "captured",
        paidAt,
      };
    })
    .filter((entry): entry is StudentFeaturePaymentHistoryEntry => Boolean(entry))
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
}

export function appendStudentFeaturePaymentHistory(
  rawProfile: unknown,
  entry: Omit<StudentFeaturePaymentHistoryEntry, "id" | "featureLabel"> & { id?: string; featureLabel?: string },
) {
  const profile = getProfileRecord(rawProfile);
  const history = getStudentFeaturePaymentHistory(rawProfile);
  const nextEntry: StudentFeaturePaymentHistoryEntry = {
    id: entry.id ?? entry.paymentId,
    feature: entry.feature,
    featureLabel: entry.featureLabel ?? getStudentFeatureLabel(entry.feature),
    amount: entry.amount,
    amountPaise: entry.amountPaise,
    currency: entry.currency,
    orderId: entry.orderId,
    paymentId: entry.paymentId,
    status: entry.status,
    paidAt: entry.paidAt,
  };

  return {
    ...profile,
    featurePaymentHistory: [nextEntry, ...history.filter((item) => item.paymentId !== nextEntry.paymentId)].slice(0, 100),
  };
}

export function ensureStudentFeatureUnlocked(
  user: { role?: string | null; studentProfileData?: string | null } | null | undefined,
  feature: FeatureKey,
  res: { status: (code: number) => { json: (payload: Record<string, unknown>) => void } },
) {
  if (!isStudentFeatureLocked(user, feature)) return true;

  const isTests = feature === "tests";
  const isQuestionBank = feature === "question-bank";
  res.status(403).json({
    error: isTests
      ? "Tests are locked for this student account. Complete the one-time payment to unlock access."
      : isQuestionBank
        ? "Question bank is locked for this student account. Complete the one-time payment to unlock access."
        : "Test analysis is locked for this student account. Complete the one-time payment to unlock access.",
    code: isTests ? "STUDENT_TESTS_LOCKED" : isQuestionBank ? "STUDENT_QUESTION_BANK_LOCKED" : "STUDENT_TEST_ANALYSIS_LOCKED",
  });
  return false;
}
