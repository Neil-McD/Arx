// Every setting an owner can change in Polynet's Settings can also be changed
// by the owner's own agent. Each operation below is a
// polynet_call capability for the external MCP, and it runs the same public
// mutation the Settings page runs, as the signed-in owner. Validation, revisions,
// audit and side effects therefore stay in one place, the page's own backend.
//
// The agent reads the current values from /builder/settings.json, then calls
// with snake_case names for the mutation's fields (expected_revision ->
// expectedRevision). communityId always comes from the mounted community, and
// identity always comes from the sign-in, never from input.
//
// SETTINGS_UI_WRITES is the parity list that scripts/settings_agent_parity.test.ts
// holds the web app to: every write the app makes is either an operation here or
// has a stated reason not to be one.
import { api, internal } from "./_generated/api";
import { COMMUNITY_THEME_PALETTES } from "../shared/communityThemePalettes";
import { buildAgentLedJourneyPlan } from "../shared/agentLedJourneyTemplate";

export type BuilderSettingOperation = {
  operation: string;
  // Which Settings page it belongs to.
  area: "general" | "pricing" | "welcome" | "workflows" | "forms" | "access" | "agent" | "channels" | "members" | "appearance" | "knowledge"
    | "events" | "testing" | "posts" | "self";
  name: string;
  // The public function the Settings page calls ("module:function").
  calls: string;
  ref: any;
  kind: "mutation" | "action";
  // snake_case input -> what it is. Anything else is refused.
  fields: Record<string, string>;
  required: string[];
  // Filled from the current settings when the agent leaves them out.
  merge?: "community_settings";
  // "auth" (default) signs in as the caller, like the page. "user" is for an
  // internal twin that takes the resolved userId (so the history can say "agent").
  identity?: "auth" | "user";
  // Fixed arguments added to every call.
  extra?: Record<string, unknown>;
  // Arguments the app's function takes that the agent deliberately doesn't
  // send, and why. The parity test holds every other argument to a field.
  omits?: Record<string, string>;
  // false when the function isn't scoped to one community.
  community?: false;
  // "owner_apply": hard to undo, so the agent only proposes it. It runs when
  // the owner taps Apply in the app (convex/communitySettingProposals.ts).
  review?: "owner_apply";
  effects: string[];
};

const op = (spec: BuilderSettingOperation) => spec;
const CHANGED_BY = 'optional: your name as the owner should see it in Workflows › Recent changes, for example "Claude Code" or "Codex"';

