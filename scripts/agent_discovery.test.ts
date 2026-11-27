import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { acceptLiveAuthServerMetadata, authServerMetadataUrl } from "../shared/mcpAuthServerMetadata";

const ISSUER = "https://fair-spirit-54.authkit.app";
const live = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth2/authorize`,
  token_endpoint: `${ISSUER}/oauth2/token`,
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
};

test("AI apps get the sign-in server's own live settings, as they are", () => {
  expect(authServerMetadataUrl(`${ISSUER}/`)).toBe(`${ISSUER}/.well-known/oauth-authorization-server`);
  const accepted = acceptLiveAuthServerMetadata(live, ISSUER);
  expect(accepted).toEqual(live);
  // The newer client registration WorkOS supports is passed on.
  expect(accepted?.client_id_metadata_document_supported).toBe(true);
});

test("anything that isn't the same issuer's complete settings falls back to Polynet's own copy", () => {
  expect(acceptLiveAuthServerMetadata({ ...live, issuer: "https://evil.example" }, ISSUER)).toBeNull();
  expect(acceptLiveAuthServerMetadata({ issuer: ISSUER }, ISSUER)).toBeNull();
  expect(acceptLiveAuthServerMetadata(null, ISSUER)).toBeNull();
  expect(acceptLiveAuthServerMetadata([live], ISSUER)).toBeNull();
  expect(acceptLiveAuthServerMetadata("nope", ISSUER)).toBeNull();
});

test("llms.txt tells AI tools what Polynet is and where to connect, without prices", () => {
  const text = readFileSync("apps/web/public/llms.txt", "utf8");
  expect(text.startsWith("# Polynet\n")).toBe(true);
  expect(text).toContain("https://www.polynet.ai/runtime/mcp");
  expect(text).toContain("https://www.polynet.ai/.well-known/oauth-protected-resource");
  expect(text).not.toMatch(/\$\d/);
});
