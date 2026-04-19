import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import indiaStateDistrictSource from "@/data/india-state-districts.json";
import type { AuthUser, StudentProfileDetails } from "@/types/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ONBOARDING_DRAFT_STORAGE_KEY = "student-onboarding-draft";

interface RegistrationExamOption {
  exam: string;
  label: string;
}

const steps = [
  { title: "Personal Details", subtitle: "Basic account details" },
  { title: "Address", subtitle: "Current location" },
  { title: "Schooling & Target", subtitle: "Preparation details" },
  { title: "Learning Mode", subtitle: "Study setup" },
  { title: "Hear About Us", subtitle: "Discovery source" },
] as const;

const preparationModes = [
  "Online Paid Course",
  "Offline Paid Course",
  "Combination of Online & Offline Paid Courses",
  "Self Study using Free Resources",
] as const;

const providerOptions = [
  "Physics Wallah (PW)",
  "Unacademy",
  "Competishun",
  "IIT School",
  "eSaral",
  "Vedantu",
  "Aakash Byju's",
  "Other",
] as const;

const classLevelOptions = [
  "Class 10",
  "Class 11",
  "Class 12",
  "12th Pass",
  "First Time Dropper",
  "Second Dropper",
  "College 1st Year",
  "College 2nd Year",
  "College 3rd Year",
  "Graduate",
] as const;

const boardOptions = [
  "CBSE",
  "ICSE",
  "State Board",
  "NIOS",
  "UG University",
  "Other",
] as const;

const hearAboutOptions = [
  "YouTube",
  "Instagram",
  "Telegram",
  "Friend or Family",
  "School or Coaching",
  "Google Search",
  "Other",
] as const;

const indiaStateOptions = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

type IndiaStateDistrictSource = {
  states: Array<{
    state: string;
    districts: string[];
  }>;
};

