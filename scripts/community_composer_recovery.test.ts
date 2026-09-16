import { beforeEach, expect, test, vi } from "vitest";
import { useWebCommunityChatController } from "../apps/web/src/controllers/useWebCommunityChatController";
import { createCloudCommunityInteractionComposerMessageRows } from "../shared/cloudCommunityInteractionsGateway";
import { uploadCloudCommunityChatAttachmentFile } from "../shared/cloudCommunityChatGateway";

// Exercise the real asynchronous send callback, without pretending these hook
// stubs verify React rendering or browser reconciliation.
vi.mock("../apps/web/node_modules/react/index.js", () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: () => {},
}));
vi.mock("../shared/useCommunityChatLightbox", () => ({ useCommunityChatLightbox: () => ({}) }));
vi.mock("../shared/useMessageAttachmentInputController", () => ({ useMessageAttachmentInputController: () => ({}) }));
vi.mock("../shared/ensureUsableSession", () => ({ resolveUsableSession: async (session: unknown) => session }));
vi.mock("../shared/cloudCommunityInteractionsGateway", () => ({ createCloudCommunityInteractionComposerMessageRows: vi.fn() }));
vi.mock("../shared/cloudCommunityChatGateway", () => ({ uploadCloudCommunityChatAttachmentFile: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

function fixture() {
  const interaction = { error: null, insertOptimistic: vi.fn(), settleOptimistic: vi.fn() };
  const controller = useWebCommunityChatController({
    activeCommunityId: "community", activeChannelId: "channel", canonicalSessionUserId: "member",
    ensureSession: vi.fn(), session: {} as any, interaction,
    isProfileSetupResolved: true, isProfileSetupComplete: true,
    onMessageSent: vi.fn(), onOpenProfileSetup: vi.fn(), canMentionEverybodyRef: { current: false },
  });
  const draft = { text: "Hello @other", mentions: [{ kind: "user", userId: "other", token: "@other" }] as any,
    attachments: [{ id: "local", name: "note.txt", type: "file", size: 4, file: new File(["note"], "note.txt") }],
    clearDraft: vi.fn(), restoreDraft: vi.fn() };
  return { controller, interaction, draft };
}

test("upload failure restores the draft without creating a second pending recovery path", async () => {
  const { controller, interaction, draft } = fixture();
  vi.mocked(uploadCloudCommunityChatAttachmentFile).mockRejectedValue(new Error("upload failed"));
  await controller.handleSendCommunityMessage(draft);
  expect(draft.clearDraft).toHaveBeenCalledOnce();
  expect(draft.restoreDraft).toHaveBeenCalledOnce();
  expect(interaction.insertOptimistic).not.toHaveBeenCalled();
  expect(interaction.settleOptimistic).not.toHaveBeenCalled();
  expect(createCloudCommunityInteractionComposerMessageRows).not.toHaveBeenCalled();
});

test("a lost send response keeps the complete original pending attempt and does not restore a competing draft", async () => {
  const { controller, interaction, draft } = fixture();
  vi.mocked(uploadCloudCommunityChatAttachmentFile).mockResolvedValue({ attachmentId: "claim", name: "note.txt", type: "file", size: 4 } as any);
  vi.mocked(createCloudCommunityInteractionComposerMessageRows).mockRejectedValue(new Error("response lost"));
  await controller.handleSendCommunityMessage(draft);
  const pending = interaction.insertOptimistic.mock.calls[0][0];
  expect(pending).toMatchObject({ communityId: "community", channelId: "channel", text: "Hello @other",
    serializedAttachments: [{ attachmentId: "claim" }], serializedMentions: [{ userId: "other" }] });
  expect(createCloudCommunityInteractionComposerMessageRows).toHaveBeenCalledWith(expect.objectContaining({
    idempotencyKey: pending.idempotencyKey, text: pending.text,
    attachments: pending.serializedAttachments, mentions: pending.serializedMentions,
  }));
  expect(interaction.settleOptimistic).toHaveBeenCalledExactlyOnceWith({ idempotencyKey: pending.idempotencyKey, status: "failed" });
  expect(draft.restoreDraft).not.toHaveBeenCalled();
});
