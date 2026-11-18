// Settings: what your guide may do for you in this community without asking
// first (convex/communityGuideQuestions.ts). One switch: posting under your
// name. Off, it shows you the exact words and waits for your yes. Removing
// posts always asks. Yours alone: it changes nothing for anyone else.
import { useState } from "react";
import { setGuideAlwaysAllowed } from "../../../../shared/cloudGuideQuestionsGateway";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { useCommunityAgentOn } from "../controllers/communityAgentOn";
import { SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsRows";

export const GUIDE_ALLOWED_POST_LABEL = "Post as you without asking";
export const GUIDE_ALLOWED_POST_HELP = "Off, your guide shows you the exact words and waits for your yes. Removing posts always asks.";

export function GuideAllowedSettings(props: { communityId: string; session: unknown }) {
  const agentOn = useCommunityAgentOn();
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const { data } = useLiveQuery<{ post: boolean }>(props.session, "communityGuideQuestions:getGuideAlwaysAllowed",
    subject && agentOn ? { authSubject: subject, communityId: props.communityId } : null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!agentOn) return null;
  const change = async (on: boolean) => {
    setSaving(true);
    setFailed(false);
    try { await setGuideAlwaysAllowed({ session: props.session, communityId: props.communityId, on }); } catch { setFailed(true); }
    setSaving(false);
  };
  return (
    <SettingsGroup label="What your guide does for you">
      <SettingsRow label={GUIDE_ALLOWED_POST_LABEL}
        help={failed ? <span className="settings-v1-error">That didn't save. Try again.</span> : GUIDE_ALLOWED_POST_HELP}>
        <SettingsSwitch label={GUIDE_ALLOWED_POST_LABEL} checked={data?.post === true} disabled={saving || data === undefined} onChange={(on) => void change(on)} />
      </SettingsRow>
    </SettingsGroup>
  );
}
