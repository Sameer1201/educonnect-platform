import { useMemo, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { looksLikeRichHtmlContent, sanitizeRichHtml, stripImageMarkers, stripRichHtmlToText } from "@/lib/richContent";

interface RichQuestionContentProps {
  content?: string | null;
  className?: string;
}

const LATEX_COMMANDS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  Sigma: "Σ",
  omega: "ω",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  approx: "≈",
  neq: "≠",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  infty: "∞",
  degree: "°",
  circ: "°",
};

function readCommand(value: string, start: number) {
  let end = start + 1;
  while (end < value.length && /[A-Za-z]/.test(value[end])) end += 1;
  return { command: value.slice(start + 1, end), end };
}

function readBraceGroup(value: string, start: number) {
  if (value[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    const escaped = index > 0 && value[index - 1] === "\\";
    if (escaped) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          content: value.slice(start + 1, index),
          end: index + 1,
        };
      }
    }
  }
  return null;
}

function stripMathDelimiters(value: string) {
  return value
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\$\$/g, "")
    .trim();
}

function containsLatexishSyntax(value: string) {
  return /\\(?:\[|\]|\(|\)|frac|sqrt|text|to|rightarrow|leftarrow|times|cdot|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|Sigma|Omega|leq|geq|neq|infty)|\$\$|[_^]\{/.test(value);
}

function shouldRenderFormulaBlock(value: string) {
  const trimmed = value.trim();
  if (/^(\\\[|\$\$)/.test(trimmed)) return true;
  if (/^\\(?:frac|text|sqrt)/.test(trimmed)) return true;
  if (/^\d+\s+\\\(?\\?to/.test(trimmed)) return true;
  if (/\\frac/.test(trimmed)) return true;
  if (trimmed.length > 120) return false;

  const compactText = trimmed.replace(/\\[A-Za-z]+/g, "").replace(/[{}()[\]_^\d=+\-*/.,<>]/g, " ").replace(/\s+/g, " ").trim();
  const hasLongSentence = /[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(compactText);
  return !hasLongSentence && /^[A-Za-z0-9\s()[\]{}+\-*/=.,<>\\]+$/.test(trimmed) && /[=\\]/.test(trimmed);
}

function renderLatexishText(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (!buffer) return;
    nodes.push(buffer);
    buffer = "";
  };

  while (index < value.length) {
    if (value.startsWith("\\frac", index)) {
      const numeratorStart = index + "\\frac".length;
      const numerator = readBraceGroup(value, numeratorStart);
      const denominator = numerator ? readBraceGroup(value, numerator.end) : null;
      if (numerator && denominator) {
        flush();
        nodes.push(
          <span key={`${keyPrefix}-frac-${index}`} className="mx-1 inline-flex translate-y-[0.15em] flex-col items-center align-middle leading-none">
            <span className="px-1 text-[0.92em]">{renderLatexishText(numerator.content, `${keyPrefix}-frac-${index}-n`)}</span>
            <span className="mt-0.5 border-t border-current px-1 pt-0.5 text-[0.92em]">{renderLatexishText(denominator.content, `${keyPrefix}-frac-${index}-d`)}</span>
          </span>,
        );
        index = denominator.end;
        continue;
      }
    }

    if (value.startsWith("\\sqrt", index)) {
      const group = readBraceGroup(value, index + "\\sqrt".length);
      if (group) {
        flush();
        nodes.push(
          <span key={`${keyPrefix}-sqrt-${index}`} className="mx-0.5 inline-flex items-end align-middle">
            <span>√</span>
            <span className="border-t border-current px-1">{renderLatexishText(group.content, `${keyPrefix}-sqrt-${index}-v`)}</span>
          </span>,
        );
        index = group.end;
        continue;
      }
    }

    if (value.startsWith("\\text", index)) {
      const group = readBraceGroup(value, index + "\\text".length);
      if (group) {
        buffer += group.content;
        index = group.end;
        continue;
      }
    }

    if (value[index] === "_" || value[index] === "^") {
      const tag = value[index] === "_" ? "sub" : "sup";
      const group = readBraceGroup(value, index + 1);
      const content = group?.content ?? value[index + 1] ?? "";
      if (content) {
        flush();
        const Tag = tag;
        nodes.push(
          <Tag key={`${keyPrefix}-${tag}-${index}`} className="text-[0.75em]">
            {renderLatexishText(content, `${keyPrefix}-${tag}-${index}-v`)}
          </Tag>,
        );
        index = group ? group.end : index + 2;
        continue;
      }
    }

    if (value[index] === "\\") {
      const { command, end } = readCommand(value, index);
      if (command) {
        buffer += LATEX_COMMANDS[command] ?? command;
        index = end;
        continue;
      }
      index += 1;
      continue;
    }

    buffer += value[index];
    index += 1;
  }

  flush();
  return nodes;
}

function PlainQuestionContent({ value, className }: { value: string; className?: string }) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");

  return (
    <div className={cn("space-y-2 break-words [overflow-wrap:anywhere]", className)}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={`space-${index}`} className="h-2" />;
        const normalized = stripMathDelimiters(trimmed);
        const isFormula = shouldRenderFormulaBlock(trimmed);

        return (
          <div
            key={`${index}-${trimmed.slice(0, 16)}`}
            className={cn(
              "max-w-full",
              isFormula
                ? "my-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/70 px-3 py-2 font-medium text-slate-900"
                : "leading-relaxed",
            )}
          >
            {renderLatexishText(normalized, `line-${index}`)}
          </div>
        );
      })}
    </div>
  );
}

export function RichQuestionContent({ content, className }: RichQuestionContentProps) {
  const value = stripImageMarkers(content?.trim() ?? "");
  const isRich = looksLikeRichHtmlContent(value);
  const renderRichAsPlain = isRich && containsLatexishSyntax(value) && !/<img\b/i.test(value);
  const sanitized = useMemo(() => (isRich && !renderRichAsPlain ? sanitizeRichHtml(value) : ""), [isRich, renderRichAsPlain, value]);
  const richPlainText = useMemo(() => (renderRichAsPlain ? stripRichHtmlToText(value) : ""), [renderRichAsPlain, value]);

  if (!value) return null;

  if (!isRich || renderRichAsPlain) {
    return <PlainQuestionContent value={renderRichAsPlain ? richPlainText : value} className={className} />;
  }

  return (
    <div
      className={cn(
        "max-w-full overflow-x-auto break-words overscroll-x-contain [overflow-wrap:anywhere] [&_*]:max-w-full [&_p]:my-0 [&_p+div]:mt-2 [&_div+div]:mt-2 [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_img]:align-middle [&_img]:rounded-sm [&_img]:object-contain [&_svg]:h-auto [&_svg]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
