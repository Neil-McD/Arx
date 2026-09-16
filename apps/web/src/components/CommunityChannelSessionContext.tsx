import { createContext } from "react";

// Credentials stay in the existing authenticated community surface. Descendant
// settings and file controls never read global browser storage or copy tokens.
export const CommunityChannelSessionContext = createContext<{
  session: unknown; communityId: string;
} | null>(null);
