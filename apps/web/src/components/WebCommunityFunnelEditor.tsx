import { Plus, Trash2 } from "lucide-react";
import { useMemo, type MutableRefObject } from "react";

import {
  buildDefaultCommunityFunnelDocumentV1,
} from "../../../../shared/communityFunnel";
import type {
  CommunityFunnelDocumentV1,
  CommunityFunnelManagerConfig,
} from "../../../../shared/communityTypes";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

type PreviewCommunityLike = {
  name: string;
};

export type WebCommunityFunnelEditorProps = {
  communityFunnelDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityFunnel: () => Promise<boolean> | boolean;
  handleResetCommunityFunnel: () => void;
  handlePreviewCommunityFunnel: () => void;
  isSavingCommunityFunnel: boolean;
  communityFunnelSaveError: string | null;
  communityFunnelConfig: CommunityFunnelManagerConfig;
  setCommunityFunnelConfig: React.Dispatch<React.SetStateAction<CommunityFunnelManagerConfig>>;
  markCommunityFunnelDirty: () => void;
  funnelOneLiner: string;
  funnelAbout: string;
  previewCommunity: PreviewCommunityLike;
};

function updateDocument(
  config: CommunityFunnelManagerConfig,
  document: CommunityFunnelDocumentV1,
): CommunityFunnelManagerConfig {
  return { ...config, draft_document_v1: document };
}

