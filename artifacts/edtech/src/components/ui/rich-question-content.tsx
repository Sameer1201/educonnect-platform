import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { looksLikeRichHtmlContent, sanitizeRichHtml, stripImageMarkers } from "@/lib/richContent";

interface RichQuestionContentProps {
  content?: string | null;
  className?: string;
}

export function RichQuestionContent({ content, className }: RichQuestionContentProps) {
  const value = stripImageMarkers(content?.trim() ?? "");
  const isRich = looksLikeRichHtmlContent(value);
  const sanitized = useMemo(() => (isRich ? sanitizeRichHtml(value) : ""), [isRich, value]);

  if (!value) return null;

  if (!isRich) {
    return <div className={cn("whitespace-pre-wrap break-words", className)}>{value}</div>;
  }

  return (
    <div
      className={cn(
        "break-words [&_p]:my-0 [&_p+div]:mt-2 [&_div+div]:mt-2 [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_img]:align-middle [&_img]:rounded-sm [&_img]:object-contain",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
