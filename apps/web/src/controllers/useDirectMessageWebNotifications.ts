import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DirectMessageNotificationsUiState,
  IncomingDirectMessageEvent,
} from "../components/WebDirectMessagesHost";

const NOTIFICATIONS_STORAGE_KEY = "polynet.dm.notifications";
const SOUND_THROTTLE_PER_CONVERSATION_MS = 30_000;
const NOTIFY_LOCK_HOLD_MS = 3_000;

type UseDirectMessageWebNotificationsArgs = {
  isEnabled: boolean;
  unreadCount: number;
  onOpenConversation: (conversationId: string) => void;
};

type UseDirectMessageWebNotificationsResult = {
  notificationsState: DirectMessageNotificationsUiState;
  notifyIncoming: (event: IncomingDirectMessageEvent) => void;
  toggleNotifications: () => void;
};

function readStoredMasterEnabled(): boolean {
  try {
    return window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function useDirectMessageWebNotifications(
  args: UseDirectMessageWebNotificationsArgs,
): UseDirectMessageWebNotificationsResult {
  const [isMasterEnabled, setIsMasterEnabled] = useState(() =>
    typeof window === "undefined" ? true : readStoredMasterEnabled(),
  );
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    readNotificationPermission,
  );
  const isMasterEnabledRef = useRef(isMasterEnabled);
  const isEnabledRef = useRef(args.isEnabled);
  const onOpenConversationRef = useRef(args.onOpenConversation);
  const soundPlayedAtByConversationRef = useRef<Record<string, number>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const baseTitleRef = useRef<string | null>(null);
  const faviconRef = useRef<{ link: HTMLLinkElement; originalHref: string } | null>(null);

  useEffect(() => {
    isMasterEnabledRef.current = isMasterEnabled;
  }, [isMasterEnabled]);
  useEffect(() => {
    isEnabledRef.current = args.isEnabled;
  }, [args.isEnabled]);
  useEffect(() => {
    onOpenConversationRef.current = args.onOpenConversation;
  }, [args.onOpenConversation]);

  const updateFaviconDot = useCallback((showDot: boolean) => {
    try {
      const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
      if (!link) return;
      if (!faviconRef.current) {
        faviconRef.current = { link, originalHref: link.href };
      }
      const state = faviconRef.current;
      if (!showDot) {
        state.link.href = state.originalHref;
        return;
      }
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const size = 32;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(image, 0, 0, size, size);
          const radius = 7;
          context.beginPath();
          context.arc(size - radius - 1, radius + 1, radius, 0, Math.PI * 2);
          context.fillStyle = "#d66a8a";
          context.fill();
          state.link.href = canvas.toDataURL("image/png");
        } catch {
          // Tainted canvas or draw failure: the tab title still carries the badge.
        }
      };
      image.onerror = () => {};
      image.src = state.originalHref;
    } catch {
      // Favicon badge is decorative.
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (baseTitleRef.current === null) {
      baseTitleRef.current = document.title;
    }
    const baseTitle = baseTitleRef.current;
    const count = args.isEnabled ? Math.max(0, Math.floor(args.unreadCount)) : 0;
    document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${baseTitle}` : baseTitle;
    updateFaviconDot(count > 0);
  }, [args.isEnabled, args.unreadCount, updateFaviconDot]);

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined" && baseTitleRef.current !== null) {
        document.title = baseTitleRef.current;
      }
      if (faviconRef.current) {
        faviconRef.current.link.href = faviconRef.current.originalHref;
      }
      void audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  const playIncomingSound = useCallback((conversationId: string) => {
    const nowMs = Date.now();
    const lastPlayedAt = soundPlayedAtByConversationRef.current[conversationId] ?? 0;
    if (nowMs - lastPlayedAt < SOUND_THROTTLE_PER_CONVERSATION_MS) return;
    soundPlayedAtByConversationRef.current[conversationId] = nowMs;
    try {
      const AudioContextCtor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }
      const context = audioContextRef.current;
      if (context.state === "suspended") {
        // Autoplay policy: resume for next time; skip this blip.
        void context.resume().catch(() => {});
        return;
      }
      const playTone = (frequency: number, offsetSeconds: number) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        const startAt = context.currentTime + offsetSeconds;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.05, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.2);
      };
      playTone(740, 0);
      playTone(988, 0.09);
    } catch {
      // Sound is decorative.
    }
  }, []);

  const notifyIncoming = useCallback(
    (event: IncomingDirectMessageEvent) => {
      if (typeof window === "undefined") return;
      if (!isEnabledRef.current || !isMasterEnabledRef.current) return;

      const performNotification = () => {
        playIncomingSound(event.conversationId);
        const isAway = document.visibilityState === "hidden" || !document.hasFocus();
        if (
          isAway &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            const notification = new Notification(event.peerDisplayName, {
              body: event.previewText,
              tag: `polynet-dm-${event.conversationId}`,
              ...(event.peerAvatarUrl ? { icon: event.peerAvatarUrl } : null),
            });
            notification.onclick = () => {
              try {
                window.focus();
              } catch {
                // Focus can be refused; opening the thread still applies.
              }
              onOpenConversationRef.current(event.conversationId);
              notification.close();
            };
          } catch {
            // Banner is best-effort; sound and badge already fired.
          }
        }
      };

      // One notifier across open tabs: first tab wins the lock and holds it
      // briefly so the others see it unavailable and stay quiet.
      const locks = (navigator as { locks?: LockManager }).locks;
      if (locks?.request) {
        void locks
          .request(
            `polynet-dm-notify:${event.conversationId}:${event.lastSeq}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock) return;
              performNotification();
              await new Promise((resolve) => setTimeout(resolve, NOTIFY_LOCK_HOLD_MS));
            },
          )
          .catch(() => {
            performNotification();
          });
        return;
      }
      performNotification();
    },
    [playIncomingSound],
  );

  const toggleNotifications = useCallback(() => {
    const next = !isMasterEnabledRef.current;
    try {
      window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Preference persistence is best-effort.
    }
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission()
        .then((result) => setPermission(result))
        .catch(() => {});
    }
    setIsMasterEnabled(next);
  }, []);

  const notificationsState: DirectMessageNotificationsUiState = !args.isEnabled
    ? "hidden"
    : !isMasterEnabled
      ? "off"
      : permission === "denied"
        ? "blocked"
        : "on";

  return {
    notificationsState,
    notifyIncoming,
    toggleNotifications,
  };
}
