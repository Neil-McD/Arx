import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";

type SessionLike = {
  user: {
    id: string;
  };
};

// The signed-in account's billing status: loaded on sign-in, cleared on sign-out.
export function useWebPostAuthBillingLifecycle<
  TSession extends SessionLike,
  TBillingStatus,
>(params: {
  session: TSession | null;
  setAccountCommerceStatus: Dispatch<SetStateAction<TBillingStatus | null>>;
  setAccountCommerceError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingAccountCommerce: Dispatch<SetStateAction<boolean>>;
  loadAccountCommerceStatus: (session: TSession) => Promise<TBillingStatus | null>;
}) {
  useEffect(() => {
    const session = params.session;
    if (!session) {
      params.setAccountCommerceStatus(null);
      params.setAccountCommerceError(null);
      params.setIsLoadingAccountCommerce(false);
      return;
    }
    void params.loadAccountCommerceStatus(session);
  }, [params.session]);
}