export const BUILDER_SETTING_OPERATIONS: BuilderSettingOperation[] = [
  op({
    operation: "community.settings.save", area: "general", name: "Identity and public profile",
    calls: "communityLifecycle:saveCommunitySettings", ref: api.communityLifecycle.saveCommunitySettings, kind: "mutation",
    fields: {
      expected_settings_revision: "settings_revision from /builder/settings.json; refused if someone saved since",
      name: "community name", slug: "web address (lowercase letters, digits, dashes)",
      one_liner: "one line under the name, or null", about: "the About text (Markdown), or null",
      avatar_storage_id: "logo from community.settings.upload_url, or null to remove", avatar_url: "logo as an https image URL",
      avatar_focus_x: "0-100", avatar_focus_y: "0-100", avatar_zoom: "1-3",
      banner_storage_id: "banner from community.settings.upload_url, or null to remove", banner_url: "banner as an https image URL",
      banner_focus_x: "0-100", banner_focus_y: "0-100", banner_zoom: "1-3",
      visibility: "published (listed in Discover) or unlisted",
    },
    required: ["expected_settings_revision"], merge: "community_settings",
    omits: { monthlyAmountBaseUnits: "prices go through community.pricing.set, which needs the owner's Apply",
      annualAmountBaseUnits: "prices go through community.pricing.set", currency: "set with the price, by the owner", currencyDecimals: "set with the price, by the owner" },
    effects: ["update_community_identity"],
  }),
  op({
    operation: "community.settings.upload_url", area: "general", name: "Upload a logo or banner",
    calls: "communityLifecycle:generateCommunityBrandingUploadUrl", ref: api.communityLifecycle.generateCommunityBrandingUploadUrl, kind: "mutation",
    fields: { kind: "avatar (the logo) or banner" }, required: ["kind"], community: false,
    effects: ["issue_upload_url"],
  }),
  op({
    operation: "community.about.save", area: "general", name: "About text",
    calls: "communityLifecycle:saveCommunityAbout", ref: api.communityLifecycle.saveCommunityAbout, kind: "mutation",
    fields: { about: "the About text (Markdown), or null" }, required: ["about"], effects: ["update_about"],
  }),
  op({
    operation: "community.welcome.save", area: "welcome", name: "Welcome page",
    calls: "communityMemberWorkflows:saveBuilderWelcomePage", ref: api.communityMemberWorkflows.saveBuilderWelcomePage, kind: "mutation",
    fields: { expected_revision: "workflow revision from /builder/settings.json", title: "heading", message: "welcome text (Markdown)",
      media_url: "video or image URL, or empty", lesson_ids: "lesson resource ids new members start with",
      layout: 'optional: the page as blocks, in order: {"type":"text","markdown":"…"} (a link alone on a line plays as a video), {"type":"form","formKey":"…"}, {"type":"lesson","resourceId":"…"}, {"type":"choice","prompt":"…","options":[{"label":"…","hint":"…","markdown":"…","icon":"optional logo: https image link or data:image/… (≤8,000 chars), shown in its own colours"}]} (cards to pick from; each shows its own steps; add "agent":true to show the community agent above the cards as the plugin that connects to the picked app; the first is the default; a screen with a choice gets "Skip for now", and a skipped one comes back as a "Finish setting up" reminder), {"type":"next"} to start a new screen. With it, message, media_url and lesson_ids are ignored, and its forms become the forms new members answer on joining' },
    required: ["expected_revision", "title", "message", "media_url", "lesson_ids"], effects: ["update_welcome_page"],
  }),
  op({
    operation: "community.welcome.gate.set", area: "welcome", name: "Welcome page first",
    calls: "communityMemberWorkflows:setBuilderWelcomeGate", ref: api.communityMemberWorkflows.setBuilderWelcomeGate, kind: "mutation",
    fields: { expected_revision: "workflow revision", enabled: "true: new members see the welcome page before anything else" },
    required: ["expected_revision", "enabled"], effects: ["set_welcome_gate"],
  }),
  op({
    operation: "community.welcome.display.set", area: "welcome", name: "Welcome page as full page or pop-up",
    calls: "communityMemberWorkflows:setBuilderWelcomeDisplay", ref: api.communityMemberWorkflows.setBuilderWelcomeDisplay, kind: "mutation",
    fields: { expected_revision: "workflow revision", display: '"page": new members see only the welcome until it is done; "popup": it opens over the community, which they can use behind it and finish later' },
    required: ["expected_revision", "display"], effects: ["set_welcome_display"],
  }),
  op({
    operation: "community.workflow.stage.create", area: "workflows", name: "Add a workflow stage",
    calls: "communityMemberWorkflows:createBuilderWorkflowMilestone", ref: api.communityMemberWorkflows.createBuilderWorkflowMilestone, kind: "mutation",
    fields: { expected_revision: "workflow revision", name: "stage name", goal: "what finishing it means", instructions: "notes for the agent",
      require_human_approval: "true: you approve each member moving on", color: "stage colour: grey, green, teal, blue, purple, pink, red, orange or yellow" },
    required: ["expected_revision", "name"], effects: ["add_workflow_stage"],
  }),
  op({
    operation: "community.workflow.stage.update", area: "workflows", name: "Change a workflow stage",
    calls: "communityMemberWorkflows:updateBuilderWorkflowMilestone", ref: api.communityMemberWorkflows.updateBuilderWorkflowMilestone, kind: "mutation",
    fields: { expected_revision: "workflow revision", milestone_key: "the stage's key", name: "stage name", goal: "what finishing it means",
      instructions: "notes for the agent", require_human_approval: "true or false",
      color: "stage colour: grey, green, teal, blue, purple, pink, red, orange, yellow, or none to clear (left out keeps it)",
      changed_by: CHANGED_BY,
      automations: "the stage's full list of automations, as /builder/settings.json shows them, including its pausedAutomations sent with paused: true (paused: true switches a rule off, and the steps after it go off too; left out, a rule is deleted); a client_property_changed trigger { propertyKey, value? } runs when that client property on their record changes (to value, if given) by the owner, the member, a form or an agent, never from a Workflow step's own write, and never holds the stage; a property_date trigger { propertyKey, offsetDays } on a date property runs at 09:00 UTC offsetDays from that date (negative = before, 0 = on the day, up to 365), once per date, for members in the stage then, never for dates already gone, and never holds the stage; a milestone_elapsed trigger { delayMinutes } runs that long after they reach the stage, and delayMinutes: 0 runs the moment they reach it (shown as Reaches this stage); one with nudge: true (and a real wait) is an agent check-in that runs only if they're still in the stage and never holds it; a prompt_agent action's sees lists what the agent reads: all_member_data (facts, progress, guide channel, every form and every client property, so new ones are included), facts, progress, guide_channel, form:<key>, property:<key>, lesson:<id> (absent = facts + the triggering form); a set_pod_member action { channelId, active } adds the member to a pod (a restricted channel from /builder/pods.json) when active is true and takes them out when false; a pod_member_added trigger { channelId? } runs when the owner, an admin, an agent or an offer adds them to that pod (absent = any pod), never from a Workflow step's own add, and never holds the stage; a send_email action has subject and body (plain text, blank line = new paragraph; {first_name}, {name}, {community} fill in), goes from Polynet with an unsubscribe link, skips members who unsubscribed, and sends a test member's copy to the admin running the test; an optional condition (Only if) is { propertyKey, op: is|is_not|is_set|is_empty, value? } on a client property, plus also: up to 3 more clauses joined by match: all (and) or any (or); a step whose condition fails is skipped with every step after it, and a sibling step after the same step with the same condition and otherwise: true runs exactly for the members it leaves out" },
    required: ["expected_revision", "milestone_key", "name", "automations"], extra: { via: "agent" }, effects: ["update_workflow_stage"],
  }),
  op({
    operation: "community.workflow.change.undo", area: "workflows", name: "Undo a workflow stage change",
    calls: "communityWorkflowChanges:undoBuilderWorkflowChange", ref: api.communityWorkflowChanges.undoBuilderWorkflowChange, kind: "mutation",
    fields: { change_id: "a change_id from workflow_changes in /builder/settings.json; refused with workflow_change_newer_edits once the stage changed again (undo the newer change first)",
      changed_by: CHANGED_BY },
    required: ["change_id"], extra: { via: "agent" }, effects: ["undo_workflow_stage_change"],
  }),
  op({
    operation: "community.form.save", area: "forms", name: "Create or edit a form",
    calls: "communityForms:saveBuilderForm", ref: api.communityForms.saveBuilderForm, kind: "mutation",
    fields: { key: "the form's key (a new key makes a new form)", expected_revision: "the form's revision, 0 for a new one",
      name: "form name", questions: "the full list of questions, as /builder/settings.json shows them" },
    required: ["key", "expected_revision", "name", "questions"], effects: ["save_form_draft"],
  }),
  op({
    operation: "community.form.publish", area: "forms", name: "Publish a form",
    calls: "communityForms:publishBuilderForm", ref: api.communityForms.publishBuilderForm, kind: "mutation",
    fields: { key: "the form's key", expected_revision: "the revision you checked" },
    required: ["key", "expected_revision"], effects: ["publish_form_version"],
  }),
  op({
    operation: "community.form.reorder", area: "forms", name: "Reorder forms",
    calls: "communityForms:reorderBuilderForms", ref: api.communityForms.reorderBuilderForms, kind: "mutation",
    fields: { keys: "form keys in the new order; forms left out keep their place after them" },
    required: ["keys"], effects: ["reorder_forms"],
  }),
  op({
    operation: "community.form.delete", area: "forms", name: "Delete a form that isn't used",
    calls: "communityForms:deleteBuilderForm", ref: api.communityForms.deleteBuilderForm, kind: "mutation",
    fields: { key: "the form's key; refused with form_in_use while usedIn (in /builder/settings.json) lists an automation or the Welcome page" },
    required: ["key"], effects: ["delete_form"],
  }),
  op({
    operation: "community.form.restore", area: "forms", name: "Restore a deleted form",
    calls: "communityForms:restoreBuilderForm", ref: api.communityForms.restoreBuilderForm, kind: "mutation",
    fields: { key: "the deleted form's key" },
    required: ["key"], effects: ["restore_form"],
  }),
  op({
    operation: "community.access.grant", area: "access", name: "Give access, or change a grant's end date",
    calls: "communityAccess:grantCommunityAccess", ref: internal.communityAccess.grantCommunityAccessInternal, kind: "mutation",
    identity: "user", extra: { via: "agent" },
    fields: { membership_id: "an existing member, or", email: "someone to invite by email", reason: "why (shown in the history)",
      ends_at: "ISO date or instant, or null for no end date",
      offer_key: "optional: the offer they get, from /builder/offers.json (left out: the base membership)" },
    required: ["reason"], effects: ["grant_owner_access"],
  }),
  op({
    operation: "community.access.integration.update", area: "access", name: "Change a connected service",
    calls: "communityAccess:updateAccessIntegration", ref: api.communityAccess.updateAccessIntegration, kind: "mutation",
    fields: { integration_id: "from /builder/settings.json", name: "name", webhook_url: "https webhook", price_point_ids: "which plans count",
      include_owner_grants: "true: access you give by hand counts too" },
    required: ["integration_id"], effects: ["update_access_integration"],
  }),
  op({
    operation: "community.access.integration.test", area: "access", name: "Send a test event",
    calls: "communityAccess:sendAccessIntegrationTest", ref: api.communityAccess.sendAccessIntegrationTest, kind: "mutation",
    fields: { integration_id: "from /builder/settings.json" }, required: ["integration_id"], effects: ["send_test_webhook"],
  }),
  op({
    operation: "community.access.integration.retry", area: "access", name: "Retry a failed event",
    calls: "communityAccess:retryAccessIntegrationEvent", ref: api.communityAccess.retryAccessIntegrationEvent, kind: "mutation",
    fields: { integration_id: "from /builder/settings.json", event_id: "a failed event's id" },
    required: ["integration_id", "event_id"], effects: ["retry_webhook"],
  }),
  op({
    operation: "community.agent.save", area: "agent", name: "Community agent",
    calls: "communityAgent:saveCommunityAgentConfig", ref: api.communityAgent.saveCommunityAgentConfig, kind: "mutation",
    fields: { community_system_prompt: "how the community's agent behaves", landing_json: "the agent page's opening, as /builder/settings.json shows it" },
    omits: { systemPrompt: "older name for community_system_prompt" },
    required: [], effects: ["update_community_agent"],
  }),
  op({
    operation: "community.agent.profile.save", area: "agent", name: "Agent's name and photo",
    calls: "communityAgent:saveCommunityAgentProfile", ref: api.communityAgent.saveCommunityAgentProfile, kind: "mutation",
    fields: { display_name: "the agent's name (up to 60 characters), or null for the community's name",
      avatar_storage_id: "photo from community.settings.upload_url (kind avatar), or null for the community's icon",
      avatar_url: "photo as an https image URL, or null for the community's icon" },
    required: [], effects: ["update_community_agent_profile"],
  }),
  op({
    operation: "community.channel.create", area: "channels", name: "Add a channel",
    calls: "communityChannels:createCommunityChannel", ref: api.communityChannels.createCommunityChannel, kind: "mutation",
    fields: { name: "channel name", access_mode: "who can see it, as /builder/settings.json lists the modes" },
    required: ["name"], effects: ["create_channel"],
  }),
  op({
    operation: "community.channel.rename", area: "channels", name: "Rename a channel",
    calls: "communityChannels:renameCommunityChannel", ref: api.communityChannels.renameCommunityChannel, kind: "mutation",
    fields: { channel_id: "from /builder/settings.json", name: "new name" }, required: ["channel_id", "name"], effects: ["rename_channel"],
  }),
  op({
    operation: "community.channel.move", area: "channels", name: "Move a channel",
    calls: "communityChannels:moveCommunityChannel", ref: api.communityChannels.moveCommunityChannel, kind: "mutation",
    fields: { channel_id: "the channel", after_channel_id: "put it after this one, or null", before_channel_id: "before this one, or null",
      expected_position: "its position now" },
    required: ["channel_id", "after_channel_id", "before_channel_id", "expected_position"], effects: ["reorder_channels"],
  }),
  op({
    operation: "community.channel.pin", area: "channels", name: "Pin a post in a channel",
    calls: "communityChannels:setCommunityChannelPinnedRoot", ref: api.communityChannels.setCommunityChannelPinnedRoot, kind: "mutation",
    fields: { channel_id: "the channel", root_id: "the post to pin, or null to unpin" }, required: ["root_id"], effects: ["pin_post"],
  }),
  op({
    operation: "community.channel.participant.set", area: "channels", name: "Who's in a private channel",
    calls: "communityChannelParticipants:setParticipant", ref: api.communityChannelParticipants.setParticipant, kind: "mutation",
    fields: { channel_id: "the channel", target: '{ "kind": "member", "userId": "<id>" } or { "kind": "community_agent" }', active: "true adds, false removes" },
    required: ["channel_id", "target", "active"], effects: ["set_channel_participant"],
  }),
];

