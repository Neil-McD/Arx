export type CloudAuthFetch<SessionT> = (
  url: string,
  init: RequestInit,
  session: SessionT,
) => Promise<Response>;

export type CloudPublicFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type CloudReadError = (response: Response) => Promise<string>;
