import { useCallback, useRef } from "react";

import type { AuthSession } from "../auth";
import { resolveAuthSubject } from "../../../../shared/authSession";
import {
  resolveCloudMemberEntryDestination,
  type CloudMemberEntryDestination,
} from "../../../../shared/cloudMemberEntryDestinationGateway";
import {
  buildCommunityHomePath,
  buildCommunityTabPath,
  type AppShellVariant,
} from "../../../../shared/webAppRouteState";

type NavigateOptions = {
  replace?: boolean;
};

export function useWebMemberEntryController(params: {
  session: AuthSession | null;
  shellVariant: AppShellVariant;
  getSession: () => AuthSession | null;
  navigateTo: (path: string, options?: NavigateOptions) => void;
  applyCommunityShellState: (options: {
    communityId?: string | null;
    communitySlug?: string | null;
    communityTab?: "chat";
  }) => void;
  setAppPublicRoute: () => void;
  reloadCommunities: (session: AuthSession) => Promise<unknown>;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const defaultResolutionRef = useRef<{
    authSubject: string;
    promise: Promise<CloudMemberEntryDestination | null>;
  } | null>(null);

  const resolveDestination = useCallback(
    async (options?: {
      session?: AuthSession | null;
      communityId?: string | null;
      communitySlug?: string | null;
    }): Promise<CloudMemberEntryDestination | null> => {
      const current = paramsRef.current;
      const activeSession =
        options?.session ?? current.getSession() ?? current.session;
      if (!activeSession) return null;
      const authSubject = resolveAuthSubject(activeSession);
      if (!authSubject) return null;
      const isDefaultDestination =
        !options?.communityId && !options?.communitySlug;
      if (
        isDefaultDestination &&
        defaultResolutionRef.current?.authSubject === authSubject
      ) {
        return await defaultResolutionRef.current.promise;
      }
      const request = resolveCloudMemberEntryDestination<AuthSession>({
        session: activeSession,
        communityId: options?.communityId ?? null,
        communitySlug: options?.communitySlug ?? null,
      });
      if (isDefaultDestination) {
        defaultResolutionRef.current = { authSubject, promise: request };
      }
      try {
        return await request;
      } catch (error) {
        console.warn("[member-entry] destination resolution failed:", error);
        return null;
      } finally {
        if (
          isDefaultDestination &&
          defaultResolutionRef.current?.promise === request
        ) {
          defaultResolutionRef.current = null;
        }
      }
    },
    [],
  );

  const applyDestination = useCallback(
    (
      destination: CloudMemberEntryDestination,
      options?: NavigateOptions,
    ): void => {
      const current = paramsRef.current;
      if (destination.page === "discover") {
        current.applyCommunityShellState({
          communityId: null,
          communitySlug: null,
          communityTab: "chat",
        });
        current.navigateTo("/discover", {
          replace: options?.replace !== false,
        });
        return;
      }

      const path = current.shellVariant === "mobile"
        ? buildCommunityHomePath(destination.community_slug)
        : buildCommunityTabPath(destination.community_slug, "chat");
      if (!path) throw new Error("community_destination_path_required");
      current.applyCommunityShellState({
        communityId: destination.community_id,
        communitySlug: destination.community_slug,
      });
      current.setAppPublicRoute();
      current.navigateTo(path, { replace: options?.replace !== false });

      const activeSession = current.getSession() ?? current.session;
      if (activeSession) {
        void current.reloadCommunities(activeSession).catch(() => {
          // Destination access is authoritative; membership refresh is best effort.
        });
      }
    },
    [],
  );

  const resolveAndEnter = useCallback(
    async (options?: {
      session?: AuthSession | null;
      communityId?: string | null;
      communitySlug?: string | null;
      replace?: boolean;
    }): Promise<boolean> => {
      const destination = await resolveDestination(options);
      if (!destination) return false;
      applyDestination(destination, { replace: options?.replace });
      return true;
    },
    [applyDestination, resolveDestination],
  );

  return {
    resolveDestination,
    applyDestination,
    resolveAndEnter,
  };
}
