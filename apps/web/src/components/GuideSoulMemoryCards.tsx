import { useEffect, useState } from "react";
import {
  getCloudCommunityGuideSoulAndMemory,
  getCloudMyGuideSoulAndMemory,
  saveCloudCommunityGuideSoul,
  saveCloudMyGuideMemory,
  saveCloudMyGuideSoul,
  type CommunityGuideSoulMemoryView,
  type MyGuideSoulMemoryView,
} from "../../../../shared/cloudGuideSoulMemoryGateway";
import type { PersonalMemoryCategory } from "../../../../shared/personalMemory";
import { SettingsButton, SettingsGroup } from "./SettingsRows";

type Props = {
  mode: "personal" | "community";
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
};

const GROUPS: Array<{ key: PersonalMemoryCategory; label: string }> = [
  { key: "fact", label: "Facts" },
  { key: "preference", label: "Preferences" },
  { key: "commitment", label: "Commitments" },
];

function shortDate(ms: number | null, fallback: string): string {
  if (!ms || !Number.isFinite(ms)) return fallback;
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

export function GuideSoulMemoryCards(props: Props) {
  const [personal, setPersonal] = useState<MyGuideSoulMemoryView | null>(null);
  const [community, setCommunity] = useState<CommunityGuideSoulMemoryView | null>(null);
  const [openCard, setOpenCard] = useState<"soul" | "memory" | null>(null);
  const [soulDraft, setSoulDraft] = useState("");
  const [newEntryText, setNewEntryText] = useState("");
  const [newEntryCategory, setNewEntryCategory] = useState<PersonalMemoryCategory>("fact");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPersonal(null);
    setCommunity(null);
    setOpenCard(null);
    setError(null);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        if (!session) return;
        if (props.mode === "personal") {
          const data = await getCloudMyGuideSoulAndMemory({ session, communityId: props.communityId });
          if (!cancelled) {
            setPersonal(data);
            setSoulDraft(data.soul_md);
          }
        } else {
          const data = await getCloudCommunityGuideSoulAndMemory({ session, communityId: props.communityId });
          if (!cancelled) {
            setCommunity(data);
            setSoulDraft(data.soul_md);
          }
        }
      } catch {
        if (!cancelled) setError("Couldn't load guide soul and memory.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId, props.mode]);

  const active = props.mode === "personal" ? personal : community;
  const soulUpdatedAt = active?.soul_updated_at ?? null;
  const soulUpdatedBy = active?.soul_updated_by ?? null;
  const soulIsDefault = active ? active.soul_is_default : true;
  const soulMaxChars = active?.soul_max_chars ?? 1_600;
  const memoryUpdatedAt = active?.memory_updated_at ?? null;

  const saveSoul = async (next: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      if (props.mode === "personal") {
        const updated = await saveCloudMyGuideSoul({ session, communityId: props.communityId, soulMd: next });
        setPersonal(updated);
        setSoulDraft(updated.soul_md);
      } else {
        const updated = await saveCloudCommunityGuideSoul({ session, communityId: props.communityId, soulMd: next });
        setCommunity(updated);
        setSoulDraft(updated.soul_md);
      }
    } catch (failure) {
      const msg = String((failure as Error)?.message ?? "");
      setError(msg.includes("soul_too_long") ? `Keep Soul under ${soulMaxChars} characters.` : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const runPersonalMemoryOp = async (
    operation:
      | { action: "add"; text: string; category: PersonalMemoryCategory }
      | { action: "remove"; text: string }
      | { action: "clear" },
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      const updated = await saveCloudMyGuideMemory({
        session,
        communityId: props.communityId,
        operation,
      });
      setPersonal(updated);
      if (operation.action === "add") setNewEntryText("");
    } catch (failure) {
      const msg = String((failure as Error)?.message ?? "");
      setError(msg.includes("memory_full") ? "Memory is full — remove or shorten an item first." : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const groupLabel = props.mode === "personal" ? "Your guide here" : "Community soul & memory";
  const soulMeta = soulIsDefault
    ? "Starter"
    : `${shortDate(soulUpdatedAt, "Saved")}${soulUpdatedBy === "guide" ? " · Refined by guide" : ""}`;
  const memoryMeta =
    props.mode === "personal"
      ? personal?.entries.length
        ? `${shortDate(memoryUpdatedAt, "Saved")} · ${personal.entries.length} ${personal.entries.length === 1 ? "item" : "items"}`
        : "Empty"
      : community?.memory_note_count
        ? `${shortDate(memoryUpdatedAt, "Saved")} · ${community.memory_note_count} ${community.memory_note_count === 1 ? "note" : "notes"}`
        : "Empty";

  return (
    <SettingsGroup label={groupLabel}>
      <div className="guide-sm-wrap">
        <div className="guide-sm-grid">
          <button
            type="button"
            className={`guide-sm-card is-soul${openCard === "soul" ? " is-open" : ""}`}
            aria-expanded={openCard === "soul"}
            onClick={() => setOpenCard((cur) => (cur === "soul" ? null : "soul"))}
          >
            <span className="guide-sm-title">SOUL</span>
            <span className="guide-sm-sub">ACCESS WITH CARE</span>
            <span className="guide-sm-foot">{active ? soulMeta : "Loading…"}</span>
          </button>
          <button
            type="button"
            className={`guide-sm-card is-memory${openCard === "memory" ? " is-open" : ""}`}
            aria-expanded={openCard === "memory"}
            onClick={() => setOpenCard((cur) => (cur === "memory" ? null : "memory"))}
          >
            <span className="guide-sm-title">MEMORY</span>
            <span className="guide-sm-sub">ACCESS WITH CARE</span>
            <span className="guide-sm-foot">{active ? memoryMeta : "Loading…"}</span>
          </button>
        </div>

        {error ? <p className="settings-v1-error" role="alert">{error}</p> : null}

        {openCard === "soul" && active ? (
          <div className="guide-sm-panel">
            <p className="guide-sm-note">
              {props.mode === "personal"
                ? "Your guide's persona and working habits with you in this community. It may refine this over time and tells you when it does. Strictly private to you."
                : "Your guide's living voice and habits in shared channels and pods. May refine itself during nightly reviews; your Identity and standing rules always stay on top."}
            </p>
            <textarea
              className="settings-v1-input"
              rows={7}
              maxLength={soulMaxChars}
              value={soulDraft}
              disabled={busy}
              onChange={(event) => setSoulDraft(event.target.value)}
            />
            <div className="guide-sm-actions">
              <span className="guide-sm-count">{soulDraft.length}/{soulMaxChars}</span>
              <div className="guide-sm-btns">
                {!soulIsDefault ? (
                  <SettingsButton disabled={busy} onClick={() => void saveSoul(null)}>Reset</SettingsButton>
                ) : null}
                <SettingsButton
                  variant="primary"
                  disabled={busy || !soulDraft.trim() || soulDraft.trim() === active.soul_md.trim()}
                  onClick={() => void saveSoul(soulDraft)}
                >
                  {busy ? "Saving…" : "Save Soul"}
                </SettingsButton>
              </div>
            </div>
          </div>
        ) : null}

        {openCard === "memory" && props.mode === "personal" && personal ? (
          <div className="guide-sm-panel">
            <p className="guide-sm-note">
              Durable facts, preferences, and commitments your guide remembers from your private talks here. Only you can see or edit this.
            </p>
            {personal.entries.length === 0 ? (
              <p className="guide-sm-empty">Nothing saved yet. Tell your guide what you are working on, or add an item below.</p>
            ) : (
              <div className="guide-sm-groups">
                {GROUPS.map((group) => {
                  const items = personal.entries
                    .map((entry, index) => ({ ...entry, index }))
                    .filter((entry) => entry.category === group.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={group.key} className="guide-sm-group">
                      <span className="guide-sm-group-label">{group.label}</span>
                      {items.map((item) => (
                        <div key={`${item.index}:${item.text}`} className="guide-sm-entry">
                          <span>{item.text}</span>
                          <button
                            type="button"
                            className="guide-sm-del"
                            disabled={busy}
                            aria-label={`Remove ${item.text}`}
                            onClick={() =>
                              void runPersonalMemoryOp({ action: "remove", text: item.text })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="guide-sm-add">
              <select
                className="settings-v1-select"
                value={newEntryCategory}
                disabled={busy}
                aria-label="Memory category"
                onChange={(event) => setNewEntryCategory(event.target.value as PersonalMemoryCategory)}
              >
                {GROUPS.map((group) => (
                  <option key={group.key} value={group.key}>{group.label.slice(0, -1)}</option>
                ))}
              </select>
              <input
                className="settings-v1-input"
                type="text"
                maxLength={500}
                placeholder="Add a fact, preference, or commitment…"
                value={newEntryText}
                disabled={busy}
                onChange={(event) => setNewEntryText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && newEntryText.trim()) {
                    event.preventDefault();
                    void runPersonalMemoryOp({
                      action: "add",
                      text: newEntryText.trim(),
                      category: newEntryCategory,
                    });
                  }
                }}
              />
              <SettingsButton
                disabled={busy || !newEntryText.trim()}
                onClick={() =>
                  void runPersonalMemoryOp({
                    action: "add",
                    text: newEntryText.trim(),
                    category: newEntryCategory,
                  })
                }
              >
                Add
              </SettingsButton>
            </div>
            <div className="guide-sm-actions">
              <span className="guide-sm-count">{personal.memory_chars}/{personal.memory_max_chars} chars</span>
              {personal.entries.length > 0 ? (
                <SettingsButton disabled={busy} onClick={() => void runPersonalMemoryOp({ action: "clear" })}>Clear all</SettingsButton>
              ) : null}
            </div>
          </div>
        ) : null}

        {openCard === "memory" && props.mode === "community" && community ? (
          <div className="guide-sm-panel">
            <p className="guide-sm-note">
              What your guide has learned from open channels for everyone in this community. Updates overnight when members post; manage individual notes in Knowledge.
            </p>
            <div className="guide-sm-readonly">
              {community.memory_summary_md || "No shared community memories learned yet."}
            </div>
          </div>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