// Saved themes and colour palettes (Settings → Appearance → Customize). Each
// apply goes to the theme draft; community.theme.publish makes it live.
BUILDER_SETTING_OPERATIONS.push(
  op({
    operation: "community.theme.saved.save", area: "appearance", name: "Save a look as a named theme",
    calls: "communitySavedThemes:saveCommunitySavedTheme", ref: api.communitySavedThemes.saveCommunitySavedTheme, kind: "mutation",
    fields: { name: "the theme's name (unique in this community, up to 60 characters)",
      theme: "a community theme v1 record, for example the draft from /builder/theme.json" },
    required: ["name", "theme"], effects: ["save_named_theme"],
    omits: { savedThemeId: "replacing a saved theme's look is community.theme.saved.replace" },
  }),
  op({
    operation: "community.theme.saved.rename", area: "appearance", name: "Rename a saved theme",
    calls: "communitySavedThemes:renameCommunitySavedTheme", ref: api.communitySavedThemes.renameCommunitySavedTheme, kind: "mutation",
    fields: { saved_theme_id: "savedThemeId from saved_themes in /builder/settings.json", name: "the new name" },
    required: ["saved_theme_id", "name"], effects: ["rename_named_theme"],
  }),
  op({
    operation: "community.theme.saved.apply", area: "appearance", name: "Make a saved theme the draft",
    calls: "communitySavedThemes:applyCommunitySavedThemeToDraft", ref: api.communitySavedThemes.applyCommunitySavedThemeToDraft, kind: "mutation",
    fields: { saved_theme_id: "savedThemeId from saved_themes", expected_draft_revision: "draftRevision from /builder/theme.json" },
    required: ["saved_theme_id", "expected_draft_revision"], effects: ["replace_theme_draft"],
  }),
  op({
    operation: "community.theme.palette.apply", area: "appearance", name: "Use a ready-made colour palette",
    calls: "communitySavedThemes:applyCommunityThemePaletteToDraft", ref: api.communitySavedThemes.applyCommunityThemePaletteToDraft, kind: "mutation",
    fields: { palette_id: "an id from theme_palettes in /builder/settings.json",
      scheme: "optional: light or dark to fix the look to one; left out, the draft keeps the schemes it has",
      expected_draft_revision: "draftRevision from /builder/theme.json" },
    required: ["palette_id", "expected_draft_revision"], effects: ["set_theme_draft_colours"],
  }),
);

