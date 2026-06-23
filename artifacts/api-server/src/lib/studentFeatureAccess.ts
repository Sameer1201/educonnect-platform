type StudentFeatureAccess = {
  testsLocked: boolean;
  questionBankLocked: boolean;
};

export type StudentFeatureUnlockPricing = {
  testsAmount: number | null;
  questionBankAmount: number | null;
};

type FeatureKey = "tests" | "question-bank";

const DEFAULT_STUDENT_FEATURE_ACCESS: StudentFeatureAccess = {
  testsLocked: false,
  questionBankLocked: false,
};

const DEFAULT_STUDENT_FEATURE_UNLOCK_PRICING: StudentFeatureUnlockPricing = {
  testsAmount: null,
  questionBankAmount: null,
};

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
  return feature === "tests" ? access.testsLocked : access.questionBankLocked;
}

export function ensureStudentFeatureUnlocked(
  user: { role?: string | null; studentProfileData?: string | null } | null | undefined,
  feature: FeatureKey,
  res: { status: (code: number) => { json: (payload: Record<string, unknown>) => void } },
) {
  if (!isStudentFeatureLocked(user, feature)) return true;

  const isTests = feature === "tests";
  res.status(403).json({
    error: isTests
      ? "Tests are locked for this student account. Complete the one-time payment to unlock access."
      : "Question bank is locked for this student account. Complete the one-time payment to unlock access.",
    code: isTests ? "STUDENT_TESTS_LOCKED" : "STUDENT_QUESTION_BANK_LOCKED",
  });
  return false;
}
