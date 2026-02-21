export type ShellModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
};

export type ShellChatgptAuthSummary = {
  email?: string | null;
  account_id?: string | null;
  access_token_expires_at?: number | null;
};

export type ShellChatgptCloudTurnMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ShellChatgptCloudTurnResult = {
  text: string;
  model_id: string;
  inference_source: string;
};

export type ShellPendingInviteRecord = {
  invite_key: string;
  status: "pending" | "dismissed" | "joined" | "expired" | string;
  first_seen_at: number;
  updated_at: number;
  dismissed_at: number | null;
  join_intent_at: number | null;
  joined_at: number | null;
  expired_at: number | null;
  community_id: string | null;
  community_name: string | null;
  source: string | null;
};

export type NativeVoiceCaptureStopped = {
  audio_base64: string;
  mime_type: string;
  sample_rate_hz: number;
  duration_ms: number;
  rms: number;
  peak: number;
  speech_ratio: number;
  speech_detected: boolean;
};

export type ShellAttachmentResult = {
  id: string;
  path: string;
  name: string;
  file_type: "image" | "file";
  size: number;
  preview_data_url: string | null;
};

export type ShellSecretScanRedaction = {
  kind: string;
  count: number;
};

export type ShellSecretScanResult = {
  redacted: string;
  blocked: boolean;
  redactions: ShellSecretScanRedaction[];
};

export interface DesktopShellClient {
  resetLocalDb(): Promise<void>;

  getSystemPrompt(): Promise<string | null>;
  setSystemPrompt(prompt: string): Promise<void>;

  getModelToggles(): Promise<ShellModelToggle[]>;
  setModelToggles(toggles: ShellModelToggle[]): Promise<void>;
  getActiveModel(): Promise<string | null>;

  getChatgptAuthSummary(): Promise<ShellChatgptAuthSummary | null>;
  chatgptLogin(): Promise<ShellChatgptAuthSummary>;
  clearChatgptAuth(): Promise<void>;
  chatgptCloudTurn(args: {
    model_id: string;
    messages: ShellChatgptCloudTurnMessage[];
    max_tokens?: number | null;
  }): Promise<ShellChatgptCloudTurnResult>;

  getExecPolicyRules(): Promise<string | null>;
  getApprovalMode(): Promise<string | null>;

  getSupabaseSession(): Promise<string | null>;
  setSupabaseSession(session_json: string): Promise<void>;
  clearSupabaseSession(): Promise<void>;

  listPendingInvites(): Promise<ShellPendingInviteRecord[]>;
  upsertPendingInvite(args: { invite_key: string; source: "url" | "manual" | string }): Promise<void>;
  dismissPendingInvite(invite_key: string): Promise<void>;
  requestJoinPendingInvite(invite_key: string): Promise<void>;
  markPendingInviteJoined(args: {
    invite_key: string;
    community_id: string;
    community_name: string;
  }): Promise<void>;
  markPendingInviteExpired(invite_key: string): Promise<void>;

  openExternalUrl(url: string): Promise<void>;
  ingestAttachment(path: string): Promise<ShellAttachmentResult>;
  scanPublishContent(text: string): Promise<ShellSecretScanResult>;

  startNativeVoiceCapture(): Promise<void>;
  cancelNativeVoiceCapture(): Promise<void>;
  stopNativeVoiceCapture(): Promise<NativeVoiceCaptureStopped>;
}
