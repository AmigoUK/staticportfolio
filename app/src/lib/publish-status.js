// Derives the storage columns ({ published, published_at }) from the unified
// `status` field on admin edit forms — and vice versa, for templates that need
// to render a current status label or option-selected state.
//
// Storage convention (kept binary-compatible with rows that pre-date the
// scheduling feature):
//   draft     → published=0, published_at=null
//   published → published=1, published_at=null (or a past timestamp)
//   scheduled → published=1, published_at=<future ISO-8601 UTC>

const SCHEDULE_BAD = (msg) => {
  const e = new Error(msg);
  e.code = "BAD_SCHEDULE";
  return e;
};

export function derivePublishFields({ status, published_at }) {
  const raw = String(status || "").toLowerCase();
  if (raw === "draft") return { published: 0, published_at: null };
  if (raw === "scheduled") {
    const when = parseToIsoUtcOrNull(published_at);
    if (!when) throw SCHEDULE_BAD("A future publish date is required when scheduling.");
    if (Date.parse(when) <= Date.now()) throw SCHEDULE_BAD("Scheduled date must be in the future.");
    return { published: 1, published_at: when };
  }
  // "published" (or unspecified — legacy compatibility): keep any user-supplied
  // date for sortable "this was published on X" semantics on posts/work; never
  // require it. Past or future-but-mis-tagged values are still rendered live by
  // publish.js's filter.
  return { published: 1, published_at: parseToIsoUtcOrNull(published_at) };
}

export function statusFromRow(row) {
  if (!row || !row.published) return "draft";
  if (row.published_at && Date.parse(row.published_at) > Date.now()) return "scheduled";
  return "published";
}

// datetime-local inputs have no timezone marker; the server assumes its own
// local time and converts to UTC for storage. Already-ISO strings round-trip.
function parseToIsoUtcOrNull(value) {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Format a stored UTC ISO string for an <input type="datetime-local"> value.
// Returns the server's local-time representation in YYYY-MM-DDTHH:MM. The
// browser shows this verbatim — and re-submits it in the same local-time
// format, which parseToIsoUtcOrNull then converts back to UTC.
export function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