// Hard-to-undo changes.
const proposal = (spec: Omit<BuilderSettingOperation, "review">) => op({ ...spec, review: "owner_apply" });
const stageUpdate = BUILDER_SETTING_OPERATIONS.find(spec => spec.operation === "community.workflow.stage.update")!;
BUILDER_SETTING_OPERATIONS.push(
  proposal({
    operation: "community.workflow.agent_review.set", area: "workflows", name: "Choose whether agents' workflow changes wait for you",
    calls: "communityWorkflowChanges:setBuilderWorkflowAgentChangeReview", ref: api.communityWorkflowChanges.setBuilderWorkflowAgentChangeReview, kind: "mutation",
    fields: { review: '"apply": community.workflow.stage.update goes live at once; "ask_others": it waits for the owner when another admin\'s agent sends it; "ask": it always waits (staged like community.workflow.stage.propose)' },
    required: ["review"], effects: ["set_workflow_agent_review"],
  }),
  // Always waits for the owner, whatever the Workflows permission says.
  proposal({
    operation: "community.workflow.stage.propose", area: "workflows", name: "Suggest a change to a workflow stage",
    calls: stageUpdate.calls, ref: stageUpdate.ref, kind: "mutation",
    fields: stageUpdate.fields, required: stageUpdate.required, extra: stageUpdate.extra, effects: ["propose_workflow_stage_change"],
  }),
  proposal({
    operation: "community.pricing.set", area: "pricing", name: "Change the price",
    calls: "communityLifecycle:saveCommunitySettings", ref: api.communityLifecycle.saveCommunitySettings, kind: "mutation",
    fields: { expected_settings_revision: "settings_revision from /builder/settings.json",
      monthly_amount_base_units: "monthly price in cents, or null for none", annual_amount_base_units: "yearly price in cents, or null for none" },
    required: ["expected_settings_revision"], merge: "community_settings", effects: ["change_price"],
    omits: { ...Object.fromEntries(["name", "slug", "oneLiner", "about", "avatarStorageId", "avatarUrl", "avatarFocusX", "avatarFocusY", "avatarZoom",
      "bannerStorageId", "bannerUrl", "bannerFocusX", "bannerFocusY", "bannerZoom", "visibility"].map(key => [key, "community.settings.save changes the profile"])),
      currency: "Polynet keeps the community's currency", currencyDecimals: "Polynet keeps the community's currency" },
  }),
  proposal({
    operation: "community.free_access.set", area: "pricing", name: "Who can join for free",
    calls: "communityAdmin:setCommunityFreeAccessMode", ref: api.communityAdmin.setCommunityFreeAccessMode, kind: "mutation",
    fields: { mode: "open (anyone joins) or approval (you approve each request)" }, required: ["mode"], effects: ["change_free_access"],
  }),
  proposal({
    operation: "community.archive", area: "general", name: "Archive the community",
    calls: "communityColdArchive:archiveCommunity", ref: api.communityColdArchive.archiveCommunity, kind: "mutation",
    fields: {}, required: [], effects: ["archive_community"],
  }),
  proposal({
    operation: "community.restore", area: "general", name: "Restore the archived community",
    calls: "communityColdArchive:restoreCommunityWithoutPayment", ref: api.communityColdArchive.restoreCommunityWithoutPayment, kind: "mutation",
    fields: { lifecycle_generation: "the archive's lifecycle generation" }, required: ["lifecycle_generation"], effects: ["restore_community"],
  }),
  proposal({
    operation: "community.access.end", area: "access", name: "End access you gave",
    calls: "communityAccess:endCommunityAccess", ref: api.communityAccess.endCommunityAccess, kind: "mutation",
    fields: { membership_id: "the member" }, required: ["membership_id"], effects: ["end_owner_access"],
  }),
  proposal({
    operation: "community.access.license_key.revoke", area: "access", name: "Revoke a license key",
    calls: "communityAccess:revokeClientLicenseKeyForOwner", ref: api.communityAccess.revokeClientLicenseKeyForOwner, kind: "mutation",
    fields: { membership_id: "the member whose key stops working" }, required: ["membership_id"], effects: ["revoke_license_key"],
  }),
  proposal({
    operation: "community.access.integration.revoke", area: "access", name: "Disconnect a connected service",
    calls: "communityAccess:revokeAccessIntegration", ref: api.communityAccess.revokeAccessIntegration, kind: "mutation",
    fields: { integration_id: "from /builder/settings.json" }, required: ["integration_id"], effects: ["revoke_access_integration"],
  }),
  proposal({
    operation: "community.workflow.stage.delete", area: "workflows", name: "Delete a workflow stage",
    calls: "communityMemberWorkflows:deleteBuilderWorkflowMilestone", ref: api.communityMemberWorkflows.deleteBuilderWorkflowMilestone, kind: "mutation",
    fields: { expected_revision: "workflow revision", milestone_key: "the stage's key" }, required: ["expected_revision", "milestone_key"],
    effects: ["delete_workflow_stage"],
  }),
  proposal({
    operation: "community.workflow.member.force", area: "workflows", name: "Move a member past a stage without its checks",
    calls: "communityMemberWorkflows:forceBuilderMemberMilestone", ref: api.communityMemberWorkflows.forceBuilderMemberMilestone, kind: "mutation",
    fields: { membership_id: "the member", expected_workflow_id: "from the member's workflow context", expected_workflow_revision: "workflow revision",
      expected_milestone_key: "the stage they're in now", expected_milestone_entered_at: "when they entered it (ms)",
      expected_activation_sequence: "from the member's workflow context", expected_transition_seq: "from the member's workflow context" },
    required: ["membership_id", "expected_workflow_id", "expected_workflow_revision", "expected_milestone_key", "expected_milestone_entered_at",
      "expected_activation_sequence", "expected_transition_seq"],
    effects: ["force_member_stage"],
  }),
  proposal({
    operation: "community.channel.delete", area: "channels", name: "Delete a channel",
    calls: "communityChannels:deleteCommunityChannel", ref: api.communityChannels.deleteCommunityChannel, kind: "mutation",
    fields: { channel_id: "from /builder/settings.json" }, required: ["channel_id"], effects: ["delete_channel"],
  }),
  proposal({
    operation: "community.channel.access.set", area: "channels", name: "Change who can see a channel",
    calls: "communityChannels:setChannelAccess", ref: api.communityChannels.setChannelAccess, kind: "mutation",
    fields: { channel_id: "the channel", access_mode: "the new mode", expected_access_mode: "its mode now",
      acknowledge_history_exposure: "true when opening it shows its past posts to more people" },
    required: ["channel_id", "access_mode", "expected_access_mode", "acknowledge_history_exposure"], effects: ["change_channel_access"],
  }),
  proposal({
    operation: "community.member.role.set", area: "members", name: "Change a member's role",
    calls: "communityAdmin:setCommunityMemberRole", ref: api.communityAdmin.setCommunityMemberRole, kind: "mutation",
    fields: { target_membership_id: "the member", role: "co_creator (shown as a creator; owner only), admin, moderator or member" }, required: ["target_membership_id", "role"],
    effects: ["change_member_role"],
  }),
  proposal({
    operation: "community.member.remove", area: "members", name: "Remove a member",
    calls: "communityAdmin:removeCommunityMember", ref: api.communityAdmin.removeCommunityMember, kind: "action",
    fields: { target_membership_id: "the member" }, required: ["target_membership_id"], effects: ["remove_member"],
  }),
  proposal({
    operation: "community.member.ban", area: "members", name: "Ban a member",
    calls: "communityAdmin:banCommunityMember", ref: api.communityAdmin.banCommunityMember, kind: "action",
    fields: { target_membership_id: "the member", reason: "why (kept in the history)" }, required: ["target_membership_id"],
    effects: ["ban_member"],
  }),
);

// The Members page. Views are direct; removing a view or a
// property, and changing many members at once, wait for the owner's Apply.
BUILDER_SETTING_OPERATIONS.push(
  op({
    operation: "community.client.view.save", area: "members", name: "Save a Members view",
    calls: "communityClients:saveClientView", ref: internal.communityClients.saveClientViewInternal, kind: "mutation",
    identity: "user", extra: { via: "agent" },
    fields: { key: "an existing view's key to change it; leave out to add a view",
      view: '{ "name", "columns": [field keys], "filters": [{ "field", "op", "value" }], "match": "all"|"any", "sort": { "field", "direction": "asc"|"desc" }, "group": a select, yes/no, plan, stage or role field key, or null }. Field keys and the ops each field takes are in /builder/clients/ (fields)',
      position: "the view's place in the tab row (a number)" },
    required: ["view"], effects: ["save_client_view"],
  }),
  proposal({
    operation: "community.client.view.delete", area: "members", name: "Delete a Members view",
    calls: "communityClients:deleteClientView", ref: api.communityClients.deleteClientView, kind: "mutation",
    fields: { key: "the view's key" }, required: ["key"], effects: ["delete_client_view"],
  }),
  proposal({
    operation: "community.client.property.archive", area: "members", name: "Remove a property",
    calls: "communityClients:archiveClientProperty", ref: api.communityClients.archiveClientProperty, kind: "mutation",
    fields: { key: "the property's key" }, required: ["key"], effects: ["archive_client_property"],
  }),
  proposal({
    operation: "community.client.bulk", area: "members", name: "Change or message many members at once",
    calls: "communityClients:runClientBulkAction", ref: api.communityClients.runClientBulkAction, kind: "mutation",
    fields: {
      action: '{ "type": "set_property", "propertyKey", "value" (null clears) } | { "type": "message", "body" } (a direct message from the owner; {first_name} and {name} are filled in) | { "type": "flag", "body"? } | { "type": "note", "body" }',
      membership_ids: "up to 200 membership ids from /builder/clients/ (one view's members: /builder/clients/views/<key>/)",
    },
    required: ["action", "membership_ids"], effects: ["bulk_set_client_property", "bulk_message_members", "bulk_log_client_event"],
  }),
);

