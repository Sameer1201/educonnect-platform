export const STUDENT_VERIFICATION_CONTACT_EMAIL = "sameermajhi339@gmail.com";

export type StudentFeatureUnlockPricing = {
  testsAmount?: number | null;
  questionBankAmount?: number | null;
  testAnalysisAmount?: number | null;
};

type StudentAccessUser = {
  role?: string | null;
  onboardingComplete?: boolean | null;
  status?: string | null;
  studentFeatureAccess?: {
    testsLocked?: boolean | null;
    questionBankLocked?: boolean | null;
    testAnalysisLocked?: boolean | null;
  } | null;
  profileDetails?: {
    featureAccess?: {
      testsLocked?: boolean | null;
      questionBankLocked?: boolean | null;
      testAnalysisLocked?: boolean | null;
    } | null;
    featureUnlockPricing?: StudentFeatureUnlockPricing | null;
  } | null;
  studentFeaturePricing?: StudentFeatureUnlockPricing | null;
} | null | undefined;

export type StudentFeatureKey = "tests" | "question-bank" | "test-analysis";

function getStudentFeatureAccess(user: StudentAccessUser) {
  const topLevel = user?.studentFeatureAccess;
  const nested = user?.profileDetails?.featureAccess;
  return {
    testsLocked: Boolean(topLevel?.testsLocked ?? nested?.testsLocked),
    questionBankLocked: Boolean(topLevel?.questionBankLocked ?? nested?.questionBankLocked),
    testAnalysisLocked: Boolean(topLevel?.testAnalysisLocked ?? nested?.testAnalysisLocked),
  };
}

export function isStudentPendingVerification(user: StudentAccessUser) {
  return user?.role === "student" && !!user.onboardingComplete && user.status === "pending";
}

export function isStudentRejectedVerification(user: StudentAccessUser) {
  return user?.role === "student" && !!user.onboardingComplete && user.status === "rejected";
}

export function isStudentFeatureLocked(user: StudentAccessUser, feature: StudentFeatureKey) {
  if (user?.role !== "student") return false;
  const access = getStudentFeatureAccess(user);
  if (feature === "tests") return access.testsLocked;
  if (feature === "question-bank") return access.questionBankLocked;
  return access.testAnalysisLocked;
}

export function getStudentFeatureUnlockAmount(user: StudentAccessUser, feature: StudentFeatureKey) {
  const pricing = user?.studentFeaturePricing ?? user?.profileDetails?.featureUnlockPricing;
  const rawValue = feature === "tests"
    ? pricing?.testsAmount
    : feature === "question-bank"
      ? pricing?.questionBankAmount
      : pricing?.testAnalysisAmount;
  if (rawValue == null) return null;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
