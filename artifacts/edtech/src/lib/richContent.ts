function isSafeImageSource(src: string) {
  const normalized = src.trim().toLowerCase();
  return (
    normalized.startsWith("data:image/") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("/") ||
    normalized.startsWith("blob:")
  );
}

function normalizePlainText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function stripImageMarkers(value: string | null | undefined) {
  if (!value) return "";
  return normalizePlainText(
    value
      .replace(/\s*\[image\s*\d+\]\s*/gi, " ")
      .replace(/\s{2,}/g, " "),
  );
}

function sanitizeNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return;

  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const allowedTags = new Set(["p", "div", "span", "br", "img", "strong", "b", "em", "i", "u", "sup", "sub"]);

  if (!allowedTags.has(tagName)) {
    const fragment = element.ownerDocument.createDocumentFragment();
    while (element.firstChild) fragment.appendChild(element.firstChild);
    element.replaceWith(fragment);
    Array.from(fragment.childNodes).forEach(sanitizeNode);
    return;
  }

  Array.from(element.attributes).forEach((attribute) => {
    const attrName = attribute.name.toLowerCase();
    if (tagName === "img" && (attrName === "src" || attrName === "alt" || attrName === "title")) return;
    element.removeAttribute(attribute.name);
  });

  if (tagName === "img") {
    const src = element.getAttribute("src") ?? "";
    if (!isSafeImageSource(src)) {
      element.remove();
      return;
    }
  }

  Array.from(element.childNodes).forEach(sanitizeNode);

  if (
    (tagName === "p" || tagName === "div" || tagName === "span") &&
    !element.querySelector("img, br, sup, sub") &&
    !normalizePlainText(element.textContent || "")
  ) {
    element.remove();
  }
}

export function looksLikeRichHtmlContent(content: string | null | undefined) {
  if (!content?.trim()) return false;
  return /<img|<\/?(?:p|div|span|br|strong|b|em|i|u|sup|sub)\b/i.test(content);
}

export function sanitizeRichHtml(content: string | null | undefined) {
  if (!content?.trim() || typeof DOMParser === "undefined") return "";
  const documentParser = new DOMParser().parseFromString(`<div>${content}</div>`, "text/html");
  const root = documentParser.body.firstElementChild as HTMLElement | null;
  if (!root) return "";
  Array.from(root.childNodes).forEach(sanitizeNode);
  return root.innerHTML.trim();
}

export function stripRichHtmlToText(content: string | null | undefined) {
  if (!content?.trim()) return "";
  if (!looksLikeRichHtmlContent(content) || typeof DOMParser === "undefined") return stripImageMarkers(content);
  const documentParser = new DOMParser().parseFromString(`<div>${content}</div>`, "text/html");
  const collectText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return "";
    const element = node as Element;
    const tagName = element.tagName?.toLowerCase();
    if (tagName === "br") return "\n";
    const text = Array.from(node.childNodes).map(collectText).join("");
    return tagName === "p" || tagName === "div" ? `\n${text}\n` : text;
  };
  return stripImageMarkers(collectText(documentParser.body));
}
