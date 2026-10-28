import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  loadCommunityDirectoryWindow,
  type CommunityDirectoryWindowPage,
} from "../shared/communityDirectoryWindow";
import {
  beginProfileHydrationRequest,
  createProfileHydrationRequestRegistry,
  finishProfileHydrationRequest,
} from "../shared/profileHydrationRequestRegistry";

type Row = { id: string };

function rows(count: number, offset = 0): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `member-${offset + index}`,
  }));
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("web data result integrity contract", () => {
  it("refreshes the complete visible directory window instead of collapsing to 25", async () => {
    const requests: Array<{ cursor: string | null; pageSize: number }> = [];
    const result = await loadCommunityDirectoryWindow({
      targetRowCount: 92,
      getRowKey: (row: Row) => row.id,
      loadPage: async (request): Promise<CommunityDirectoryWindowPage<Row>> => {
        requests.push(request);
        return {
          rows: rows(92),
          totalCount: 92,
          continueCursor: null,
          isDone: true,
        };
      },
    });

    expect(requests).toEqual([{ cursor: null, pageSize: 92 }]);
    expect(result?.rows).toHaveLength(92);
  });

  it("replays canonical cursors when the visible window exceeds the page maximum", async () => {
    const sourceRows = rows(125);
    const pageSizes: number[] = [];
    const result = await loadCommunityDirectoryWindow({
      targetRowCount: 125,
      getRowKey: (row: Row) => row.id,
      loadPage: async ({ cursor, pageSize }) => {
        pageSizes.push(pageSize);
        const offset = Number(cursor ?? 0);
        const pageRows = sourceRows.slice(offset, offset + pageSize);
        const nextOffset = offset + pageRows.length;
        return {
          rows: pageRows,
          totalCount: sourceRows.length,
          continueCursor: nextOffset < sourceRows.length ? String(nextOffset) : null,
          isDone: nextOffset >= sourceRows.length,
        };
      },
    });

    expect(pageSizes).toEqual([100, 25]);
    expect(result?.rows.map((row) => row.id)).toEqual(sourceRows.map((row) => row.id));
    expect(result?.continueCursor).toBeNull();
  });

  it("returns canonical removals and ordering and rejects a stalled cursor", async () => {
    const canonicalRows = [{ id: "member-3" }, { id: "member-1" }];
    const result = await loadCommunityDirectoryWindow({
      targetRowCount: 25,
      getRowKey: (row: Row) => row.id,
      loadPage: async () => ({
        rows: canonicalRows,
        totalCount: 2,
        continueCursor: null,
        isDone: true,
      }),
    });
    expect(result?.rows).toEqual(canonicalRows);

    await expect(loadCommunityDirectoryWindow({
      targetRowCount: 25,
      getRowKey: (row: Row) => row.id,
      loadPage: async () => ({
        rows: [],
        totalCount: 25,
        continueCursor: "same-cursor",
        isDone: false,
      }),
    })).rejects.toThrow("community_directory_cursor_stalled");
  });

  it("abandons a directory window as soon as a newer refresh owns the scope", async () => {
    let isCurrent = true;
    const result = await loadCommunityDirectoryWindow({
      targetRowCount: 92,
      getRowKey: (row: Row) => row.id,
      isCurrent: () => isCurrent,
      loadPage: async () => {
        isCurrent = false;
        return {
          rows: rows(92),
          totalCount: 92,
          continueCursor: null,
          isDone: true,
        };
      },
    });

    expect(result).toBeNull();
  });

  it("lets only the latest forced request commit for each profile", () => {
    const registry = createProfileHydrationRequestRegistry();
    const older = beginProfileHydrationRequest(registry, ["user-a"], { force: true });
    const newer = beginProfileHydrationRequest(registry, ["user-a"], { force: true });
    expect(older).not.toBeNull();
    expect(newer).not.toBeNull();

    expect(Array.from(finishProfileHydrationRequest(
      registry,
      older!,
      { successful: true },
    ))).toEqual([]);
    expect(Array.from(finishProfileHydrationRequest(
      registry,
      newer!,
      { successful: true },
    ))).toEqual(["user-a"]);
  });

  it("deduplicates in-flight hydration while allowing disjoint profile batches", () => {
    const registry = createProfileHydrationRequestRegistry();
    const first = beginProfileHydrationRequest(registry, ["user-a"]);
    const duplicate = beginProfileHydrationRequest(registry, ["user-a"]);
    const disjoint = beginProfileHydrationRequest(registry, ["user-b"]);
    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(disjoint).not.toBeNull();

    expect(Array.from(finishProfileHydrationRequest(
      registry,
      first!,
      { successful: true },
    ))).toEqual(["user-a"]);
    expect(Array.from(finishProfileHydrationRequest(
      registry,
      disjoint!,
      { successful: true },
    ))).toEqual(["user-b"]);
  });

  it("releases failed requests for retry without marking them hydrated", () => {
    const registry = createProfileHydrationRequestRegistry();
    const failed = beginProfileHydrationRequest(registry, ["user-a"]);
    expect(failed).not.toBeNull();
    finishProfileHydrationRequest(registry, failed!, { successful: false });
    expect(beginProfileHydrationRequest(registry, ["user-a"])).not.toBeNull();
  });

  it("does not reissue a completed profile hydration during render churn", () => {
    const registry = createProfileHydrationRequestRegistry();
    const first = beginProfileHydrationRequest(registry, ["user-a"]);
    expect(first).not.toBeNull();
    finishProfileHydrationRequest(registry, first!, { successful: true });

    for (let rerender = 0; rerender < 25; rerender += 1) {
      expect(beginProfileHydrationRequest(registry, ["user-a"])).toBeNull();
    }
  });

  it("wires scope guards and keeps image loading outside data commits", () => {
    const directory = read("shared/useCommunityDirectoryController.ts");
    const access = read("shared/useWebCommunityAccessController.ts");
    const admin = read("shared/useCommunityAdminController.ts");
    const communityProfiles = read(
      "apps/web/src/controllers/useWebCommunityProfileHydrationController.ts",
    );

    expect(directory).toContain("listCloudCommunityDirectoryWindow");
    expect(directory).toContain("communityDirectoryMembersRef.current.length");
    expect(directory).toContain("communityDirectoryLoadSeqRef.current === seq");
    expect(directory).toContain("communityDirectoryLoadSeqRef.current !== seq");
    expect(directory).not.toContain("loadMoreCommunityDirectoryMembers");
    expect(access).toContain("profileRequestRegistryRef.current !== registry");
    expect(access).toContain("loadingResetKey");
    expect(admin).toContain("selfProfileLoadSeqRef.current !== seq");
    expect(admin).toContain("resolveCanonicalProfileUserId(argsRef.current.session) !== profileUserId");
    expect(communityProfiles).toContain(
      "ids.delete(params.canonicalSessionUserId)",
    );
    expect(communityProfiles).not.toContain("loadSelfProfile");
    expect(access).not.toContain("preloadImageUrls");
    expect(admin).not.toContain("preloadImageUrls");
  });

  it("retires the cached provider-connections read that amplified the incident", () => {
    const compatibility = read(
      "shared/contracts/cached_production_client_compatibility_v1.json",
    );

    // The whole module is gone now (POL-10), which retires the read for good.
    expect(existsSync("convex/providerConnections.ts")).toBe(false);
    expect(compatibility).not.toContain(
      "providerConnections:getCurrentUserProviderConnections",
    );
  });
});
