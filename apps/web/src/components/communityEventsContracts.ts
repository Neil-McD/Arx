import type {
  CloudCommunityEvent,
  CloudCommunityEventSavePayload,
} from "../../../../shared/cloudCommunityEventsGateway";
import type { CommunityEventsRange } from "../../../../shared/useCommunityEventsController";

export type { CloudCommunityEvent as CommunityEvent };

export type CommunityEventsCapabilities = {
  hasActiveCommunity: boolean;
  activeCommunityName: string | null;
  canManageEvents: boolean;
};

export type CommunityEventsState = {
  events: CloudCommunityEvent[];
  isLoadingEvents: boolean;
  hasLoadedVisibleRange?: boolean;
  eventsError: string | null;
  visibleMonthIso: string;
};

export type CommunityEventsActions = {
  setVisibleMonthIso: (value: string) => void;
  getVisibleRange: (monthIso: string) => CommunityEventsRange;
  reloadEvents: (range: CommunityEventsRange) => Promise<void>;
  saveEvent: (
    eventId: string | null,
    payload: CloudCommunityEventSavePayload,
    range: CommunityEventsRange,
  ) => Promise<boolean>;
  cancelEvent: (eventId: string, range: CommunityEventsRange) => Promise<boolean>;
};
