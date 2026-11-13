import { useState } from "react";

import {
  handbookCanApprove,
  handbookDraftNeedsConfirm,
  handbookEditorStatus,
  handbookOpenQuestions,
} from "../../../../shared/communityHandbookEditorState";
import type { EnsureSessionFn } from "../../../../shared/ensureUsableSession";
import { useWebCommunityHandbookController } from "../controllers/useWebCommunityHandbookController";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { SettingsButton, SettingsGroup, SettingsRow } from "./SettingsRows";

export type WebCommunityHandbookEditorProps<SessionT = unknown> = {
  communityId: string | null;
  session: SessionT | null;
  ensureSession: EnsureSessionFn<SessionT>;
};

// The founder-approved handbook: facts members ask about. The agent drafts it
// from the community's own posts, lessons and events; the founder edits and
// approves; members and the agent only ever see the approved version.
export function WebCommunityHandbookEditor<SessionT>(props: WebCommunityHandbookEditorProps<SessionT>) {
  const handbook = useWebCommunityHandbookController({ ...props, enabled: Boolean(props.communityId) });
  const [confirmingDraft, setConfirmingDraft] = useState(false);
  const drafting = handbook.view?.draft_status === "drafting" || handbook.busy === "drafting";
  const open = handbookOpenQuestions(handbook.text);
  const startDraft = () => {
    setConfirmingDraft(false);
    void handbook.requestDraft();
  };

  const status = <>
    {handbookEditorStatus(handbook.view, handbook.text, handbook.dirty)}
    {open > 0 && !drafting ? ` ${open} ${open === 1 ? "point says" : "points say"} "Ask the founder."` : ""}
  </>;
  // Design v1: the handbook as rows. Approving publishes it to members, so it
  // stays a deliberate button (the page's one primary).
  if (isDesignV1Active()) {
    return (
      <SettingsGroup label="Handbook">
        <SettingsRow label="What should members know?" htmlFor="guide-handbook" stacked
          help="Who runs what, when you meet, where to start, what to bring, and your norms. The guide answers members from the approved version.">
          <textarea id="guide-handbook" className="settings-v1-input" rows={14}
            placeholder="Draft with the guide, or write it yourself."
            value={handbook.text} disabled={handbook.busy !== null || drafting}
            onChange={(event) => handbook.setText(event.target.value)} />
        </SettingsRow>
        <SettingsRow label="" help={handbook.error ? <span className="settings-v1-error">{handbook.error}</span> : <span role="status">{status}</span>}>
          {confirmingDraft ? (
            <>
              <SettingsButton variant="quiet" onClick={() => setConfirmingDraft(false)}>Keep my changes</SettingsButton>
              <SettingsButton variant="danger" onClick={startDraft}>Replace with a draft</SettingsButton>
            </>
          ) : (
            <>
              <SettingsButton disabled={drafting || handbook.busy !== null}
                onClick={() => (handbookDraftNeedsConfirm(handbook.dirty, handbook.text) ? setConfirmingDraft(true) : startDraft())}>
                {drafting ? "Drafting…" : "Draft with the guide"}
              </SettingsButton>
              <SettingsButton disabled={!handbook.dirty || handbook.busy !== null} onClick={() => void handbook.save()}>
                {handbook.busy === "saving" ? "Saving…" : "Save draft"}
              </SettingsButton>
              <SettingsButton variant="primary" disabled={!handbookCanApprove(handbook.view, handbook.text) || handbook.busy !== null} onClick={() => void handbook.approve()}>
                {handbook.busy === "approving" ? "Approving…" : "Approve for members"}
              </SettingsButton>
            </>
          )}
        </SettingsRow>
      </SettingsGroup>
    );
  }

  return (
    <div className="settings-section community-handbook-editor">
      <label className="agent-canvas-target-card agent-canvas-target-card-editable">
        <span className="agent-canvas-target-kicker">Handbook</span>
        <span className="agent-canvas-target-title">What should members know?</span>
        <span className="model-note">
          Who runs what, when you meet, where to start, what to bring, and your norms. The agent answers
          members from the approved version.
        </span>
        <textarea
          className="system-prompt-input"
          placeholder="Draft with the agent, or write it yourself."
          value={handbook.text}
          // Locked while a load, save, approve or draft is in flight, so the
          // response can't overwrite edits typed meanwhile.
          disabled={handbook.busy !== null || drafting}
          onChange={(event) => handbook.setText(event.target.value)}
          rows={16}
        />
      </label>

      <div className="model-note" role="status">
        {handbookEditorStatus(handbook.view, handbook.text, handbook.dirty)}
        {open > 0 && !drafting ? ` ${open} ${open === 1 ? "point says" : "points say"} "Ask the founder."` : ""}
      </div>
      {handbook.error ? <div className="auth-error">{handbook.error}</div> : null}

      {confirmingDraft ? (
        <div className="agent-preview-actions">
          <span className="model-note">A new draft replaces your unsaved changes.</span>
          <button type="button" onClick={() => setConfirmingDraft(false)}>Keep my changes</button>
          <button type="button" className="platform-save-button is-dirty" onClick={startDraft}>Replace with a draft</button>
        </div>
      ) : (
        <div className="agent-preview-actions">
          <button
            type="button"
            disabled={drafting || handbook.busy !== null}
            onClick={() => (handbookDraftNeedsConfirm(handbook.dirty, handbook.text) ? setConfirmingDraft(true) : startDraft())}
          >
            {drafting ? "Drafting…" : "Draft with agent"}
          </button>
          <button
            type="button"
            disabled={!handbook.dirty || handbook.busy !== null}
            onClick={() => void handbook.save()}
          >
            {handbook.busy === "saving" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className={`platform-save-button ${handbookCanApprove(handbook.view, handbook.text) ? "is-dirty" : "is-saved"}`}
            disabled={!handbookCanApprove(handbook.view, handbook.text) || handbook.busy !== null}
            onClick={() => void handbook.approve()}
          >
            {handbook.busy === "approving" ? "Approving…" : "Approve for members"}
          </button>
        </div>
      )}
    </div>
  );
}
