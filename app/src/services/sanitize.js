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
    "iframe",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target", "title", "download"],
    img: ["src", "alt", "width", "height", "loading"],
    iframe: ["src", "width", "height", "title", "frameborder", "allow", "allowfullscreen", "loading"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  allowedIframeHostnames: ["www.youtube-nocookie.com"],
  allowIframeRelativeUrls: false,
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
    iframe: (tagName, attribs) => {
      // Only allow the privacy-friendly YouTube embed host.
      const src = attribs.src || "";
      if (!/^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(src)) {
        // sanitize-html drops disallowed iframes via allowedIframeHostnames
        // already, but be explicit: blank out src so it can't load anything.
        return { tagName, attribs: { src: "" } };
      }
      return {
        tagName,
        attribs: {
          src,
          width: attribs.width || "560",
          height: attribs.height || "315",
          title: attribs.title || "YouTube video",
          frameborder: "0",
          loading: "lazy",
          allow: "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "",
        },
      };
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
