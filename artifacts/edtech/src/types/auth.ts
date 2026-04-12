import type { User as ApiUser } from "@workspace/api-client-react";

export interface StudentProfileDetails {
  dateOfBirth: string;
  whatsappOnSameNumber: boolean;
  address: {
    country: string;
    state: string;
    city: string;
    pincode: string;
  };
  preparation: {
    classLevel: string;
    board: string;
    targetYear: string;
    targetExam: string;
  };
  learningMode: {
    mode: string;
    provider: string;
  };
  hearAboutUs: string;
}

export interface AuthUser extends ApiUser {
  onboardingComplete?: boolean;
  profileDetails?: StudentProfileDetails | null;
}
