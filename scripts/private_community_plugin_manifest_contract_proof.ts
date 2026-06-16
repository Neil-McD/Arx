import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  compilePrivateCommunityPluginManifest,
  PRIVATE_COMMUNITY_PLUGIN_SCHEMA,
} from "../shared/privateCommunityPluginManifest.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function validBase(patch: Record<string, unknown> = {}) {
  return {
    schema: PRIVATE_COMMUNITY_PLUGIN_SCHEMA,
    name: "Founder Ops Plugin",
    description: "Private community helper",
    ...patch,
  };
}

function rejectionCodes(manifest: unknown): string[] {
  return compilePrivateCommunityPluginManifest(manifest).rejections.map(
    (rejection) => rejection.code,
  );
}

function proveSkillOnlyPluginCompiles() {
  const plan = compilePrivateCommunityPluginManifest(
    validBase({
      skills: [
        {
          name: "Investor update drafter",
          slug: "investor-update-drafter",
          description: "Drafts weekly investor updates from community context.",
          mentionToken: "investor_update",
        },
      ],
    }),
  );

  assert.deepEqual(plan.rejections, []);
  assert.equal(plan.normalizedPlugin?.visibility, "private_community");
  assert.equal(plan.skillsToAttach.length, 1);
  assert.equal(plan.skillsToAttach[0]?.name, "Investor update drafter");
  assert.equal(plan.skillsToAttach[0]?.slug, "investor-update-drafter");
  assert.equal(plan.skillsToAttach[0]?.mentionToken, "investor_update");
  assert.deepEqual(plan.mcpAppsToStage, []);
}

function proveReviewedRegistryMcpCompiles() {
  const plan = compilePrivateCommunityPluginManifest(
    validBase({
      mcpServers: [
        {
          name: "Context7",
          mcpRegistryId: "context7",
          endpointUrl: "https://mcp.context7.com/mcp",
          authType: "none",
          enabledTools: ["resolve-library-id", "get-library-docs", "resolve-library-id"],
        },
      ],
    }),
  );

  assert.deepEqual(plan.rejections, []);
  assert.equal(plan.skillsToAttach.length, 0);
  assert.equal(plan.mcpAppsToStage.length, 1);
  const [context7] = plan.mcpAppsToStage;
  assert.equal(context7?.mcpRegistryId, "context7");
  assert.equal(context7?.endpointUrl, "https://mcp.context7.com/mcp");
  assert.equal(context7?.authType, "none");
  assert.equal(context7?.setupKind, "remote_ready");
  assert.deepEqual(context7?.enabledTools, [
    "resolve-library-id",
    "get-library-docs",
  ]);
}

function proveReviewedRegistryCanResolveByEndpointHost() {
  const plan = compilePrivateCommunityPluginManifest(
    validBase({
      mcpServers: [
        {
          name: "OpenAI Prod DB",
          endpointUrl: "https://mcp.context7.com/mcp",
          authType: "none",
        },
      ],
    }),
  );

  assert.deepEqual(plan.rejections, []);
  assert.equal(plan.mcpAppsToStage[0]?.mcpRegistryId, "context7");
  assert.equal(
    plan.mcpAppsToStage[0]?.name,
    "Context7",
    "compiled MCP setup plans must use canonical registry identity",
  );
}

function proveUnknownHostedMcpRejected() {
  assert.ok(
    rejectionCodes(
      validBase({
        mcpServers: [
          {
            name: "Unknown MCP",
            endpointUrl: "https://mcp.example.com/mcp",
            authType: "none",
          },
        ],
      }),
    ).includes("mcp_unknown_hosted_endpoint"),
  );
}

function proveStdioAndRuntimeMcpRejected() {
  assert.ok(
    rejectionCodes(
      validBase({
        mcpServers: [
          {
            name: "Local server",
            transport: "stdio",
          },
        ],
      }),
    ).includes("mcp_stdio_or_runtime_not_supported"),
  );
}

function proveLocalAndPrivateEndpointsRejected() {
  for (const endpointUrl of [
    "https://localhost/mcp",
    "https://127.0.0.1/mcp",
    "https://10.1.2.3/mcp",
    "https://172.16.0.5/mcp",
    "https://192.168.1.10/mcp",
    "https://service.internal/mcp",
  ]) {
    assert.ok(
      rejectionCodes(
        validBase({
          mcpServers: [
            {
              name: "Private endpoint",
              endpointUrl,
              authType: "none",
            },
          ],
        }),
      ).includes("mcp_endpoint_local_or_private"),
      `${endpointUrl} should be rejected as local/private`,
    );
  }
}

function proveSecretBearingManifestRejected() {
  const plan = compilePrivateCommunityPluginManifest(
    validBase({
      mcpServers: [
        {
          name: "Context7",
          mcpRegistryId: "context7",
          endpointUrl: "https://mcp.context7.com/mcp",
          authType: "none",
          apiKey: "not-allowed-in-manifest",
        },
      ],
    }),
  );

  assert.ok(
    plan.rejections.some((rejection) => rejection.code === "plugin_secret_not_allowed"),
  );
  assert.deepEqual(plan.skillsToAttach, []);
  assert.deepEqual(plan.mcpAppsToStage, []);
}

