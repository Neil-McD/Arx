import { useCallback, useEffect, useRef, useState } from "react";

type Scope = { userId?: string; communityId: string | null; channelSlug?: string | null };
export function channelPeopleScopeKey(scope: Scope) {
  return JSON.stringify([scope.userId, scope.communityId, scope.channelSlug || "general"]);
}

export function useWebChannelPeoplePanel(params: Scope & {
  inChat: boolean;
  canViewMembers: boolean;
  closeDetail: () => void;
  openGeneral: () => boolean;
}) {
  const currentScope = params.inChat ? channelPeopleScopeKey(params) : null;
  const [openScope, setOpenScope] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setOpenScope(scope => params.canViewMembers && scope === currentScope ? scope : null);
  }, [currentScope, params.canViewMembers]);
  const changeOpen = useCallback((open: boolean) => {
    if (open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpenScope(currentScope);
    } else {
      setOpenScope(null);
      requestAnimationFrame(() => {
        if (openerRef.current?.isConnected) openerRef.current.focus();
      });
    }
  }, [currentScope]);
  const openMembers = () => {
    if (!params.communityId || !params.canViewMembers) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    params.closeDetail();
    if (currentScope) {
      setOpenScope(currentScope);
    } else if (params.openGeneral()) {
      setOpenScope(channelPeopleScopeKey({ ...params, channelSlug: "general" }));
    }
  };
  return { peopleOpen: Boolean(params.canViewMembers && currentScope && openScope === currentScope),
    changeOpen, openMembers };
}
