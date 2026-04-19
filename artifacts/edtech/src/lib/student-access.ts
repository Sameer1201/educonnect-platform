export const STUDENT_VERIFICATION_CONTACT_EMAIL = "sameermajhi339@gmail.com";

type StudentAccessUser = {
  role?: string | null;
  onboardingComplete?: boolean | null;
  status?: string | null;
} | null | undefined;

export function isStudentPendingVerification(user: StudentAccessUser) {
  return user?.role === "student" && !!user.onboardingComplete && user.status === "pending";
}

export function isStudentRejectedVerification(user: StudentAccessUser) {
  return user?.role === "student" && !!user.onboardingComplete && user.status === "rejected";
}
