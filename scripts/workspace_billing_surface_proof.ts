import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const workspaceCreditsSource = read("convex/workspaceCredits.ts");
const gatewaySource = read("shared/workspaceCreditsGateway.ts");
const billingSettingsSource = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const payAsYouGoPanelSource = read("apps/web/src/components/WorkspacePayAsYouGoPanel.tsx");
const workspacePanelSource = read("apps/web/src/components/WebWorkspaceUserDataPanel.tsx");

assert.match(
  packageJson,
  /"check:workspace-billing-surface-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_billing_surface_proof\.ts"/,
  "package script must expose the workspace billing surface proof",
);

assert.match(
  workspaceCreditsSource,
  /export const getWorkspaceBillingOverview = query/,
  "Convex must expose one canonical workspace billing overview query",
);
assert.match(
  workspaceCreditsSource,
  /workspaceComputeCharges/,
  "billing overview must include workspace compute charge evidence",
);
assert.match(
  workspaceCreditsSource,
  /workspaceUsageCollections/,
  "billing overview must include card collection evidence",
);
assert.match(
  workspaceCreditsSource,
  /workspace_credit_topup/,
  "billing overview must include manual prepaid top-up evidence",
);
assert.match(
  gatewaySource,
  /loadWorkspaceBillingOverviewCanonical/,
  "web gateway must load the canonical billing overview",
);

assert.match(
  billingSettingsSource,
  /WorkspacePayAsYouGoPanel/,
  "billing settings must render the canonical pay-as-you-go panel",
);

for (const requiredBillingLabel of [
  "Current month",
  "Credit balance",
  "Current usage",
  "Usage this month",
  "Paid this month",
  "Billing history",
  "Add to credit balance",
]) {
  assert.ok(
    payAsYouGoPanelSource.includes(requiredBillingLabel),
    `Billing settings must render ${requiredBillingLabel}`,
  );
}

for (const forbiddenWorkspaceCopy of [
  "Tool credits",
  "Pending workspace usage",
  "prior usage clears from the next top-up",
]) {
  assert.ok(
    !workspacePanelSource.includes(forbiddenWorkspaceCopy),
    `workspace panel must not render account usage copy: ${forbiddenWorkspaceCopy}`,
  );
}

assert.ok(
  !workspacePanelSource.includes("formatWorkspaceToolBalanceUsdFromCredits"),
  "workspace panel must not format or display billing amounts",
);
assert.ok(
  workspacePanelSource.includes("<dt>Billing</dt>"),
  "workspace panel may keep a simple Billing navigation row",
);

console.log("workspace_billing_surface_proof: ok");
