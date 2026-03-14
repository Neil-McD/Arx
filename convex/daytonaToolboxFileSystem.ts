import { daytonaHeaders, type DaytonaConfig } from "./daytonaSandboxClient";
import {
  buildDaytonaToolboxBaseCandidates,
  shouldRetryWithAlternateToolboxBase,
} from "./daytonaToolboxExecutor";

type DaytonaFsFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type DaytonaFsSuccess<T> = {
  ok: true;
  value: T;
};

type DaytonaFsResult<T> = DaytonaFsSuccess<T> | DaytonaFsFailure;

type DaytonaFileInfoDto = {
  name?: unknown;
  path?: unknown;
  isDirectory?: unknown;
  isDir?: unknown;
  size?: unknown;
};

function normalizeUrlPath(pathname: string): string {
  const cleaned = String(pathname ?? "").trim();
  if (!cleaned || cleaned === "/") return "/";
  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function joinUrlPath(pathname: string, ...segments: string[]): string {
  const base = normalizeUrlPath(pathname).replace(/^\/+|\/+$/g, "");
  const normalizedSegments = segments
    .map((segment) => String(segment ?? "").trim().replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  const parts = [base, ...normalizedSegments].filter((part) => part.length > 0);
  return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

function buildToolboxFileCandidates(toolboxProxyUrl: string, sandboxId: string): string[] {
  return buildDaytonaToolboxBaseCandidates(toolboxProxyUrl, sandboxId).map((baseUrl) => {
    const parsed = new URL(baseUrl);
    parsed.pathname = joinUrlPath(parsed.pathname, "files");
    return parsed.toString().replace(/\/+$/, "");
  });
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function requestToolboxFile<T>(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  pathSuffix?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  method: "GET" | "POST";
  body?: BodyInit;
  json?: boolean;
  headers?: Record<string, string>;
  expectText?: boolean;
}): Promise<DaytonaFsResult<T>> {
  const candidates = buildToolboxFileCandidates(params.toolboxProxyUrl, params.sandboxId);
  let lastFailure: DaytonaFsFailure | null = null;

  for (const candidate of candidates) {
    const url = new URL(candidate);
    if (params.pathSuffix) {
      url.pathname = joinUrlPath(url.pathname, params.pathSuffix);
    }
    for (const [key, value] of Object.entries(params.query ?? {})) {
      if (value === null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    const headers = {
      ...daytonaHeaders(params.config, params.json === true),
      ...(params.headers ?? {}),
    };
    if (params.body instanceof FormData) {
      delete headers["Content-Type"];
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: params.method,
        headers,
        ...(params.body ? { body: params.body } : null),
      });
    } catch (error) {
      lastFailure = {
        ok: false,
        status: 503,
        code: "runner_unavailable",
        message: error instanceof Error ? error.message : "Failed to call Daytona toolbox file API.",
      };
      continue;
    }

    if (!response.ok) {
      const text = await readResponseText(response);
      const retryable = shouldRetryWithAlternateToolboxBase(response.status, text);
      lastFailure = {
        ok: false,
        status: response.status,
        code: response.status === 404 ? "file_not_found" : "runner_unavailable",
        message: `Daytona toolbox file request failed (${response.status}).`,
        details: {
          response_text: text.slice(0, 2000),
          url: url.toString(),
        },
      };
      if (retryable) {
        continue;
      }
      continue;
    }

    if (params.expectText) {
      const text = await response.text();
      return { ok: true, value: text as T };
    }
    const text = await response.text();
    if (!text.trim()) return { ok: true, value: null as T };
    try {
      return { ok: true, value: JSON.parse(text) as T };
    } catch {
      return {
        ok: false,
        status: 503,
        code: "runner_unavailable",
        message: "Daytona toolbox file API returned invalid JSON.",
        details: {
          response_text: text.slice(0, 2000),
          url: url.toString(),
        },
      };
    }
  }

  return (
    lastFailure ?? {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona toolbox file API failed with no usable endpoint.",
    }
  );
}

export async function getDaytonaToolboxFileInfo(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  path: string;
}): Promise<DaytonaFsResult<{ exists: boolean; isDirectory: boolean; size: number | null }>> {
  const result = await requestToolboxFile<DaytonaFileInfoDto>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    pathSuffix: "info",
    query: { path: params.path },
    method: "GET",
  });
  if (!result.ok) {
    if (result.status === 404 || result.code === "file_not_found") {
      return { ok: true, value: { exists: false, isDirectory: false, size: null } };
    }
    return result;
  }
  const value = result.value ?? {};
  const sizeRaw = Number((value as DaytonaFileInfoDto).size);
  return {
    ok: true,
    value: {
      exists: true,
      isDirectory: Boolean((value as DaytonaFileInfoDto).isDirectory ?? (value as DaytonaFileInfoDto).isDir),
      size: Number.isFinite(sizeRaw) ? sizeRaw : null,
    },
  };
}

export async function createDaytonaToolboxFolder(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  path: string;
  mode?: string;
}): Promise<DaytonaFsResult<null>> {
  return await requestToolboxFile<null>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    pathSuffix: "folder",
    query: { path: params.path, mode: params.mode ?? "755" },
    method: "POST",
  });
}

export async function uploadDaytonaToolboxFile(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  path: string;
  content: string;
}): Promise<DaytonaFsResult<null>> {
  const form = new FormData();
  form.set("file", new Blob([params.content], { type: "text/plain; charset=utf-8" }), "upload.txt");
  return await requestToolboxFile<null>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    pathSuffix: "upload",
    query: { path: params.path },
    method: "POST",
    body: form,
  });
}

export async function downloadDaytonaToolboxFileText(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  path: string;
}): Promise<DaytonaFsResult<string>> {
  return await requestToolboxFile<string>({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    pathSuffix: "download",
    query: { path: params.path },
    method: "GET",
    expectText: true,
  });
}
