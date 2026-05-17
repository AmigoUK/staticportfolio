import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "./sanitize.js";

test("removes <script> tags entirely", () => {
  const out = sanitize('<p>hi</p><script>alert("xss")</script><p>bye</p>');
  assert.equal(out, "<p>hi</p><p>bye</p>");
});

test("strips event handlers from allowed tags", () => {
  const out = sanitize('<p onclick="alert(1)">click me</p>');
  assert.equal(out, "<p>click me</p>");
});

test("preserves allowed inline + block tags", () => {
  const out = sanitize("<h2>Title</h2><p><strong>bold</strong> and <em>italic</em></p>");
  assert.equal(out, "<h2>Title</h2><p><strong>bold</strong> and <em>italic</em></p>");
});

test("forces rel + target on external links", () => {
  const out = sanitize('<a href="https://example.com">x</a>');
  assert.match(out, /rel="noopener noreferrer"/);
  assert.match(out, /target="_blank"/);
});

test("leaves internal links alone", () => {
  const out = sanitize('<a href="mailto:hi@example.com">mail</a>');
  assert.match(out, /href="mailto:hi@example.com"/);
  assert.doesNotMatch(out, /target="_blank"/);
});

test("strips disallowed URL schemes", () => {
  const out = sanitize('<a href="javascript:alert(1)">bad</a>');
  assert.doesNotMatch(out, /javascript:/i);
});

test("allows img with src/alt/width/height", () => {
  const out = sanitize('<img src="assets/img/x.jpg" alt="a thing" width="200" height="100" />');
  assert.match(out, /<img/);
  assert.match(out, /src="assets\/img\/x.jpg"/);
  assert.match(out, /alt="a thing"/);
});

test("strips style attributes from any tag", () => {
  const out = sanitize('<p style="color:red">hi</p>');
  assert.equal(out, "<p>hi</p>");
});

test("strips iframe, object, embed, form", () => {
  const out = sanitize('<iframe src="x"></iframe><form action="x"><input /></form>');
  assert.equal(out, "");
});

test("empty input returns empty string", () => {
  assert.equal(sanitize(""), "");
  assert.equal(sanitize(null), "");
  assert.equal(sanitize(undefined), "");
});