// Replacing or deleting a saved theme loses that look, so the owner applies it.
BUILDER_SETTING_OPERATIONS.push(
  proposal({
    operation: "community.theme.saved.replace", area: "appearance", name: "Replace a saved theme's look",
    calls: "communitySavedThemes:saveCommunitySavedTheme", ref: api.communitySavedThemes.saveCommunitySavedTheme, kind: "mutation",
    fields: { saved_theme_id: "savedThemeId from saved_themes", theme: "the new community theme v1 record", name: "optional new name" },
    required: ["saved_theme_id", "theme"], effects: ["replace_named_theme"],
  }),
  proposal({
    operation: "community.theme.saved.delete", area: "appearance", name: "Delete a saved theme",
    calls: "communitySavedThemes:deleteCommunitySavedTheme", ref: api.communitySavedThemes.deleteCommunitySavedTheme, kind: "mutation",
    fields: { saved_theme_id: "savedThemeId from saved_themes" }, required: ["saved_theme_id"], effects: ["delete_named_theme"],
  }),
);

// Skill tracks (Knowledge → Roadmap): the agent reads /builder/tracks.json and
// saves whole tracks, as the Roadmap's track editor does.
BUILDER_SETTING_OPERATIONS.push(
  op({
    operation: "community.track.save", area: "knowledge", name: "Create or change a skill track",
    calls: "communityLessonTracks:saveCommunityLessonTrack", ref: api.communityLessonTracks.saveCommunityLessonTrack, kind: "mutation",
    fields: {
      key: 'track key (lowercase letters, digits, dashes); "main" is the community\'s first roadmap',
      expected_revision: "revision from /builder/tracks.json; 0 creates a new track",
      title: "what members see", summary: "the promise: one line on what members walk away with, or null", cover_url: "https image URL, or null",
      cover_style: "built-in cover in the community's colours when there is no cover_url: route (one dot per section), diagram or terminal",
      outcomes: "\"What you'll be able to do\": up to 6 one-line strings",
      audience: "\"Who it's for\": one or two lines, or null",
      order: "position in the list (0 first)", show: "always (closed tracks show as Coming up) or when_open (hidden until open)",
      opens_when: "rules that must all hold for the track to open, from rule_types in /builder/tracks.json; [] for always open. "
        + "{\"type\":\"offer\",\"offer\":\"<key from offers>\"} sells it through that offer (first lesson stays a free preview)",
      stages: '[{"name":"…","steps":[{"resource_id":"<lesson id>","checkpoint":true}]}] in order; a checkpoint keeps the rest of the track closed until done. [] on "main" keeps reading its stages from the lessons',
    },
    required: ["key", "expected_revision", "title", "opens_when", "stages"], effects: ["save_skill_track"],
  }),
  op({
    operation: "community.track.reorder", area: "knowledge", name: "Reorder skill tracks",
    calls: "communityLessonTracks:reorderCommunityLessonTracks", ref: api.communityLessonTracks.reorderCommunityLessonTracks, kind: "mutation",
    fields: { keys: "track keys in the order members should see them" }, required: ["keys"], effects: ["reorder_skill_tracks"],
  }),
  proposal({
    operation: "community.track.archive", area: "knowledge", name: "Archive or restore a skill track",
    calls: "communityLessonTracks:setCommunityLessonTrackArchived", ref: api.communityLessonTracks.setCommunityLessonTrackArchived, kind: "mutation",
    fields: { key: "the track's key", archived: "true hides it from members (progress is kept); false brings it back" },
    required: ["key", "archived"], effects: ["archive_skill_track"],
  }),
);

