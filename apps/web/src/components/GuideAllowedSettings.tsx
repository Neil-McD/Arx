// Settings: what your guide may do for you in this community without asking
// first (convex/communityGuideQuestions.ts). Two switches: posting under your
// name, and replying in your direct messages. Off, it shows you the exact
// words and waits for your yes. Removing posts, roles and bans always ask.
// Yours alone: it changes nothing for anyone else.
import { useState } from "react";
import { setGuideAlwaysAllowed } from "../../../../shared/cloudGuideQuestionsGateway";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { useCommunityAgentOn } from "../controllers/communityAgentOn";
import { SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsRows";

export const GUIDE_ALLOWED_POST_LABEL = "Post as you without asking";
export const GUIDE_ALLOWED_POST_HELP = "Off, your guide shows you the exact words and waits for your yes. Removing posts always asks.";
export const GUIDE_ALLOWED_MESSAGE_LABEL = "Reply in your messages without asking";
export const GUIDE_ALLOWED_MESSAGE_HELP = "Off, your guide shows you the reply and who it goes to, and waits for your yes.";

export function GuideAllowedSettings(props: { communityId: string; session: unknown }) {
  const agentOn = useCommunityAgentOn();
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const { data } = useLiveQuery<{
    post: boolean;
    message?: boolean;
    post_global?: boolean;
    message_global?: boolean;
  }>(props.session, "communityGuideQuestions:getGuideAlwaysAllowed",
    subject && agentOn ? { authSubject: subject, communityId: props.communityId } : null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!agentOn) return null;
  const change = async (on: boolean, kind: "post" | "message" = "post") => {
    setSaving(true);
    setFailed(false);
    try { await setGuideAlwaysAllowed({ session: props.session, communityId: props.communityId, on, kind }); } catch { setFailed(true); }
    setSaving(false);
  };
  return (
    <SettingsGroup label="What your guide does for you">
      <SettingsRow
        label={GUIDE_ALLOWED_POST_LABEL}
        help={
          failed ? (
            <span className="settings-v1-error">That didn't save. Try again.</span>
          ) : data?.post_global ? (
            "Enabled across all communities in Settings → Guide."
          ) : (
            GUIDE_ALLOWED_POST_HELP
          )
        }
      >
        <SettingsSwitch
          label={GUIDE_ALLOWED_POST_LABEL}
          checked={data?.post === true}
          disabled={saving || data === undefined || data?.post_global === true}
          onChange={(on) => void change(on)}
        />
      </SettingsRow>
      <SettingsRow
        label={GUIDE_ALLOWED_MESSAGE_LABEL}
        help={
          data?.message_global
            ? "Enabled across all communities in Settings → Guide."
            : GUIDE_ALLOWED_MESSAGE_HELP
        }
      >
        <SettingsSwitch
          label={GUIDE_ALLOWED_MESSAGE_LABEL}
          checked={data?.message === true}
          disabled={saving || data === undefined || data?.message_global === true}
          onChange={(on) => void change(on, "message")}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
