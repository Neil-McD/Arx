const DEFAULT_ARX_OWNER_EMAILS = ["neilmcdevitt@gmail.com", "neilmcdevittd@gmail.com"] as const;

type ArxOwnerEmailSetArgs = {
  ownerEmailsCsv?: string | null;
  ownerEmail?: string | null;
  defaultOwnerEmails?: readonly string[];
};

type ArxOwnerUserIdSetArgs = {
  ownerUserIdsCsv?: string | null;
  ownerUserId?: string | null;
};

export function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export function getArxOwnerEmailSet(args: ArxOwnerEmailSetArgs = {}): Set<string> {
  const configuredList = (args.ownerEmailsCsv ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  const configuredSingle = (args.ownerEmail ?? "").trim().toLowerCase();
  const base =
    configuredList.length > 0 ? configuredList : [...(args.defaultOwnerEmails ?? DEFAULT_ARX_OWNER_EMAILS)];
  if (configuredSingle) base.push(configuredSingle);
  return new Set(base);
}

export function getArxOwnerUserIdSet(args: ArxOwnerUserIdSetArgs = {}): Set<string> {
  const configuredList = (args.ownerUserIdsCsv ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const configuredSingle = (args.ownerUserId ?? "").trim();
  if (configuredSingle) configuredList.push(configuredSingle);
  return new Set(configuredList);
}