// Offers (Settings › Offers): a ladder from the base membership up. The agent
// reads /builder/offers.json. Prices and the ladder need the owner's Apply.
BUILDER_SETTING_OPERATIONS.push(
  proposal({
    operation: "community.offer.save", area: "pricing", name: "Create or change an offer",
    calls: "communityOffers:saveCommunityOffer", ref: api.communityOffers.saveCommunityOffer, kind: "mutation",
    fields: {
      key: "the offer's key from /builder/offers.json; leave out to create a new offer",
      name: "what members see, like Consulting", blurb: "one line for the sales page, or null",
      show_on_sales_page: "true lists it beside the other offers",
      price: '{"billingPeriod":"monthly"|"annual","amountBaseUnits":<cents>} for a higher offer; the base offer\'s price is community.pricing.set',
    },
    required: ["name"], effects: ["save_offer"],
  }),
  proposal({
    operation: "community.offer.base_price", area: "pricing", name: "Make Membership free or paid",
    calls: "communityOffers:setCommunityBaseOfferPrice", ref: api.communityOffers.setCommunityBaseOfferPrice, kind: "mutation",
    fields: { price: '{"billingPeriod":"monthly"|"annual","amountBaseUnits":<cents>} to charge new members, or null for free; current members keep their access' },
    required: ["price"], effects: ["change_price"],
  }),
  proposal({
    operation: "community.offer.reorder", area: "pricing", name: "Reorder the offer ladder",
    calls: "communityOffers:reorderCommunityOffers", ref: api.communityOffers.reorderCommunityOffers, kind: "mutation",
    fields: { keys: "offer keys, lowest first; the base offer always stays at the bottom" }, required: ["keys"], effects: ["reorder_offers"],
  }),
  proposal({
    operation: "community.offer.archive", area: "pricing", name: "Stop or restart selling an offer",
    calls: "communityOffers:setCommunityOfferArchived", ref: api.communityOffers.setCommunityOfferArchived, kind: "mutation",
    fields: { key: "the offer's key", archived: "true stops selling it (members on it keep it); false sells it again" },
    required: ["key", "archived"], effects: ["archive_offer"],
  }),
  op({
    operation: "community.offer.channel_audience", area: "channels", name: "Who gets a private channel",
    calls: "communityOffers:setCommunityChannelOfferAudience", ref: api.communityOffers.setCommunityChannelOfferAudience, kind: "mutation",
    fields: { channel_id: "an invite-only channel from /builder/offers.json", offer_keys: "offers that get it (higher offers are included); [] for only people you add" },
    required: ["channel_id", "offer_keys"], effects: ["set_channel_offer_audience"],
  }),
  // Everything else an owner does in the app: events, test runs, the member board and posts.
  op({
    operation: "community.event.save", area: "events", name: "Create or change an event",
    calls: "communityEvents:saveCommunityEvent", ref: api.communityEvents.saveCommunityEvent, kind: "mutation",
    fields: { event_id: "an event id from /builder/events.json to change it; leave out to create one",
      payload: "the event: title, starts_at and ends_at (ISO), timezone (IANA, e.g. Europe/London), description_md, "
        + "location_type (online, physical or tbd), location_label, url, visibility (members or public), "
        + "channel_id (a pod's id from /builder/pods.json to make it that pod's own call, seen and reminded only to the pod; null for everyone), "
        + "recurrence_frequency (none, daily, weekly or monthly), recurrence_interval, recurrence_until (ISO), status (live or cancelled). "
        + "When changing, left-out keys keep their value" },
    required: ["payload"], effects: ["save_event"],
  }),
  op({
    operation: "community.event.cancel", area: "events", name: "Cancel an event",
    calls: "communityEvents:cancelCommunityEvent", ref: api.communityEvents.cancelCommunityEvent, kind: "mutation",
    fields: { event_id: "from /builder/events.json (community.event.save with status live brings it back)" },
    required: ["event_id"], effects: ["cancel_event"],
  }),
  op({
    operation: "community.test_member.start", area: "testing", name: "Start a test run",
    calls: "communityTestMembers:startTestMember", ref: api.communityTestMembers.startTestMember, kind: "mutation",
    fields: { milestone_key: "optional: start in this Workflow stage instead of joining at the first",
      },
    required: [], effects: ["start_test_member"],
  }),
  op({
    operation: "community.test_member.run_waits_now", area: "testing", name: "Skip a test run's waits",
    calls: "communityTestMembers:runTestMemberTimedStepsNow", ref: api.communityTestMembers.runTestMemberTimedStepsNow, kind: "mutation",
    fields: { test_member_id: "from /builder/test-runs.json", automation_key: "optional: run only this automation's wait" },
    required: ["test_member_id"], effects: ["run_test_member_timers"],
  }),
  op({
    operation: "community.test_member.autoplay", area: "testing", name: "Autoplay a test run's next step",
    calls: "communityTestMemberAutoplay:autoplayTestMemberStep", ref: api.communityTestMemberAutoplay.autoplayTestMemberStep, kind: "mutation",
    fields: { test_member_id: "from /builder/test-runs.json", stop: "true pauses Autoplay",
      on_screen_pace: "optional: ms per move when the test member's tab is open and does each step on screen" },
    required: ["test_member_id"], effects: ["autoplay_test_member_step"],
  }),
  op({
    operation: "community.test_member.end", area: "testing", name: "End a test run",
    calls: "communityTestMembers:endTestMember", ref: api.communityTestMembers.endTestMember, kind: "mutation",
    fields: { test_member_id: "from /builder/test-runs.json; the test member and everything it did are deleted" },
    required: ["test_member_id"], effects: ["end_test_member"],
  }),
  op({
    operation: "community.workflow.member.retry_review", area: "workflows", name: "Retry a member's stage review",
    calls: "communityMemberWorkflows:retryBuilderMemberGoalReview", ref: api.communityMemberWorkflows.retryBuilderMemberGoalReview, kind: "mutation",
    fields: { membership_id: "the member", expected_workflow_id: "from the member's workflow context", expected_workflow_revision: "workflow revision",
      expected_milestone_key: "the stage they're in now", expected_milestone_entered_at: "when they entered it (ms)",
      expected_activation_sequence: "from the member's workflow context", expected_transition_seq: "from the member's workflow context",
      expected_receipt_ref: "goal_review.receipt_ref from the member's workflow context (only when retryable)" },
    required: ["membership_id", "expected_workflow_id", "expected_workflow_revision", "expected_milestone_key", "expected_milestone_entered_at",
      "expected_activation_sequence", "expected_transition_seq", "expected_receipt_ref"],
    effects: ["retry_goal_review"],
  }),
  op({
    operation: "community.workflow.member.retry_action", area: "workflows", name: "Retry a member's failed automation",
    calls: "communityMemberWorkflows:retryBuilderMemberWorkflowAction", ref: api.communityMemberWorkflows.retryBuilderMemberWorkflowAction, kind: "mutation",
    fields: { membership_id: "the member", expected_workflow_id: "from the member's workflow context", expected_workflow_revision: "workflow revision",
      expected_milestone_key: "the stage they're in now", expected_milestone_entered_at: "when they entered it (ms)",
      expected_activation_sequence: "from the member's workflow context", expected_transition_seq: "from the member's workflow context",
      automation_key: "the automation to run again (see /builder/workflow-runs.json)" },
    required: ["membership_id", "expected_workflow_id", "expected_workflow_revision", "expected_milestone_key", "expected_milestone_entered_at",
      "expected_activation_sequence", "expected_transition_seq", "automation_key"],
    effects: ["retry_workflow_action"],
  }),
  op({
    operation: "community.workflow.member.service_channel.set", area: "workflows", name: "A member's service channel",
    calls: "communityMemberWorkflows:setBuilderMemberServiceChannel", ref: api.communityMemberWorkflows.setBuilderMemberServiceChannel, kind: "mutation",
    fields: { membership_id: "the member", channel_id: "a private channel from /builder/settings.json where you serve them, or null",
      expected_revision: "service_channel.revision from the member's workflow context" },
    required: ["membership_id", "channel_id", "expected_revision"], effects: ["set_member_service_channel"],
  }),
  op({
    operation: "community.post.poll.close", area: "posts", name: "Close or reopen a poll",
    calls: "communityPostCards:setPostPollClosed", ref: api.communityPostCards.setPostPollClosed, kind: "mutation",
    fields: { root_id: "the id after interaction:root: in the poll post's ref", closed: "true closes voting; false reopens it" },
    required: ["root_id", "closed"], effects: ["close_poll"],
  }),
  op({
    operation: "community.source.ingest", area: "knowledge", name: "Index the agent's knowledge sources",
    calls: "communityResources:ingestCommunitySources", ref: (api as any).communityResources.ingestCommunitySources, kind: "action",
    fields: { limit: "optional: how many sources to index this time", retry_failed: "true tries sources that failed before" },
    required: [], effects: ["index_sources"],
  }),
  proposal({
    operation: "community.source.crawl", area: "knowledge", name: "Add a website to the agent's knowledge",
    calls: "communityResources:crawlCommunitySourceRoot", ref: (api as any).communityResources.crawlCommunitySourceRoot, kind: "action",
    fields: { root_url: "https address to start from", max_pages: "optional page limit", max_depth: "optional link depth" },
    required: ["root_url"], effects: ["crawl_website"],
  }),
  proposal({
    operation: "community.post.remove", area: "posts", name: "Remove a post or reply",
    calls: "communityInteractions:deleteCommunityInteractionMessage", ref: api.communityInteractions.deleteCommunityInteractionMessage, kind: "mutation",
    fields: { target_type: "root (a post) or reply", target_id: "the id after interaction:root: or interaction:reply: in its ref" },
    required: ["target_type", "target_id"], effects: ["remove_post"],
  }),
);

