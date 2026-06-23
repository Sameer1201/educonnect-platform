import type { User as ApiUser } from "@workspace/api-client-react";

export interface StudentProfileDetails {
  dateOfBirth: string;
  whatsappOnSameNumber: boolean;
  whatsappNumber: string;
  address: {
    country: string;
    state: string;
    district: string;
    street: string;
    city: string;
    pincode: string;
  };
  preparation: {
    classLevel: string;
    board: string;
    targetYear: string;
    targetExam: string;
    institutionName: string;
    collegeName: string;
    universityName: string;
  };
  learningMode: {
    mode: string;
    provider: string;
  };
  hearAboutUs: string;
  dashboard?: {
    dailyQuestionGoal?: number;
  };
  featureAccess?: {
    testsLocked?: boolean;
    questionBankLocked?: boolean;
    testAnalysisLocked?: boolean;
  };
  featureUnlockPricing?: {
    testsAmount?: number | null;
    questionBankAmount?: number | null;
    testAnalysisAmount?: number | null;
  };
}

export interface StudentFeatureAccess {
  testsLocked?: boolean;
  questionBankLocked?: boolean;
  testAnalysisLocked?: boolean;
}

export interface StudentPaymentHistoryEntry {
  id: string;
  feature: "tests" | "question-bank" | "test-analysis";
  featureLabel: string;
  amount: number;
  amountPaise: number;
  currency: string;
  orderId: string;
  paymentId: string;
  status: string;
  paidAt: string;
}

export interface AuthUser extends ApiUser {
  onboardingComplete?: boolean;
  onboardingDraftStep?: number | null;
  profileDetails?: StudentProfileDetails | null;
  rejectionReason?: string | null;
  studentFeatureAccess?: StudentFeatureAccess | null;
  studentFeaturePricing?: {
    testsAmount?: number | null;
    questionBankAmount?: number | null;
    testAnalysisAmount?: number | null;
  } | null;
  studentPaymentHistory?: StudentPaymentHistoryEntry[];
}