export function WebCommunityFunnelEditor(props: WebCommunityFunnelEditorProps) {
  const {
    communityFunnelDirtyRef,
    handleSaveCommunityFunnel,
    handleResetCommunityFunnel,
    handlePreviewCommunityFunnel,
    isSavingCommunityFunnel,
    communityFunnelSaveError,
    communityFunnelConfig,
    setCommunityFunnelConfig,
    markCommunityFunnelDirty,
    funnelOneLiner,
    funnelAbout,
    previewCommunity,
  } = props;
  const document = useMemo(
    () => communityFunnelConfig.draft_document_v1 ?? buildDefaultCommunityFunnelDocumentV1({
      communityName: previewCommunity.name,
      oneLiner: funnelOneLiner,
      about: funnelAbout,
      heroMediaUrl: communityFunnelConfig.hero_media_url,
    }),
    [
      communityFunnelConfig.draft_document_v1,
      communityFunnelConfig.hero_media_url,
      funnelAbout,
      funnelOneLiner,
      previewCommunity.name,
    ],
  );
  const isDirty = communityFunnelDirtyRef.current;
  const videoUrlIsValid = !document.intro_video_url || Boolean(parseEmbedUrl(document.intro_video_url));

  const setDocument = (updater: (current: CommunityFunnelDocumentV1) => CommunityFunnelDocumentV1) => {
    const nextDocument = updater(document);
    setCommunityFunnelConfig((current) => updateDocument(current, nextDocument));
    markCommunityFunnelDirty();
  };

  return (
    <section className="funnel-v1-editor" aria-labelledby="funnel-v1-editor-title">
      <header className="funnel-v1-editor-header">
        <div>
          <div className="settings-section-title" id="funnel-v1-editor-title">Public funnel</div>
          <p>One focused page for explaining the community and converting a visitor.</p>
        </div>
        <div className="funnel-v1-editor-actions">
          <button type="button" onClick={handleResetCommunityFunnel} disabled={!isDirty || isSavingCommunityFunnel}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePreviewCommunityFunnel}
            disabled={isDirty || isSavingCommunityFunnel}
            title={isDirty ? "Save the draft before previewing it." : undefined}
          >
            Preview
          </button>
          <button
            type="button"
            className={`platform-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
            onClick={() => void handleSaveCommunityFunnel()}
            disabled={!isDirty || isSavingCommunityFunnel || !videoUrlIsValid}
          >
            {isSavingCommunityFunnel ? "Saving…" : isDirty ? "Save draft" : "Saved"}
          </button>
        </div>
      </header>

      {communityFunnelSaveError ? <div className="auth-error">{communityFunnelSaveError}</div> : null}

      <div className="funnel-v1-editor-grid">
        <div className="funnel-v1-editor-column">
          <div className="funnel-v1-editor-section">
            <div className="funnel-v1-editor-section-heading">
              <span>01</span>
              <div>
                <h3>Promise</h3>
                <p>The clearest reason to keep scrolling.</p>
              </div>
            </div>
            <label>
              Headline
              <textarea
                rows={3}
                maxLength={160}
                value={document.headline}
                onChange={(event) => setDocument((current) => ({ ...current, headline: event.target.value }))}
              />
            </label>
            <label>
              Subheadline
              <textarea
                rows={4}
                maxLength={360}
                value={document.subheadline}
                onChange={(event) => setDocument((current) => ({ ...current, subheadline: event.target.value }))}
              />
            </label>
            <label>
              Intro video
              <input
                type="url"
                inputMode="url"
                placeholder="YouTube, Vimeo, Loom, or Wistia URL"
                value={document.intro_video_url ?? ""}
                aria-invalid={!videoUrlIsValid}
                onChange={(event) => setDocument((current) => ({
                  ...current,
                  intro_video_url: event.target.value || null,
                }))}
              />
              {!videoUrlIsValid ? <small className="funnel-v1-field-error">Use a supported video URL.</small> : null}
            </label>
          </div>

          <div className="funnel-v1-editor-section">
            <div className="funnel-v1-editor-section-heading">
              <span>02</span>
              <div>
                <h3>Three pillars</h3>
                <p>The three things every member should understand.</p>
              </div>
            </div>
            <div className="funnel-v1-pillar-editor-list">
              {document.pillars.map((pillar, index) => (
                <fieldset key={index}>
                  <legend>Pillar {index + 1}</legend>
                  <input
                    aria-label={`Pillar ${index + 1} title`}
                    maxLength={80}
                    value={pillar.title}
                    onChange={(event) => setDocument((current) => {
                      const pillars = current.pillars.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: event.target.value } : item,
                      ) as CommunityFunnelDocumentV1["pillars"];
                      return { ...current, pillars };
                    })}
                  />
                  <textarea
                    aria-label={`Pillar ${index + 1} body`}
                    rows={3}
                    maxLength={280}
                    value={pillar.body}
                    onChange={(event) => setDocument((current) => {
                      const pillars = current.pillars.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, body: event.target.value } : item,
                      ) as CommunityFunnelDocumentV1["pillars"];
                      return { ...current, pillars };
                    })}
                  />
                </fieldset>
              ))}
            </div>
          </div>
        </div>

        <div className="funnel-v1-editor-column">
          <div className="funnel-v1-editor-section">
            <div className="funnel-v1-editor-section-heading">
              <span>03</span>
              <div>
                <h3>Founder proof</h3>
                <p>Optional. Hidden from the funnel when blank.</p>
              </div>
            </div>
            <label>
              Founder quote
              <textarea
                rows={7}
                maxLength={1_200}
                placeholder="Why this community exists and what members can become here."
                value={document.founder_quote ?? ""}
                onChange={(event) => setDocument((current) => ({
                  ...current,
                  founder_quote: event.target.value || null,
                }))}
              />
            </label>
          </div>

          <div className="funnel-v1-editor-section">
            <div className="funnel-v1-editor-section-heading funnel-v1-editor-section-heading-with-action">
              <span>04</span>
              <div>
                <h3>Questions</h3>
                <p>Optional. Up to three concise objections.</p>
              </div>
              {document.faq.length < 3 ? (
                <button
                  type="button"
                  className="funnel-v1-icon-action"
                  aria-label="Add question"
                  onClick={() => setDocument((current) => ({
                    ...current,
                    faq: [...current.faq, { question: "", answer: "" }],
                  }))}
                >
                  <Plus aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {document.faq.length ? (
              <div className="funnel-v1-faq-editor-list">
                {document.faq.map((item, index) => (
                  <fieldset key={index}>
                    <legend>Question {index + 1}</legend>
                    <button
                      type="button"
                      className="funnel-v1-icon-action"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() => setDocument((current) => ({
                        ...current,
                        faq: current.faq.filter((_, itemIndex) => itemIndex !== index),
                      }))}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                    <input
                      aria-label={`Question ${index + 1}`}
                      maxLength={160}
                      placeholder="What should a visitor know?"
                      value={item.question}
                      onChange={(event) => setDocument((current) => ({
                        ...current,
                        faq: current.faq.map((faq, itemIndex) =>
                          itemIndex === index ? { ...faq, question: event.target.value } : faq,
                        ),
                      }))}
                    />
                    <textarea
                      aria-label={`Answer ${index + 1}`}
                      rows={4}
                      maxLength={1_200}
                      placeholder="A clear, direct answer."
                      value={item.answer}
                      onChange={(event) => setDocument((current) => ({
                        ...current,
                        faq: current.faq.map((faq, itemIndex) =>
                          itemIndex === index ? { ...faq, answer: event.target.value } : faq,
                        ),
                      }))}
                    />
                  </fieldset>
                ))}
              </div>
            ) : (
              <p className="funnel-v1-editor-empty-copy">No FAQ section will be shown.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
