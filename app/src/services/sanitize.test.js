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

test("strips object, embed, form entirely", () => {
  const out = sanitize('<object data="x"></object><embed src="x" /><form action="x"><input /></form>');
  assert.equal(out, "");
});

test("blanks iframe src when host is not on the whitelist", () => {
  const out = sanitize('<iframe src="https://evil.example/x" width="560" height="315"></iframe>');
  assert.ok(!out.includes("evil.example"), "evil host must be stripped");
});

test("preserves youtube-nocookie iframe with normalised attributes", () => {
  const out = sanitize('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>');
  assert.match(out, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(out, /allowfullscreen/);
  assert.match(out, /loading="lazy"/);
});

test("preserves download attribute on links to assets/files/", () => {
  const out = sanitize('<a href="assets/files/cv.pdf" download="cv.pdf">Download CV</a>');
  assert.match(out, /download="cv\.pdf"/);
  assert.match(out, /href="assets\/files\/cv\.pdf"/);
});

test("empty input returns empty string", () => {
  assert.equal(sanitize(""), "");
  assert.equal(sanitize(null), "");
  assert.equal(sanitize(undefined), "");
});
