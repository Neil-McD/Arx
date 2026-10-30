// A member's own choices, which only that member changes.
// Each operation runs the same public mutation the member's own screen runs,
// signed in as the caller, so it can only ever change the caller's own
// profile, notifications or Display pick. There is no owner path: an owner's
// agent calling these changes the owner's own choices, nobody else's.
import { api } from "./_generated/api";
import type { BuilderSettingOperation } from "./polynetBuilderSettings";

const own = (spec: Omit<BuilderSettingOperation, "area">): BuilderSettingOperation => ({ ...spec, area: "self" });

export const MEMBER_SELF_OPERATIONS: BuilderSettingOperation[] = [
  own({
    operation: "member.display.layout.set", name: "My layout in this community",
    calls: "communityLayouts:setMyCommunityLayoutChoice", ref: api.communityLayouts.setMyCommunityLayoutChoice, kind: "mutation",
    fields: { position: '"top" (Classroom), "side" (Channels), or null for the owner\'s choice; only where the owner lets members pick' },
    required: ["position"], omits: { userId: "always the signed-in member" }, effects: ["set_own_layout_choice"],
  }),
  own({
    operation: "member.display.theme.set", name: "My Light or Dark pick",
    calls: "profiles:setMyDisplayPreferences", ref: api.profiles.setMyDisplayPreferences, kind: "mutation",
    fields: { theme: '"light" or "dark"; follows me to every device and community that lets members choose',
      look_everywhere: "true: communities made only light or only dark show me their matching version in my pick" },
    required: [], community: false, effects: ["set_own_light_dark"],
  }),
  own({
    operation: "member.notifications.set", name: "Mute this community",
    calls: "communityAdmin:saveCommunityMemberSettings", ref: api.communityAdmin.saveCommunityMemberSettings, kind: "mutation",
    fields: { muted: "true mutes this community's notifications", muted_until_iso: "optional: ISO instant the mute ends, or null for until unmuted" },
    required: ["muted"], omits: { userId: "always the signed-in member" }, effects: ["set_own_notifications"],
  }),
  own({
    operation: "member.email_preferences.set", name: "My email preferences",
    calls: "emailPreferences:updateMyEmailPreferences", ref: api.emailPreferences.updateMyEmailPreferences, kind: "mutation",
    fields: { weekly_digest_enabled: "true or false", event_reminder_enabled: "true or false" },
    required: [], community: false, effects: ["set_own_email_preferences"],
  }),
  own({
    operation: "member.profile.save", name: "My profile",
    calls: "profiles:upsertProfileDetail", ref: api.profiles.upsertProfileDetail, kind: "mutation",
    fields: { display_name: "my name, or null", handle: "my @handle (lowercase letters, digits, dashes)", bio: "my bio, or null",
      avatar_storage_id: "photo from member.profile.upload_url (replace it; removing it sends you back to account setup)", avatar_url: "photo as an https image URL",
      avatar_focus_x: "0-100", avatar_focus_y: "0-100", avatar_zoom: "1-3",
      social_links: '{ "youtube": url|null, "x": url|null, "instagram": url|null }, or null' },
    required: [], community: false,
    omits: { userId: "always the signed-in member", markOnboardingDismissed: "account setup, done on screen", completeOnboarding: "account setup, done on screen",
      termsOfServiceVersion: "the member accepts the terms themselves", privacyPolicyVersion: "the member accepts the policy themselves" },
    effects: ["update_own_profile"],
  }),
  own({
    operation: "member.profile.upload_url", name: "Upload my photo",
    calls: "profiles:generateProfileAvatarUploadUrl", ref: api.profiles.generateProfileAvatarUploadUrl, kind: "mutation",
    fields: {}, required: [], community: false, effects: ["issue_upload_url"],
  }),
  own({
    operation: "member.profile.communities_shown.set", name: "Which communities my profile shows",
    calls: "profiles:setMyProfileCommunityVisibility", ref: api.profiles.setMyProfileCommunityVisibility, kind: "mutation",
    fields: { show_owned: "true shows communities I run", show_joined: "true shows communities I joined" },
    required: [], community: false, effects: ["set_own_profile_communities"],
  }),
  own({
    operation: "member.timezone.set", name: "My time zone",
    calls: "profiles:recordMemberTimezone", ref: api.profiles.recordMemberTimezone, kind: "mutation",
    fields: { timezone: "IANA time zone, e.g. Europe/London" }, required: ["timezone"], community: false, effects: ["set_own_timezone"],
  }),
];

export const memberSelfOperation = (operation: string) =>
  MEMBER_SELF_OPERATIONS.find(candidate => candidate.operation === operation);

// What polynet_call shows for one of them.
export function memberSelfInput(spec: BuilderSettingOperation) {
  return {
    required: spec.required,
    ...spec.fields,
    result: "what the member's own screen gets back after the same save",
    refusals: { invalid_tool_args: "a field that isn't listed, or a required one missing", setting_refused: "the save was refused; message says why" },
    effects: spec.effects,
    forbidden_effects: ["change_someone_else", "change_community_settings"],
  };
}
