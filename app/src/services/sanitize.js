import sanitizeHtml from "sanitize-html";

export const SANITIZE_OPTIONS = {
  allowedTags: [
    "p", "br", "hr",
    "strong", "em", "b", "i", "u", "s", "sub", "sup",
    "a",
    "h2", "h3", "h4",
    "ul", "ol", "li",
    "blockquote",
    "code", "pre",
    "img",
    "figure", "figcaption",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target", "title"],
    img: ["src", "alt", "width", "height", "loading"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      // Force rel="noopener" + target="_blank" on external links
      const href = attribs.href || "";
      const isExternal = /^https?:\/\//.test(href);
      const out = { ...attribs };
      if (isExternal) {
        out.rel = "noopener noreferrer";
        out.target = "_blank";
      }
      return { tagName, attribs: out };
    },
  },
  exclusiveFilter: (frame) =>
    // Drop empty <p> and <li> that some browsers insert
    (frame.tag === "p" || frame.tag === "li") && !frame.text.trim() && (frame.media || []).length === 0,
};

export function sanitize(html) {
  if (!html) return "";
  return sanitizeHtml(String(html), SANITIZE_OPTIONS);
}

export function wrapBodyJson(html) {
  return JSON.stringify({ type: "html", html });
}
