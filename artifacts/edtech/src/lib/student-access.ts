export const STUDENT_VERIFICATION_CONTACT_EMAIL = "sameermajhi339@gmail.com";

type StudentAccessUser = {
  role?: string | null;
  onboardingComplete?: boolean | null;
  status?: string | null;
  studentFeatureAccess?: {
    testsLocked?: boolean | null;
    questionBankLocked?: boolean | null;
  } | null;
  profileDetails?: {
    featureAccess?: {
      testsLocked?: boolean | null;
      questionBankLocked?: boolean | null;
    } | null;
  } | null;
} | null | undefined;

export type StudentFeatureKey = "tests" | "question-bank";

function getStudentFeatureAccess(user: StudentAccessUser) {
  const topLevel = user?.studentFeatureAccess;
  const nested = user?.profileDetails?.featureAccess;
  return {
    testsLocked: Boolean(topLevel?.testsLocked ?? nested?.testsLocked),
    questionBankLocked: Boolean(topLevel?.questionBankLocked ?? nested?.questionBankLocked),
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
  return feature === "tests" ? access.testsLocked : access.questionBankLocked;
}
