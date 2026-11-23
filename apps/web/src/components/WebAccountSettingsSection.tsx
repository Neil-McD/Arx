import { useEffect, useState } from "react";

import type { CloudFounderBillingOverview } from "../../../../shared/cloudFounderBillingGateway";
import { WebSignOutConfirmModal } from "./WebSignOutConfirmModal";
import { SettingsGroup, SettingsRow } from "./SettingsRows";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

export type WebAccountSettingsSectionProps = {
  session: SessionLike;
  authError: string | null;
  requireSignIn: () => void;
  handleSignOut: () => Promise<void> | void;
  founderBillingOverview: CloudFounderBillingOverview;
  founderBillingActionCommunityId: string | null;
  founderBillingError: string | null;
  retryCommunityArchive: (communityId: string) => Promise<void> | void;
  restoreCommunityWithoutPayment: (
    communityId: string,
    lifecycleGeneration: number,
  ) => Promise<void> | void;
};

export function WebAccountSettingsSection(
  props: WebAccountSettingsSectionProps,
) {
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (props.session) return;
    setIsSignOutConfirmOpen(false);
    setIsSubmittingSignOut(false);
  }, [props.session]);

  const handleConfirmSignOut = async (): Promise<void> => {
    if (isSubmittingSignOut) return;
    setSignOutError(null);
    setIsSubmittingSignOut(true);
    try {
      await props.handleSignOut();
      setIsSignOutConfirmOpen(false);
    } catch {
      setSignOutError("Sign out couldn't be confirmed. Try again.");
    } finally {
      setIsSubmittingSignOut(false);
    }
  };

  return (
    <>
      <SettingsGroup>
        {props.session ? (
          <>
            <SettingsRow label="Email" help="You sign in with this.">
              <span className="settings-v1-value">
                {props.session.user.email ?? props.session.user.id}
              </span>
            </SettingsRow>
            <SettingsRow
              label="Sign out"
              help={
                props.authError ? (
                  <span className="settings-v1-error">{props.authError}</span>
                ) : (
                  "On this device."
                )
              }
            >
              <button
                className="settings-v1-button"
                type="button"
                disabled={isSubmittingSignOut}
                onClick={() => setIsSignOutConfirmOpen(true)}
              >
                Sign out
              </button>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow
            label="Not signed in"
            help={
              props.authError ? (
                <span className="settings-v1-error">{props.authError}</span>
              ) : undefined
            }
          >
            <button
              className="settings-v1-button"
              type="button"
              onClick={props.requireSignIn}
            >
              Sign in
            </button>
          </SettingsRow>
        )}
      </SettingsGroup>
      <WebSignOutConfirmModal
        isOpen={Boolean(props.session) && isSignOutConfirmOpen}
        isSubmitting={isSubmittingSignOut}
        error={signOutError}
        onClose={() => {
          if (!isSubmittingSignOut) {
            setIsSignOutConfirmOpen(false);
            setSignOutError(null);
          }
        }}
        onConfirm={handleConfirmSignOut}
      />
    </>
  );
}
