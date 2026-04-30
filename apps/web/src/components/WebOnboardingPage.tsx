import { useState, type DragEvent } from "react";

type WebOnboardingPageProps = {
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  isAvatarDragOver: boolean;
  isSaving: boolean;
  error: string | null;
  setIsAvatarDragOver: (value: boolean) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarUpload: (file: File | null) => Promise<void> | void;
  onRemoveAvatar: () => void;
  onDisplayNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onNextProfile: () => Promise<boolean> | boolean;
  onBuildCommunity: () => void;
  onDiscoverCommunity: () => void;
  onLearnAboutPolynet: () => void;
};

export function WebOnboardingPage(props: WebOnboardingPageProps) {
  const [step, setStep] = useState<"profile" | "direction">("profile");

  const handleNextProfile = async () => {
    const ok = await props.onNextProfile();
    if (ok) setStep("direction");
  };

  return (
    <main className="polynet-onboarding-page" aria-labelledby="polynet-onboarding-title">
      <section className="polynet-onboarding-panel">
        <div className="polynet-onboarding-brand">
          <img src="/favicon.svg" alt="" />
          <span>Polynet</span>
        </div>

        <div className="polynet-onboarding-header">
          <p className="polynet-landing-kicker">Set up your account</p>
          <h1 id="polynet-onboarding-title">Welcome to Polynet.</h1>
          <p>
            Confirm your profile so people know who they are talking to across
            communities.
          </p>
        </div>

        {step === "profile" ? (
          <>
            <div className="polynet-onboarding-profile">
              <div className="polynet-onboarding-avatar-row">
                <div
                  className={`polynet-onboarding-avatar${props.isAvatarDragOver ? " drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    props.setIsAvatarDragOver(true);
                  }}
                  onDragLeave={() => props.setIsAvatarDragOver(false)}
                  onDrop={props.onAvatarDrop}
                >
                  {props.avatarUrl ? <img src={props.avatarUrl} alt="Profile avatar" /> : <span>P</span>}
                </div>
                <div className="polynet-onboarding-avatar-actions">
                  <label className="create-avatar-btn">
                    Change avatar
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void props.onAvatarUpload(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {props.avatarUrl ? (
                    <button className="create-avatar-remove" type="button" onClick={props.onRemoveAvatar}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <label>
                Display name
                <input
                  value={props.displayName}
                  onChange={(event) => props.onDisplayNameChange(event.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label>
                Bio
                <textarea
                  value={props.bio}
                  onChange={(event) => props.onBioChange(event.target.value)}
                  placeholder="What are you building, learning, or exploring?"
                  rows={4}
                />
              </label>
              {props.email ? <p className="polynet-onboarding-email">{props.email}</p> : null}
              {props.error ? <p className="polynet-onboarding-error">{props.error}</p> : null}
              <div className="polynet-onboarding-profile-footer">
                <button
                  type="button"
                  className="polynet-onboarding-next"
                  disabled={props.isSaving}
                  onClick={() => void handleNextProfile()}
                >
                  {props.isSaving ? "Saving..." : "Next"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="polynet-onboarding-choice">
              <button type="button" className="primary" disabled={props.isSaving} onClick={props.onBuildCommunity}>
                Build a community
              </button>
              <button type="button" disabled={props.isSaving} onClick={props.onDiscoverCommunity}>
                Discover a community
              </button>
            </div>
            {props.error ? <p className="polynet-onboarding-error">{props.error}</p> : null}
            <button
              type="button"
              className="polynet-onboarding-learn"
              disabled={props.isSaving}
              onClick={props.onLearnAboutPolynet}
            >
              Learn about Polynet
            </button>
          </>
        )}
      </section>
    </main>
  );
}