// Writes the web app makes that are not an operation above, and why. A public
// mutation or action the app calls that is in neither list (nor in
// convex/polynetMemberSelfSettings.ts) fails the parity test
// (scripts/settings_agent_parity.test.ts). Everything in Polynet is agent-editable, so each reason starts with one of:
//   "agent path:"  another MCP path does it; the test checks each community.* /
//                  member.* operation and /builder/ path it names exists;
//   "human only:"  money, sign-ins and one-time secrets, which stay with a person;
//   "member's own:" something a person does as themselves (their posts, answers,
//                  messages, leaving), never an owner's change to someone else;
//   "plumbing:"    not a choice anyone makes (presence, read markers, counts, sign-in).
export const SETTINGS_UI_WRITES_WITHOUT_AGENT_PATH: Record<string, string> = {
  // Reads a video's public chapters into a shared cache; nothing the owner sets.
  // An agent sets a lesson's own chapters by writing "02:15 Title" lines in body_md.
  "youtubeChapters:loadYouTubeChapters": "plumbing: caches a video's public chapters; agents set a lesson's own by writing timestamp lines in body_md",
  // Other MCP paths already do these.
  "communityFormDrafts:draftBuilderFormWithAgent": "agent path: an agent writes the questions itself and calls community.form.save; this asks the community agent to write them for the owner, and saves nothing",
  "communityClients:createClientProperty": "agent path: community.client.property.define",
  "communityClients:updateClientProperty": "agent path: community.client.property.define (with key)",
  "communityClients:setClientPropertyValue": "agent path: community.client.value.set",
  "communityClients:recordClientEvent": "agent path: community.client.event.record",
  "communityClients:setClientSettings": "agent path: community.client.settings.set",
  "communityThemes:saveCommunityThemeDraft": "agent path: community.theme.save_draft",
  "communityThemes:publishCommunityThemeDraft": "agent path: community.theme.publish",
  "communityThemes:discardCommunityThemeDraft": "agent path: community.theme.save_draft with the published theme from /builder/theme.json",
  "communityLayouts:saveCommunityLayoutDraft": "agent path: community.layout.save_draft",
  "communityLayouts:publishCommunityLayoutDraft": "agent path: community.layout.publish",
  "communityLayouts:discardCommunityLayoutDraft": "agent path: community.layout.save_draft with the published layout from /builder/layout.json",
  "communityResources:saveCommunityResource": "agent path: /builder/resources/ changesets, applied by the owner",
  "communityResources:saveCommunityResourceModule": "agent path: /builder/resources/ changesets",
  "communityResources:moveCommunityResourceToModule": "agent path: /builder/resources/ changesets (move_resource)",
  "communityResources:reorderCommunityResources": "agent path: /builder/resources/ changesets",
  "communityResources:updateCommunityLessonBoard": "agent path: /builder/resources/ changesets (edit_page with lesson stage, order and title)",
  "communityResources:reorderCommunityResourceModules": "agent path: /builder/resources/ changesets",
  "communityResources:deleteCommunityResource": "agent path: /builder/resources/ changesets (delete_page)",
  "communityResources:restoreCommunityResourceRevision": "agent path: /builder/resources/ (a page lists its revisions; read one, then edit_page with its body_md and title)",
  "communityResources:deleteCommunityResourceModule": "agent path: /builder/resources/ changesets (delete_category)",
  "communityResources:generateCommunityResourceSourceUploadUrl": "agent path: /builder/resources/ changesets carry the files' text",
  "communityResources:resolveCommunityResourceImageUrl": "agent path: community.settings.upload_url, then the image's storage id",
  "communityBuilderKnowledgeSetup:buildBuilderKnowledgeResources": "agent path: /builder/resources/ changesets build the same pages",
  "communityBuilderKnowledgeSetup:completeBuilderKnowledgeSetup": "agent path: /builder/resources/ changesets (first-run setup is a screen for people)",
  "communityAdmin:approveCommunityJoinRequest": "agent path: community.admission.approve",
  "communityAdmin:denyCommunityJoinRequest": "agent path: community.admission.deny",
  "communityMemberWorkflows:approveBuilderMemberMilestone": "agent path: community.workflow.approve_milestone",
  "communityInteractions:createCommunityInteractionComposerMessage": "agent path: polynet_write to a channel in /channels/",
  "communityInteractions:editCommunityInteractionMessage": "agent path: polynet_write mode update on your own post",
  "communityInteractions:toggleCommunityInteractionReaction": "agent path: community.interaction.react",
  "communityPostCards:createPollPost": "agent path: community.interaction.poll.create",
  "communityPostCards:votePostPoll": "agent path: community.interaction.poll.vote",
  "communityPostCards:createFormPost": "agent path: community.interaction.form.share",
  "communityPostCards:savePostFormAnswers": "agent path: community.interaction.form.answer",
  "communityFormRequests:saveMyAnswers": "agent path: community.form.submit",
  "communityResourceProgress:setOwnLessonResponse": "agent path: community.resource.response.set",
  "communityResourceProgress:setOwnResourceProgressStatus": "agent path: community.resource.progress.set",
  // Can't be done by an agent.
  "communitySettingProposals:applyCommunitySettingProposal": "human only: the owner applies what an agent proposed",
  "communitySettingProposals:rejectCommunitySettingProposal": "human only: the owner rejects what an agent proposed",
  "communityResources:applyCommunityResourceBuilderChangeset": "human only: the owner applies what an agent staged",
  "communityResources:rejectCommunityResourceBuilderChangeset": "human only: the owner rejects what an agent staged",
  "communityAccess:createAccessIntegration": "human only: the API key and signing secret are shown once, to the owner",
  "communityAccess:rotateAccessIntegrationSecret": "human only: the new secret is shown once, to the owner",
  "communityAccess:createMyCommunityLicenseKey": "human only: a member's license key is shown once, to them",
  "communityAccess:createAccessSignInCode": "human only: the member approves \"Continue with Polynet\" on the consent page; the one-time code goes back to the connected service, not to an agent",
  "creatorCommerce:startConnectOnboarding": "human only: Stripe verifies the owner in person; an agent can only hand over the link",
  "founderBilling:startFounderSubscriptionCheckout": "human only: the founder pays with their own card",
  "founderBilling:startFounderBillingPortal": "human only: the founder's own billing portal",
  "founderBilling:startPublicBuilderCheckout": "human only: the founder pays with their own card",
  "communityLifecycle:createCommunity": "human only: creating a community needs the founder's paid plan checkout",
  "communityCommerce:startPublicCommunityCheckout": "human only: a visitor paying with their own card",
  "communityOfferCheckout:startCommunityOfferUpgrade": "human only: a member paying for a higher offer",
  "communityCommerce:redeemPurchaseClaim": "human only: a visitor claiming what they paid for",
  "communityCommerce:redeemPendingPurchaseClaims": "human only: a visitor claiming what they paid for",
  "operatorAccess:recordOperatorDashboardAccess": "human only: Polynet's operator dashboard",
  "emailDiagnostics:getOperatorEmailAuthDiagnostic": "human only: Polynet's operator dashboard",
  "operatorSentryDiagnostics:getOperatorFrontendErrorDiagnostics": "human only: Polynet's operator dashboard",
  // A person acting as themselves.
  "communityTestMemberAutoplay:reportAutoplayScreenStep": "member's own: a test member's open tab reporting the step it did on screen",
  "communityPublic:joinPublicCommunity": "member's own: a visitor joining",
  "communityPublic:joinPublicCommunityBySlug": "member's own: a visitor joining",
  "communityPublic:cancelMyJoinRequestBySlug": "member's own: a visitor taking back their request",
  "communityAdmin:leaveCommunity": "member's own: a member leaving (owners remove with community.member.remove)",
  "communityEmbedValues:saveOwnEmbedValue": "member's own: a member's widget answers inside a lesson",
  "directMessages:*": "member's own: a person's direct messages",
  "threads:*": "member's own: a person's conversations with their agent",
  "profiles:checkHandleAvailability": "member's own: member.profile.save refuses a taken handle",
  // Not a choice anyone makes.
  "communityAdmin:syncCommunityMembershipCount": "plumbing: a count refresh",
  "communityAttention:acknowledgeCommunityChatRead": "plumbing: read markers",
  "communityAttention:markCommunitySurfaceSeen": "plumbing: read markers",
  "communityChat:setCommunityTyping": "plumbing: typing dots",
  "communityChat:clearCommunityTyping": "plumbing: typing dots",
  "communityPublic:heartbeatCommunityPresence": "plumbing: presence",
  "communityPublic:recordPublicFunnelVisitBySlug": "plumbing: visit counts",
  "businessAnalytics:identifyBusinessVisitor": "plumbing: analytics",
  "businessAnalytics:recordBusinessPageVisit": "plumbing: analytics",
  "auth:bootstrapActor": "plumbing: signing in",
  "profiles:resolveOnboardingProfileDetail": "plumbing: account setup reading a new person's profile",
  "memberEntryDestination:resolveMemberEntryDestination": "plumbing: where a member lands",
};

