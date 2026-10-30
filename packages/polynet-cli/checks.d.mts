// Types for checks.mjs, which Polynet's backend imports too.
export type SiteProblem = { path: string; message: string };
export type SiteCheckResult = { errors: SiteProblem[]; warnings: SiteProblem[] };
export function isCheckedFile(path: string): boolean;
export function isEmbedPage(path: string, embeds?: Set<string>): boolean;
export function checkSite(files: Array<{ path: string; text: string }>, options?: { embeds?: Set<string> }): SiteCheckResult;
export function formatProblems(result: SiteCheckResult): string[];
export type StandardPage = {
  path: string; name: string; title: string; blocks: string[]; members?: boolean; network?: boolean;
  below: Array<[name: string, pattern: RegExp]>;
};
export const STANDARD_PAGES: StandardPage[];
export const MEMBER_HANDLE: RegExp;
export const EVENT_ID: RegExp;
export const LEARN_SEGMENT: RegExp;
export function standardPage(pathname: string): { page: StandardPage; below: string[]; handle: string | null; slash: boolean } | null;
export type PersonalPage = { path: string; name: string; title: string; ready: boolean; signIn: boolean; below: Array<[name: string, pattern: RegExp]> };
export const CONVERSATION_SEGMENT: RegExp;
export const PERSONAL_PAGES: PersonalPage[];
export function personalPage(pathname: string): PersonalPage | null;
export const PRIVATE_TWIN_MARK: string;
export function siteSlugShapeOk(slug: string): boolean;
export function privateTwinHost(siteHost: string, sitesDomain: string, hostSuffix?: string): string | null;
export function siteHostOfTwin(twinHost: string, sitesDomain: string, hostSuffix?: string): string | null;
