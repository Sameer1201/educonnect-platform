type ExtractedQuestion = {
  type: "mcq" | "multi" | "integer";
  question: string;
  options?: string[];
  correct?: number[];
  answer?: number;
  hasImage: boolean;
};

type ExtractQuestionBankInput = {
  rawText?: string;
  imageDataUrls?: string[];
};

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env["OPENAI_MODEL"] ?? "gpt-5.4-mini";

const QUESTION_BANK_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["mcq", "multi", "integer"] },
          question: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
          },
          correct: {
            type: "array",
            items: { type: "integer" },
          },
          answer: { type: "integer" },
          hasImage: { type: "boolean" },
        },
        required: ["type", "question", "hasImage"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function looksImageDependent(question: string) {
  return /matrix|graph|diagram|figure|table|image|shown below|given below|circuit|structure/i.test(question);
}

function optionLabelToIndex(label: string) {
  const normalized = label.trim().toUpperCase();
  if (!/^[A-F]$/.test(normalized)) return null;
  return normalized.charCodeAt(0) - 65;
}

function parseAnswerKey(answerText: string) {
  const labels = answerText
    .toUpperCase()
    .replace(/ANS(WER)?[:\-\s]*/g, "")
    .split(/[,/&\s]+/)
    .map((part) => part.replace(/[^A-F0-9.-]/g, ""))
    .filter(Boolean);

  const letterIndexes = labels
    .map((label) => optionLabelToIndex(label))
    .filter((value): value is number => value !== null);

  if (letterIndexes.length > 0) {
    return {
      type: letterIndexes.length > 1 ? "multi" as const : "mcq" as const,
      correct: letterIndexes,
    };
  }

  const numberMatch = answerText.match(/-?\d+/);
  if (numberMatch) {
    return {
      type: "integer" as const,
      answer: Number(numberMatch[0]),
    };
  }

  return null;
}

function extractQuestionsWithLocalHeuristics(rawText: string): ExtractedQuestion[] {
  const text = normalizeWhitespace(rawText);
  if (!text) return [];

  const questionBlocks = text
    .split(/\n(?=(?:Q(?:uestion)?\s*\d+[\).:\-]|(?:\d+)[\).]))/i)
    .map((block) => block.trim())
    .filter(Boolean);

  const blocks = questionBlocks.length > 1 ? questionBlocks : text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  const extracted: ExtractedQuestion[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const options: string[] = [];
    let answerLine = "";
    const questionParts: string[] = [];

    for (const line of lines) {
      if (/^(ans|answer|correct answer)\b/i.test(line)) {
        answerLine = line;
        continue;
      }

      const optionMatch = line.match(/^\(?([A-F])[\).:\-]\s*(.+)$/i);
      if (optionMatch) {
        options.push(optionMatch[2].trim());
        continue;
      }

      questionParts.push(line);
    }

    const combinedQuestion = questionParts
      .join(" ")
      .replace(/^(Q(?:uestion)?\s*\d+[\).:\-]?\s*|\d+[\).]\s*)/i, "")
      .trim();

    let question = combinedQuestion;
    if (!answerLine) {
      const inlineAnswerMatch = combinedQuestion.match(/^(.*?)(?:\s+)?(?:ans|answer|correct answer)\s*[:\-]\s*(.+)$/i);
      if (inlineAnswerMatch) {
        question = inlineAnswerMatch[1].trim();
        answerLine = inlineAnswerMatch[2].trim();
      }
    }

    if (!question) continue;

    const hasImage = looksImageDependent(question);
    const parsedAnswer = answerLine ? parseAnswerKey(answerLine) : null;

    if (options.length >= 2) {
      extracted.push({
        type: parsedAnswer?.type === "multi" ? "multi" : "mcq",
        question,
        options,
        correct: parsedAnswer && "correct" in parsedAnswer ? parsedAnswer.correct : [],
        hasImage,
      });
      continue;
    }

    if (parsedAnswer?.type === "integer" && typeof parsedAnswer.answer === "number") {
      extracted.push({
        type: "integer",
        question,
        answer: parsedAnswer.answer,
        hasImage,
      });
      continue;
    }
  }

  return extracted;
}

export async function extractQuestionBankFromText(input: string | ExtractQuestionBankInput): Promise<ExtractedQuestion[]> {
  const rawText = typeof input === "string" ? input : input.rawText ?? "";
  const imageDataUrls = typeof input === "string" ? [] : (input.imageDataUrls ?? []).filter(Boolean);
  const inputText = rawText.trim();
  if (!inputText && imageDataUrls.length === 0) {
    throw new Error("Input text or at least one image is required.");
  }
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    return extractQuestionsWithLocalHeuristics(inputText);
  }

  const userContent: Array<Record<string, unknown>> = [];
  if (inputText) {
    userContent.push({
      type: "input_text",
      text: inputText,
    });
  }
  for (const imageDataUrl of imageDataUrls) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "high",
    });
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You convert educational content into a structured question bank.",
                "Extract every question in order.",
                "Question types allowed: mcq, multi, integer.",
                "For mcq and multi, keep options in original order.",
                "Convert answer labels to zero-based option indexes.",
                "If answer is missing, return an empty correct array.",
                "If question depends on a missing diagram, matrix, graph, or unreadable symbol, set hasImage to true.",
                "Do not hallucinate missing options, answers, or diagrams.",
                "Return questions only in the requested schema.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "question_bank_extraction",
          schema: QUESTION_BANK_SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "OpenAI extraction request failed";
    throw new Error(message);
  }

  const payload = await response.json();
  const outputText = typeof payload?.output_text === "string" ? payload.output_text : "";
  if (!outputText) {
    throw new Error("OpenAI returned an empty extraction response.");
  }

  let parsed: { questions?: unknown };
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI returned invalid JSON.");
  }

  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  return questions.flatMap((item): ExtractedQuestion[] => {
    if (!item || typeof item !== "object") return [];

    const type = (item as Record<string, unknown>).type;
    const question = typeof (item as Record<string, unknown>).question === "string"
      ? (item as Record<string, string>).question.trim()
      : "";
    const hasImage = Boolean((item as Record<string, unknown>).hasImage);

    if (!question || (type !== "mcq" && type !== "multi" && type !== "integer")) {
      return [];
    }

    const options = Array.isArray((item as Record<string, unknown>).options)
      ? ((item as Record<string, unknown>).options as unknown[])
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      : [];

    const correct = Array.isArray((item as Record<string, unknown>).correct)
      ? ((item as Record<string, unknown>).correct as unknown[])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0)
      : [];

    const answerValue = (item as Record<string, unknown>).answer;
    const answer = Number.isInteger(answerValue) ? Number(answerValue) : undefined;

    if (type === "integer") {
      return [{ type, question, answer, hasImage }];
    }

    return [{ type, question, options, correct, hasImage }];
  });
}