function normalizeLocationName(value: string) {
  return value.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function buildDistrictOptionsByState() {
  const source = indiaStateDistrictSource as IndiaStateDistrictSource;
  const stateAliases: Record<string, string> = {
    "Chandigarh (UT)": "Chandigarh",
    "Dadra and Nagar Haveli (UT)": "Dadra and Nagar Haveli and Daman and Diu",
    "Daman and Diu (UT)": "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi (NCT)": "Delhi",
    "Lakshadweep (UT)": "Lakshadweep",
    "Puducherry (UT)": "Puducherry",
  };

  const districtsByState = new Map<string, string[]>(
    indiaStateOptions.map((state) => [state, []]),
  );

  const appendDistrict = (state: string, district: string) => {
    const normalizedDistrict = normalizeLocationName(district);
    if (!normalizedDistrict) return;
    const existing = districtsByState.get(state) ?? [];
    if (!existing.includes(normalizedDistrict)) {
      existing.push(normalizedDistrict);
      districtsByState.set(state, existing);
    }
  };

  source.states.forEach((entry) => {
    const targetState = stateAliases[entry.state] ?? entry.state;
    if (!districtsByState.has(targetState)) return;
    entry.districts.forEach((district) => appendDistrict(targetState, district));
  });

  ["Nicobar", "North and Middle Andaman", "South Andaman"].forEach((district) => appendDistrict("Andaman and Nicobar Islands", district));
  ["Kargil", "Leh"].forEach((district) => appendDistrict("Ladakh", district));

  const jammuAndKashmirDistricts = districtsByState.get("Jammu and Kashmir") ?? [];
  districtsByState.set(
    "Jammu and Kashmir",
    jammuAndKashmirDistricts.filter((district) => district !== "Kargil" && district !== "Leh"),
  );

  return Object.fromEntries(districtsByState.entries());
}

const districtOptionsByState = buildDistrictOptionsByState();

function buildInitialDetails(user: AuthUser): StudentProfileDetails {
  const existing = user.profileDetails;
  return {
    dateOfBirth: existing?.dateOfBirth ?? "",
    whatsappOnSameNumber: existing?.whatsappOnSameNumber ?? true,
    whatsappNumber: existing?.whatsappNumber ?? user.phone ?? "",
    address: {
      country: "India",
      state: existing?.address?.state ?? "",
      district: existing?.address?.district ?? "",
      street: existing?.address?.street ?? "",
      city: existing?.address?.city ?? "",
      pincode: existing?.address?.pincode ?? "",
    },
    preparation: {
      classLevel: existing?.preparation?.classLevel ?? "",
      board: existing?.preparation?.board ?? "",
      targetYear: existing?.preparation?.targetYear ?? "",
      targetExam: existing?.preparation?.targetExam ?? user.subject ?? "",
    },
    learningMode: {
      mode: existing?.learningMode?.mode ?? "",
      provider: existing?.learningMode?.provider ?? "",
    },
    hearAboutUs: existing?.hearAboutUs ?? "",
  };
}

export default function StudentOnboardingGate() {
  const { user, login } = useAuth();
  const [location, setLocation] = useLocation();
  const authUser = user as AuthUser | null;
  const rejectedResubmission = authUser?.role === "student" && authUser.status === "rejected";
  const gateEnabled = !!authUser && authUser.role === "student" && (!authUser.onboardingComplete || rejectedResubmission);
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(authUser?.fullName ?? "");
  const [phone, setPhone] = useState(authUser?.phone ?? "");
  const [details, setDetails] = useState<StudentProfileDetails | null>(authUser ? buildInitialDetails(authUser) : null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const draftStorageKey = authUser ? `${ONBOARDING_DRAFT_STORAGE_KEY}:${authUser.id}` : null;

  const { data: examOptions = [] } = useQuery<RegistrationExamOption[]>({
    queryKey: ["registration-exams"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/auth/exams`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load exams");
      return response.json();
    },
    enabled: gateEnabled,
    staleTime: 60000,
    retry: 1,
  });

  useEffect(() => {
    if (!authUser || authUser.role !== "student") return;
    setFullName(authUser.fullName ?? "");
    setPhone(authUser.phone ?? "");
    setDetails(buildInitialDetails(authUser));
    setStep(0);
    setError("");
  }, [authUser?.id, authUser?.fullName, authUser?.phone, authUser?.role, authUser?.onboardingComplete, authUser?.status]);

  useEffect(() => {
    if (!draftStorageKey || !authUser || authUser.role !== "student" || authUser.onboardingComplete) return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        step?: number;
        fullName?: string;
        phone?: string;
        details?: StudentProfileDetails;
      };
      if (typeof draft.fullName === "string") setFullName(draft.fullName);
      if (typeof draft.phone === "string") setPhone(draft.phone);
      if (draft.details && typeof draft.details === "object") {
        const draftDetails = draft.details;
        setDetails((prev) => ({
          ...(prev ?? buildInitialDetails(authUser)),
          ...draftDetails,
          address: {
            ...(prev?.address ?? buildInitialDetails(authUser).address),
            ...(draftDetails.address ?? {}),
          },
          preparation: {
            ...(prev?.preparation ?? buildInitialDetails(authUser).preparation),
            ...(draftDetails.preparation ?? {}),
          },
          learningMode: {
            ...(prev?.learningMode ?? buildInitialDetails(authUser).learningMode),
            ...(draftDetails.learningMode ?? {}),
          },
        }));
      }
      if (typeof draft.step === "number" && Number.isFinite(draft.step)) {
        setStep(Math.min(Math.max(0, draft.step), steps.length - 1));
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [authUser, draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || !authUser || authUser.role !== "student" || authUser.onboardingComplete || !details) return;
    const draft = {
      step,
      fullName,
      phone,
      details,
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  }, [authUser, details, draftStorageKey, fullName, phone, step]);

  useEffect(() => {
    const shouldLockBody = gateEnabled && (!rejectedResubmission || location === "/student/profile");
    if (!shouldLockBody) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [gateEnabled, rejectedResubmission, location]);

  useEffect(() => {
    if (!details?.whatsappOnSameNumber) return;
    setDetails((prev) => (
      prev
        ? {
            ...prev,
            whatsappNumber: phone,
          }
        : prev
    ));
  }, [details?.whatsappOnSameNumber, phone]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => String(currentYear + index));
  }, []);

  const selectedState = details?.address.state ?? "";
  const selectedDistrict = details?.address.district ?? "";

  const districtOptions: string[] = !selectedState
    ? []
    : (() => {
        const options = districtOptionsByState[selectedState] ?? [];
        const currentDistrict = normalizeLocationName(selectedDistrict);
        return currentDistrict && !options.includes(currentDistrict) ? [...options, currentDistrict] : options;
      })();

  const handleStateChange = (state: string) => {
    const nextDistrictOptions = districtOptionsByState[state] ?? [];
    setDetails((prev) =>
      prev
        ? {
            ...prev,
            address: {
              ...prev.address,
              state,
              district: nextDistrictOptions.includes(prev.address.district) ? prev.address.district : "",
            },
          }
        : prev,
    );
  };

  if (!authUser || authUser.role !== "student" || !details) {
    return null;
  }

  if (!gateEnabled) {
    return null;
  }

  if (rejectedResubmission && location !== "/student/profile") {
    return null;
  }

  const updateDetails = <K extends keyof StudentProfileDetails>(key: K, value: StudentProfileDetails[K]) => {
    setDetails((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateNestedDetails = <
    K extends keyof StudentProfileDetails,
    NK extends keyof StudentProfileDetails[K] & string,
  >(key: K, nestedKey: NK, value: StudentProfileDetails[K][NK]) => {
    setDetails((prev) =>
      prev
        ? {
            ...prev,
            [key]: {
              ...(prev[key] as Record<string, unknown>),
              [nestedKey]: value,
            },
          }
        : prev,
    );
  };

  const validateStep = () => {
    if (step === 0) {
      if (!fullName.trim()) return "Full name is required.";
      if (!details.dateOfBirth.trim()) return "Date of birth is required.";
      if (!phone.trim()) return "Phone number is required.";
      if (!details.whatsappOnSameNumber && !details.whatsappNumber.trim()) return "WhatsApp number is required.";
    }
    if (step === 1) {
      if (!details.address.country.trim()) return "Country is required.";
      if (!details.address.state.trim()) return "State is required.";
      if (!details.address.district.trim()) return "District is required.";
      if (!details.address.street.trim()) return "Street address is required.";
      if (!details.address.city.trim()) return "City is required.";
      if (!details.address.pincode.trim()) return "Pincode is required.";
    }
    if (step === 2) {
      if (!details.preparation.classLevel.trim()) return "Current stage is required.";
      if (!details.preparation.board.trim()) return "Board is required.";
      if (!details.preparation.targetYear.trim()) return "Target year is required.";
      if (!details.preparation.targetExam.trim()) return "Target exam is required.";
    }
    if (step === 3) {
      if (!details.learningMode.mode.trim()) return "Learning mode is required.";
      if (details.learningMode.mode !== "Self Study using Free Resources" && !details.learningMode.provider.trim()) {
        return "Please select your platform or institute.";
      }
    }
    if (step === 4 && !details.hearAboutUs.trim()) {
      return "Please tell us how you heard about us.";
    }
    return "";
  };

  const handleNext = async () => {
    const nextError = validateStep();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError("");

    if (step < steps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${BASE}/api/auth/student-onboarding`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          subject: details.preparation.targetExam.trim(),
          profileDetails: details,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save setup");
      }
      if (draftStorageKey) {
        window.localStorage.removeItem(draftStorageKey);
      }
      login(payload as AuthUser);
      setLocation("/student/pending-approval");
    } catch (err: any) {
      setError(err.message ?? "Failed to save setup");
    } finally {
      setSaving(false);
    }
  };

  const indicator = (index: number) => {
    if (index < step) return "done";
    if (index === step) return "current";
    return "upcoming";
  };

  const targetExamField = examOptions.length > 0 ? (
    <select
      value={details.preparation.targetExam}
      onChange={(event) => updateNestedDetails("preparation", "targetExam", event.target.value)}
      className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
    >
      <option value="">Select your target exam</option>
      {examOptions.map((option) => (
        <option key={option.exam} value={option.exam}>
          {option.label}
        </option>
      ))}
    </select>
  ) : (
    <Input
      value={details.preparation.targetExam}
      onChange={(event) => updateNestedDetails("preparation", "targetExam", event.target.value)}
      placeholder="Enter your target exam"
      className="h-12 rounded-2xl border-[#DCE3F1]"
    />
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111827]/20 backdrop-blur-[3px] px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(17,24,39,0.18)]">
        <div className="border-b border-[#EEF2F7] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5B4DFF]">Complete Setup</p>
              <h2 className="mt-1 text-2xl font-bold text-[#111827]">
                {rejectedResubmission ? "Update and resubmit your profile" : "Finish your student profile"}
              </h2>
              {rejectedResubmission && authUser.rejectionReason ? (
                <div className="mt-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#7F1D1D]">
                  <span className="font-semibold text-[#B91C1C]">Rejection reason:</span> {authUser.rejectionReason}
                </div>
              ) : null}
            </div>
            <div className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#5B4DFF]">
              Step {step + 1} of {steps.length}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-2">
            {steps.map((entry, index) => {
              const state = indicator(index);
              return (
                <div key={entry.title} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                        state === "done"
                          ? "border-[#5B4DFF] bg-[#5B4DFF] text-white"
                          : state === "current"
                            ? "border-[#5B4DFF] bg-white text-[#5B4DFF]"
                            : "border-[#DCE3F1] bg-white text-[#9AA4B2]"
                      }`}
                    >
                      {state === "done" ? <Check size={14} /> : index + 1}
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`h-px flex-1 ${index < step ? "bg-[#5B4DFF]" : "bg-[#DCE3F1]"}`} />
                    )}
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-tight text-[#111827]">{entry.title}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {error ? (
            <div className="mb-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
              {error}
            </div>
          ) : null}

          {step === 0 ? (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-bold tracking-tight text-[#111827]">Personal details</p>
                <p className="mt-2 text-sm text-[#6B7280]">We need a few details before we personalize your student experience.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="onboarding-full-name" className="mb-2 block text-sm font-medium text-[#374151]">Full name</Label>
                  <Input
                    id="onboarding-full-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Enter your full name"
                    className="h-12 rounded-2xl border-[#DCE3F1]"
                  />
                </div>
                <div>
                  <Label htmlFor="onboarding-dob" className="mb-2 block text-sm font-medium text-[#374151]">Date of birth</Label>
                  <Input
                    id="onboarding-dob"
                    type="date"
                    value={details.dateOfBirth}
                    onChange={(event) => updateDetails("dateOfBirth", event.target.value)}
                    className="h-12 rounded-2xl border-[#DCE3F1]"
                  />
                </div>
                <div>
                  <Label htmlFor="onboarding-phone" className="mb-2 block text-sm font-medium text-[#374151]">Phone number</Label>
                  <Input
                    id="onboarding-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Enter your phone number"
                    className="h-12 rounded-2xl border-[#DCE3F1]"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-[#EEF2F7] bg-[#FAFBFF] px-4 py-3 text-sm text-[#374151]">
                <Checkbox
                  checked={details.whatsappOnSameNumber}
                  onCheckedChange={(checked) => {
                    const useSameNumber = checked === true;
                    updateDetails("whatsappOnSameNumber", useSameNumber);
                    if (useSameNumber) {
                      updateDetails("whatsappNumber", phone.trim());
                    }
                  }}
                />
                <span>I use WhatsApp on this number.</span>
              </label>
              {!details.whatsappOnSameNumber ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="onboarding-whatsapp" className="mb-2 block text-sm font-medium text-[#374151]">WhatsApp number</Label>
                    <Input
                      id="onboarding-whatsapp"
                      value={details.whatsappNumber}
                      onChange={(event) => updateDetails("whatsappNumber", event.target.value)}
                      placeholder="Enter your WhatsApp number"
                      className="h-12 rounded-2xl border-[#DCE3F1]"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-bold tracking-tight text-[#111827]">Address</p>
                <p className="mt-2 text-sm text-[#6B7280]">This helps us keep your location and communication details organized.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Country</Label>
                  <Input
                    value="India"
                    disabled
                    className="h-12 rounded-2xl border-[#DCE3F1] bg-[#F8FAFC] text-[#111827] disabled:opacity-100"
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">State</Label>
                  <select
                    value={details.address.state}
                    onChange={(event) => handleStateChange(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
                  >
                    <option value="">Select your state</option>
                    {indiaStateOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">District</Label>
                  <select
                    value={details.address.district}
                    onChange={(event) => updateNestedDetails("address", "district", event.target.value)}
                    disabled={!details.address.state}
                    className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF] disabled:bg-[#F8FAFC] disabled:text-[#9AA4B2]"
                  >
                    <option value="">{details.address.state ? "Select your district" : "Select state first"}</option>
                    {districtOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">City / Town</Label>
                  <Input
                    value={details.address.city}
                    onChange={(event) => updateNestedDetails("address", "city", event.target.value)}
                    placeholder="Enter your city or town"
                    className="h-12 rounded-2xl border-[#DCE3F1]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Street / Village</Label>
                  <Input
                    value={details.address.street}
                    onChange={(event) => updateNestedDetails("address", "street", event.target.value)}
                    placeholder="House no, street, village, area, landmark"
                    className="h-12 rounded-2xl border-[#DCE3F1]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Pincode</Label>
                  <Input
                    value={details.address.pincode}
                    onChange={(event) => updateNestedDetails("address", "pincode", event.target.value)}
                    placeholder="Enter your pincode"
                    className="h-12 rounded-2xl border-[#DCE3F1]"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-bold tracking-tight text-[#111827]">Schooling and target</p>
                <p className="mt-2 text-sm text-[#6B7280]">Your target exam is required so we can match tests, analysis, and question banks correctly.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Current stage</Label>
                  <select
                    value={details.preparation.classLevel}
                    onChange={(event) => updateNestedDetails("preparation", "classLevel", event.target.value)}
                    className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
                  >
                    <option value="">Select current stage</option>
                    {classLevelOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Board</Label>
                  <select
                    value={details.preparation.board}
                    onChange={(event) => updateNestedDetails("preparation", "board", event.target.value)}
                    className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
                  >
                    <option value="">Select board</option>
                    {boardOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Target year</Label>
                  <select
                    value={details.preparation.targetYear}
                    onChange={(event) => updateNestedDetails("preparation", "targetYear", event.target.value)}
                    className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
                  >
                    <option value="">Select target year</option>
                    {yearOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Target exam</Label>
                  {targetExamField}
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-bold tracking-tight text-[#111827]">Learning mode</p>
                <p className="mt-2 text-sm text-[#6B7280]">Tell us how you are preparing so we can tune the experience and recommendations.</p>
              </div>
              <div className="grid gap-4">
                <div>
                  <Label className="mb-2 block text-sm font-medium text-[#374151]">Preparation mode</Label>
                  <select
                    value={details.learningMode.mode}
                    onChange={(event) => {
                      updateNestedDetails("learningMode", "mode", event.target.value);
                      if (event.target.value === "Self Study using Free Resources") {
                        updateNestedDetails("learningMode", "provider", "");
                      }
                    }}
                    className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
                  >
                    <option value="">How are you preparing?</option>
                    {preparationModes.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                {details.learningMode.mode && details.learningMode.mode !== "Self Study using Free Resources" ? (
                  <div>
                    <Label className="mb-2 block text-sm font-medium text-[#374151]">Platform or institute</Label>
                    <select
                      value={details.learningMode.provider}
                      onChange={(event) => updateNestedDetails("learningMode", "provider", event.target.value)}
                      className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
                    >
                      <option value="">Select your platform</option>
                      {providerOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-bold tracking-tight text-[#111827]">How did you hear about us?</p>
                <p className="mt-2 text-sm text-[#6B7280]">This helps us understand how students discover the platform.</p>
              </div>
              <div>
                <Label className="mb-2 block text-sm font-medium text-[#374151]">Source</Label>
                <select
                  value={details.hearAboutUs}
                  onChange={(event) => updateDetails("hearAboutUs", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DCE3F1] bg-white px-4 text-sm text-[#111827] outline-none transition focus:border-[#5B4DFF]"
                >
                  <option value="">Select source</option>
                  {hearAboutOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#EEF2F7] px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError("");
              setStep((current) => Math.max(0, current - 1));
            }}
            disabled={step === 0 || saving}
            className="min-w-[120px] rounded-2xl"
          >
            Previous
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="min-w-[180px] rounded-2xl bg-[#5B4DFF] hover:bg-[#4A3EE0]"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Saving...
              </>
            ) : step === steps.length - 1 ? "Complete Setup" : "Save & Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
