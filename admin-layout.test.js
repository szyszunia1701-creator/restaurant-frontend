const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("style.css", "utf8");

assert.equal(
  (html.match(/id=["']admin-close["']/g) || []).length,
  1,
  "HTML must define exactly one #admin-close",
);
assert.equal(
  (js.match(/(?:appendChild|prepend|insertBefore)\s*\(\s*closeBtn\s*[,)]/g) || [])
    .length,
  0,
  "JavaScript must not reparent #admin-close after building the columns",
);

const closeRules = [...css.matchAll(/#admin-close\s*\{([^}]+)\}/g)];
assert.equal(closeRules.length, 1, "CSS must have one #admin-close rule");
assert.match(closeRules[0][1], /position:\s*absolute/);
assert.match(closeRules[0][1], /top:\s*var\(--admin-close-top\)/);
assert.match(closeRules[0][1], /right:\s*var\(--admin-close-right\)/);

assert.match(js, /className = "admin-list-static-header"/);
assert.match(js, /className = "admin-dynamic-list reservation-list"/);
assert.match(css, /\.admin-dynamic-list\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
assert.match(css, /#admin-panel\s*\{[^}]*height:\s*min\(760px, 88vh\);[^}]*overflow:\s*hidden;/s);

console.log("Admin layout static assertions passed.");
