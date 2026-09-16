import { afterEach, expect, test, vi } from "vitest";
import { uploadCloudCommunityChatAttachmentFile } from "../shared/cloudCommunityChatGateway";

vi.mock("../shared/convexAuthenticatedClient", () => ({
  bootstrapConvexAuthenticatedClient: vi.fn(async () => ({})),
  requireConvexUrl: () => "https://fixture.convex.cloud",
}));
vi.mock("../shared/convexRuntime", () => ({ readConvexRuntimeUrl: () => "https://fixture.convex.site" }));
vi.mock("../shared/authSession", () => ({ resolveConvexRuntimeToken: () => "fixture-token" }));
afterEach(() => vi.restoreAllMocks());

test("the browser sends its channel, reply parent, and message key to the authenticated route and receives only a claim", async () => {
  const attachment = { attachmentId: "claim-one", name: "example.txt", type: "file", mime: "application/octet-stream", size: 4 };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ attachment }));
  const file = new File(["text"], "example.txt", { type: "text/plain" });
  expect(await uploadCloudCommunityChatAttachmentFile({ session: {}, communityId: "community-one", channelId: "room-one",
    rootId: "root-one", messageKey: "send-one", file })).toEqual(attachment);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://fixture.convex.site/runtime/community_attachment_upload", {
    method: "POST", body: file, headers: {
      Authorization: "Bearer fixture-token", "Content-Type": "text/plain", "X-Polynet-Community-Id": "community-one",
      "X-Polynet-Channel-Id": "room-one", "X-Polynet-Root-Id": "root-one", "X-Polynet-Message-Key": "send-one",
      "X-Polynet-File-Name": "example.txt",
    },
  });
});

test("a raw storage-ID response or failed upload is not accepted as a claim", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  const params = { session: {}, communityId: "community-one", messageKey: "send-one", file: new File(["text"], "file.txt") };
  fetchMock.mockResolvedValueOnce(Response.json({ storageId: "raw-handle" }));
  await expect(uploadCloudCommunityChatAttachmentFile(params)).rejects.toThrow("Failed to upload");
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(uploadCloudCommunityChatAttachmentFile(params)).rejects.toThrow("Failed to upload");
});
