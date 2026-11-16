import { useCallback, useEffect, useRef, useState } from "react";
import { readPlaceParam, writeOpenPlace } from "../../../../shared/placeParams";

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
  // Members rides on the address (?open=members), so a refresh comes back to
  // it. Read once; opened when this channel and your rights are known.
  const reopenRef = useRef(readPlaceParam("open") === "members");
  useEffect(() => {
    if (!reopenRef.current) return;
    if (readPlaceParam("open") !== "members") { reopenRef.current = false; return; }
    if (!params.canViewMembers || !currentScope) return;
    reopenRef.current = false;
    setOpenScope(currentScope);
  }, [currentScope, params.canViewMembers]);
  const peopleOpen = Boolean(params.canViewMembers && currentScope && openScope === currentScope);
  useEffect(() => {
    if (reopenRef.current && readPlaceParam("open") === "members") return;
    writeOpenPlace("members", peopleOpen);
  }, [peopleOpen]);
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
  return { peopleOpen, changeOpen, openMembers };
}
