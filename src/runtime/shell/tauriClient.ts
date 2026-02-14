import { invoke } from "@tauri-apps/api/core";
import type {
  ShellAttachmentResult,
  DesktopShellClient,
  NativeVoiceCaptureStopped,
  ShellChatgptAuthSummary,
  ShellModelToggle,
  ShellPendingInviteRecord,
  ShellSecretScanResult,
} from "./client";

export class TauriDesktopShellClient implements DesktopShellClient {
  async resetLocalDb(): Promise<void> {
    await invoke("reset_local_db_cmd");
  }

  async getSystemPrompt(): Promise<string | null> {
    return invoke<string | null>("get_system_prompt_cmd");
  }

  async setSystemPrompt(prompt: string): Promise<void> {
    await invoke("set_system_prompt_cmd", { prompt });
  }

  async getModelToggles(): Promise<ShellModelToggle[]> {
    return invoke<ShellModelToggle[]>("get_model_toggles_cmd");
  }

  async setModelToggles(toggles: ShellModelToggle[]): Promise<void> {
    await invoke("set_model_toggles_cmd", { toggles });
  }

  async getActiveModel(): Promise<string | null> {
    return invoke<string | null>("get_active_model_cmd");
  }

  async getChatgptAuthSummary(): Promise<ShellChatgptAuthSummary | null> {
    return invoke<ShellChatgptAuthSummary | null>("get_chatgpt_auth_summary_cmd");
  }

  async chatgptLogin(): Promise<ShellChatgptAuthSummary> {
    return invoke<ShellChatgptAuthSummary>("chatgpt_login_cmd");
  }

  async clearChatgptAuth(): Promise<void> {
    await invoke("clear_chatgpt_auth_cmd");
  }

  async getExecPolicyRules(): Promise<string | null> {
    return invoke<string | null>("get_exec_policy_rules_cmd");
  }

  async getApprovalMode(): Promise<string | null> {
    return invoke<string | null>("get_approval_mode_cmd");
  }

  async getSupabaseSession(): Promise<string | null> {
    return invoke<string | null>("get_supabase_session_cmd");
  }

  async setSupabaseSession(session_json: string): Promise<void> {
    await invoke("set_supabase_session_cmd", { sessionJson: session_json });
  }

  async clearSupabaseSession(): Promise<void> {
    await invoke("clear_supabase_session_cmd");
  }

  async listPendingInvites(): Promise<ShellPendingInviteRecord[]> {
    return invoke<ShellPendingInviteRecord[]>("list_pending_invites_cmd");
  }

  async upsertPendingInvite(args: { invite_key: string; source: "url" | "manual" | string }): Promise<void> {
    await invoke("upsert_pending_invite_cmd", {
      inviteKey: args.invite_key,
      source: args.source,
    });
  }

  async dismissPendingInvite(invite_key: string): Promise<void> {
    await invoke("dismiss_pending_invite_cmd", { inviteKey: invite_key });
  }

  async requestJoinPendingInvite(invite_key: string): Promise<void> {
    await invoke("request_join_pending_invite_cmd", { inviteKey: invite_key });
  }

  async markPendingInviteJoined(args: {
    invite_key: string;
    community_id: string;
    community_name: string;
  }): Promise<void> {
    await invoke("mark_pending_invite_joined_cmd", {
      inviteKey: args.invite_key,
      communityId: args.community_id,
      communityName: args.community_name,
    });
  }

  async markPendingInviteExpired(invite_key: string): Promise<void> {
    await invoke("mark_pending_invite_expired_cmd", { inviteKey: invite_key });
  }

  async openExternalUrl(url: string): Promise<void> {
    await invoke("open_external_url_cmd", { url });
  }

  async ingestAttachment(path: string): Promise<ShellAttachmentResult> {
    return invoke<ShellAttachmentResult>("ingest_attachment_cmd", { path });
  }

  async scanPublishContent(text: string): Promise<ShellSecretScanResult> {
    return invoke<ShellSecretScanResult>("scan_publish_content_cmd", { text });
  }

  async startNativeVoiceCapture(): Promise<void> {
    await invoke("start_native_voice_capture_cmd");
  }

  async cancelNativeVoiceCapture(): Promise<void> {
    await invoke("cancel_native_voice_capture_cmd");
  }

  async stopNativeVoiceCapture(): Promise<NativeVoiceCaptureStopped> {
    return invoke<NativeVoiceCaptureStopped>("stop_native_voice_capture_cmd");
  }
}