function proveSecretKeyVariantsRejectedWithoutRejectingMentionToken() {
  const safeSkillPlan = compilePrivateCommunityPluginManifest(
    validBase({
      skills: [
        {
          name: "Safe mention",
          mentionToken: "safe_mention",
        },
      ],
    }),
  );
  assert.deepEqual(safeSkillPlan.rejections, []);
  assert.equal(safeSkillPlan.skillsToAttach[0]?.mentionToken, "safe_mention");

  assert.ok(
    rejectionCodes(
      validBase({
        mcpServers: [
          {
            name: "Context7",
            mcpRegistryId: "context7",
            endpointUrl: "https://mcp.context7.com/mcp",
            authType: "none",
            accessToken: "not-allowed-in-manifest",
          },
        ],
      }),
    ).includes("plugin_secret_not_allowed"),
  );
  for (const [key, value] of [
    ["credential", "not-allowed-in-manifest"],
    ["credentials", { bearer: "not-allowed-in-manifest" }],
    ["sharedCredentials", { token: "not-allowed-in-manifest" }],
  ] as const) {
    const plan = compilePrivateCommunityPluginManifest(
      validBase({
        mcpServers: [
          {
            name: "Context7",
            mcpRegistryId: "context7",
            endpointUrl: "https://mcp.context7.com/mcp",
            authType: "none",
            [key]: value,
          },
        ],
      }),
    );
    assert.ok(
      plan.rejections.some(
        (rejection) =>
          rejection.code === "plugin_secret_not_allowed" &&
          rejection.path === `$.mcpServers[0].${key}`,
      ),
      `${key} should be rejected as a credential-bearing field`,
    );
    assert.deepEqual(plan.mcpAppsToStage, []);
  }
}

function proveRuntimeOnlyRegistryRejected() {
  assert.ok(
    rejectionCodes(
      validBase({
        mcpServers: [
          {
            name: "Fly",
            mcpRegistryId: "fly",
            authType: "bearer",
          },
        ],
      }),
    ).includes("mcp_needs_managed_runtime"),
  );
}

function provePublicMetadataRejected() {
  assert.ok(
    rejectionCodes(
      validBase({
        discover: {
          publish: true,
        },
        skills: [
          {
            name: "Public pitch writer",
          },
        ],
      }),
    ).includes("plugin_publication_not_supported"),
  );
  assert.ok(
    rejectionCodes(
      validBase({
        visibility: "public",
      }),
    ).includes("plugin_publication_not_supported"),
  );
  const nestedPlan = compilePrivateCommunityPluginManifest(
    validBase({
      metadata: {
        install: {
          discover: true,
        },
      },
      skills: [
        {
          name: "Public pitch writer",
        },
      ],
    }),
  );
  assert.ok(
    nestedPlan.rejections.some(
      (rejection) =>
        rejection.code === "plugin_publication_not_supported" &&
        rejection.path === "$.metadata.install",
    ),
  );
  assert.deepEqual(nestedPlan.skillsToAttach, []);
  const nestedVisibilityPlan = compilePrivateCommunityPluginManifest(
    validBase({
      metadata: {
        visibility: "marketplace",
      },
    }),
  );
  assert.ok(
    nestedVisibilityPlan.rejections.some(
      (rejection) =>
        rejection.code === "plugin_publication_not_supported" &&
        rejection.path === "$.metadata.visibility",
    ),
  );
}

function proveRuntimeInstructionsRejectedOutsideMcpEntries() {
  assert.ok(
    rejectionCodes(
      validBase({
        runtime: {
          command: "run-anything",
        },
      }),
    ).includes("plugin_runtime_instruction_not_supported"),
  );
}

function proveDeterministicOutput() {
  const manifest = validBase({
    skills: [
      {
        name: "Customer call summarizer",
      },
    ],
    mcpServers: [
      {
        name: "Context7",
        mcpRegistryId: "context7",
        endpointUrl: "https://mcp.context7.com/mcp",
        authType: "none",
      },
    ],
  });

  const first = compilePrivateCommunityPluginManifest(manifest);
  const second = compilePrivateCommunityPluginManifest(manifest);
  assert.deepEqual(first, second);
}

function proveContractAndPackageScriptExist() {
  const contract = readText("docs/private-community-plugin-manifest-contract-v1.md");
  assert.match(contract, /polynet\.plugin\.v0/);
  assert.match(contract, /not runtime authority/i);
  assert.match(contract, /unknown hosted MCP endpoints/i);
  assert.match(contract, /secret-bearing manifests/i);
  assert.match(contract, /canonical reviewed registry name/i);
  assert.match(contract, /rejected recursively/i);
  assert.match(contract, /does not add:[\s\S]*runtime MCP execution changes/i);

  const packageJson = readText("package.json");
  assert.match(
    packageJson,
    /"check:private-community-plugin-manifest-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/private_community_plugin_manifest_contract_proof\.ts"/,
  );
}

function main() {
  proveSkillOnlyPluginCompiles();
  proveReviewedRegistryMcpCompiles();
  proveReviewedRegistryCanResolveByEndpointHost();
  proveUnknownHostedMcpRejected();
  proveStdioAndRuntimeMcpRejected();
  proveLocalAndPrivateEndpointsRejected();
  proveSecretBearingManifestRejected();
  proveSecretKeyVariantsRejectedWithoutRejectingMentionToken();
  proveRuntimeOnlyRegistryRejected();
  provePublicMetadataRejected();
  proveRuntimeInstructionsRejectedOutsideMcpEntries();
  proveDeterministicOutput();
  proveContractAndPackageScriptExist();

  console.log("private_community_plugin_manifest_contract_proof: ok");
}

main();
