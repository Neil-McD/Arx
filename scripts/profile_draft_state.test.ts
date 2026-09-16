import { describe, expect, it } from "vitest";
import {
  createProfileDraft,
  editProfileDraft,
  hydrateProfileDraft,
  equalProfileFields,
  profileFields,
} from "../shared/profileDraftState";
const fresh = () => createProfileDraft("a", { name: "", handle: "", bio: "" });
describe("account-scoped profile draft", () => {
  it("allows untouched fields to hydrate but preserves intentional empty fields", () => {
    let draft = hydrateProfileDraft(fresh(), {
      display_name: "Ada",
      bio: "old",
    });
    draft = editProfileDraft(draft, "bio", "");
    draft = hydrateProfileDraft(draft, {
      display_name: "Ada Lovelace",
      bio: "remote",
    });
    expect(draft.values.name).toBe("Ada Lovelace");
    expect(draft.values.bio).toBe("");
  });
  it("acknowledges a save without clearing a newer edit and resumes hydration for clean fields", () => {
    const submitted = editProfileDraft(fresh(), "bio", "sent");
    const edited = editProfileDraft(submitted, "name", "new name");
    const saved = hydrateProfileDraft(
      edited,
      { display_name: "old name", bio: "sent" },
      submitted,
    );
    expect(saved.values.name).toBe("new name");
    expect(saved.touched.bio).toBeUndefined();
    expect(
      hydrateProfileDraft(saved, { bio: "another device" }).values.bio,
    ).toBe("another device");
  });
  it("rejects acknowledgments from another account", () => {
    const other = createProfileDraft("b", { name: "", handle: "", bio: "" });
    expect(hydrateProfileDraft(other, { bio: "private" }, fresh())).toBe(other);
  });
  it("photo removal survives hydration and saved null is canonical", () => {
    const draft = editProfileDraft(
      hydrateProfileDraft(fresh(), { avatar_url: "photo" }),
      "avatarUrl",
      null,
    );
    expect(
      hydrateProfileDraft(draft, { avatar_url: "old-photo" }).values.avatarUrl,
    ).toBeNull();
    expect(
      hydrateProfileDraft(draft, { avatar_url: null }, draft).values.avatarUrl,
    ).toBeNull();
  });
  it("normalization does not manufacture unsaved changes", () => {
    expect(
      equalProfileFields(
        profileFields({ display_name: " Ada " }),
        profileFields({ display_name: "Ada" }),
      ),
    ).toBe(true);
  });
  it("persisted cleared drafts stay touched while saved text may rehydrate", () => {
    const draft = createProfileDraft("a", {
      name: "Old name",
      handle: "",
      bio: "",
      touched: { name: false, bio: true },
    });
    const hydrated = hydrateProfileDraft(draft, {
      display_name: "Current name",
      bio: "Server bio",
    });
    expect(hydrated.values.name).toBe("Current name");
    expect(hydrated.values.bio).toBe("");
  });
});
