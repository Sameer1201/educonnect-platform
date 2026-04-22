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
    return <div className={cn("whitespace-pre-wrap break-words [overflow-wrap:anywhere]", className)}>{value}</div>;
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