export const builderSettingOperation = (operation: string) =>
  BUILDER_SETTING_OPERATIONS.find(candidate => candidate.operation === operation);

const camel = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

// What polynet_call shows the agent for one operation.
export function builderSettingInput(spec: BuilderSettingOperation) {
  const proposing = spec.review === "owner_apply";
  return {
    required: spec.required,
    ...spec.fields,
    ...(proposing ? { note: "optional: one line for the owner on why", proposed_by: 'optional: your name as the owner should see it, for example "Claude Code"' } : {}),
    ...(spec.merge ? { guidance: "Leave out what you don't change; it keeps its current value." } : {}),
    ...(proposing ? { review: "owner_apply: this only proposes the change. It happens when the owner taps Apply in the app, within 24 hours." } : {}),
    result: proposing
      ? "the proposal (status staged); read /builder/settings.json proposals for whether it was applied"
      : "what the Settings page gets back after the same save",
    refusals: { invalid_tool_args: "a field that isn't listed, or a required one missing", setting_refused: "the save was refused; message says why (for example a revision conflict)" },
    effects: spec.effects,
    forbidden_effects: proposing ? ["apply_without_owner", "change_other_communities"] : ["change_pricing", "change_other_communities", "delete"],
  };
}

export type BuilderSettingCall = { ok: true; args: Record<string, unknown> } | { ok: false; message: string };

// Turns the agent's input into the mutation's arguments. Only listed fields
// pass; identity and community come from the caller, never from input.
export function builderSettingArgs(spec: BuilderSettingOperation, input: Record<string, unknown>, caller: {
  authSubject: string; userId: string; communityId: string; current?: Record<string, unknown> | null;
}): BuilderSettingCall {
  const unknown = Object.keys(input).filter(key => !(key in spec.fields) && !((key === "note" || key === "proposed_by") && spec.review === "owner_apply"));
  if (unknown.length) return { ok: false, message: `Not a field of ${spec.operation}: ${unknown.join(", ")}.` };
  const missing = spec.required.filter(key => input[key] === undefined);
  if (missing.length) return { ok: false, message: `${spec.operation} needs ${missing.join(", ")}.` };
  const args: Record<string, unknown> = {};
  if (spec.merge === "community_settings" && caller.current) {
    args.name = caller.current.name;
    args.slug = caller.current.slug;
  }
  for (const [key, value] of Object.entries(input)) if (value !== undefined && key !== "note" && key !== "proposed_by") args[camel(key)] = value;
  Object.assign(args, spec.extra ?? {});
  if (spec.community !== false) args.communityId = caller.communityId;
  if (spec.identity === "user") args.userId = caller.userId;
  else args.authSubject = caller.authSubject;
  return { ok: true, args };
}

// /builder/settings.json: everything an agent needs before it saves, read with
// the same queries the Settings pages use. A part the caller can't read is null.
export async function readBuilderSettings(ctx: any, caller: { authSubject: string; communityId: string }) {
  const scope = { authSubject: caller.authSubject, communityId: caller.communityId };
  const read = async (ref: any, extra: Record<string, unknown> = {}) => {
    try { return await ctx.runQuery(ref, { ...scope, ...extra }); } catch { return null; }
  };
  const [general, workflows, forms, access_integrations, agent, channels, proposals, saved_themes, agent_profile] = await Promise.all([
    read(api.communityLifecycle.getCommunitySettings),
    read(api.communityMemberWorkflows.getBuilderWorkflowBoardPage, { pageSize: 1 }).then(board => board ? board.workflow : null),
    Promise.all([read(api.communityForms.listBuilderForms), read(api.communityForms.listDeletedBuilderForms)])
      .then(([live, deleted]) => live && deleted?.length ? [...live, ...deleted] : live),
    read(api.communityAccess.listAccessIntegrations),
    read(api.communityAgent.getCommunityAgentConfig),
    read(api.communityChannels.listCommunityChannels),
    read(api.communitySettingProposals.listCommunitySettingProposals),
    read(api.communitySavedThemes.listCommunitySavedThemes).then(list => list
      ? list.map((saved: any) => ({ savedThemeId: saved.savedThemeId, name: saved.name, valid: saved.theme !== null, updatedAt: saved.updatedAt }))
      : null),
    ctx.runQuery(api.communityAgent.getCommunityAgentProfile, { communityId: caller.communityId }).catch(() => null),
  ]);
  return {
    contract: "polynet.builder_settings.v1",
    guidance: "Change a setting with polynet_call and its operation from capabilities/. Revisions here are what the expected_* fields want.",
    operations: BUILDER_SETTING_OPERATIONS.map(spec => ({ operation: spec.operation, area: spec.area, name: spec.name,
      ...(spec.review ? { review: spec.review } : {}) })),
    // workflows holds the welcome page and gate too, with the revision both use.
    general, workflows, forms, access_integrations, agent, channels,
    // The agent's name and photo (avatar_url null: it wears the community's icon).
    agent_profile,
    // Looks saved under a name, and the ready-made colour palettes (each has a
    // light and a dark scheme; applying one changes the draft's colours only).
    saved_themes,
    theme_palettes: COMMUNITY_THEME_PALETTES.map(({ id, name, description }) => ({ id, name, description })),
    // Ready-made stage plans live at /builder/workflow-templates.json, kept out
    // of this read so it stays inside the adapter's 24,000-character budget.
    workflow_templates: { path: "/builder/workflow-templates.json", available: ["agent_led_journey"] },
    // Skill tracks (the Roadmap's several roadmaps) live at /builder/tracks.json.
    tracks: { path: "/builder/tracks.json" },
    // Offers and which private channels each one opens.
    offers: { path: "/builder/offers.json" },
    // Pods (Classroom's private rooms): who's in each, and how to change them.
    pods: { path: "/builder/pods.json" },
    // Workflows → Run history: the latest automation runs with their steps.
    workflow_runs: { path: "/builder/workflow-runs.json" },
    // Changes waiting for the owner's Apply, and recent outcomes.
    proposals,
  };
}

// /builder/workflow-templates.json: stage plans the agent applies with the
// stage operations, as the Workflows board's "Let your agent lead each member"
// card does.
export function readBuilderWorkflowTemplates() {
  return {
    contract: "polynet.builder_workflow_templates.v1",
    agent_led_journey: {
      guidance: "Make or reuse the select property in `property` (community.client.property.define), put its key where rules say {journey_property}, "
        + "replace {form_key} with the onboarding form's key (the first stage's join form, else a published form; with none, use the no-form plan), "
        + "then: add the first stage's additions with community.workflow.stage.update, and for each stage community.workflow.stage.create "
        + "followed by community.workflow.stage.update with its rules (keys empty, draft-* action keys kept so sequences link).",
      new_workflow: buildAgentLedJourneyPlan({ hasWorkflow: false, onboardingFormKey: "{form_key}" }),
      new_workflow_no_form: buildAgentLedJourneyPlan({ hasWorkflow: false, onboardingFormKey: null }),
      existing_workflow: buildAgentLedJourneyPlan({ hasWorkflow: true, onboardingFormKey: "{form_key}" }),
    },
  };
}
