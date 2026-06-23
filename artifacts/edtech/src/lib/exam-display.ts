const EXAM_LABEL_OVERRIDES: Record<string, string> = {
  cat: "CAT",
  cpet: "CPET",
  cuet: "CUET",
  gate: "GATE",
  jee: "JEE",
  "jee advanced": "JEE Advanced",
  "jee main": "JEE Main",
  neet: "NEET",
  nda: "NDA",
  ssc: "SSC",
  upsc: "UPSC",
};

function toTitleCase(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function formatExamDisplayName(value?: string | null) {
  const trimmed = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const directMatch = EXAM_LABEL_OVERRIDES[trimmed.toLowerCase()];
  if (directMatch) return directMatch;

  return trimmed
    .split(" ")
    .map((part) => EXAM_LABEL_OVERRIDES[part.toLowerCase()] ?? toTitleCase(part))
    .join(" ");
}

export function formatExamDisplayNames(values: Array<string | null | undefined>) {
  return values
    .map((value) => formatExamDisplayName(value))
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}
