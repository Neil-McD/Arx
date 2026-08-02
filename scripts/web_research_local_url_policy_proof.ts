import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { classifyWebResearchUrlAccess } from "../shared/webResearchUrlPolicy.ts";

const deniedUrls = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://0.0.0.0:3000",
  "http://10.0.0.7:3000",
  "http://100.64.0.1:3000",
  "http://172.16.0.7:3000",
  "http://192.168.1.10:3000",
  "http://198.18.0.1:3000",
  "http://169.254.1.10:3000",
  "http://[::1]:3000",
  "http://[fd00::1]:3000",
  "http://[fe80::1]:3000",
  "http://app.localhost:3000",
];

for (const url of deniedUrls) {
  const access = classifyWebResearchUrlAccess(url);
  assert.equal(access.ok, false, url);
  assert.equal(access.code, "web_research_local_url_not_supported", url);
  assert.match(
    access.message ?? "",
    /web_research only opens public web URLs/,
    url,
  );
}

const publicAccess = classifyWebResearchUrlAccess("https://example.com/docs");
assert.equal(publicAccess.ok, true);
assert.equal(publicAccess.normalizedUrl, "https://example.com/docs");

const webResearchToolsSource = readFileSync(
  new URL("../convex/webResearchTools.ts", import.meta.url),
  "utf8",
);
assert.match(webResearchToolsSource, /classifyWebResearchUrlAccess\(params\.url\)/);
assert.match(webResearchToolsSource, /const url = access\.normalizedUrl/);

const runtimeAgentLoopSource = readFileSync(
  new URL("../convex/runtimeAgentLoop.ts", import.meta.url),
  "utf8",
);
const classifyIndex = runtimeAgentLoopSource.indexOf("classifyWebResearchUrlAccess");
const executeIndex = runtimeAgentLoopSource.indexOf("executeWebResearch", classifyIndex);
assert.ok(classifyIndex > 0, "runtime loop should classify web_research URLs");
assert.ok(executeIndex > classifyIndex, "runtime loop should reject local web_research URLs before provider execution");
assert.doesNotMatch(runtimeAgentLoopSource, /reservePaidToolCredits|reserveCreditsInternal/);

console.log("web_research_local_url_policy_proof: ok");
