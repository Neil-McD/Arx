import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Plus, RefreshCw, Trash2, X } from "lucide-react";

import {
  COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT,
  COMMUNITY_LAYOUT_ABOUT_TEXT_LIMIT,
  isCommunityLayoutVideoUrl,
} from "../../../../shared/communityLayout";
import { SalesPageGallery, type SalesPageMediaItem } from "./WebCommunitySalesPage";

// The sales page edited where it sits (About tab › Edit page): a "+" on the
// gallery, replace / move / remove on the slide shown, its caption, and the
// text under the media. Every change saves to the layout draft, the same one
// Funnels › Sales page and an agent's layout.json edit; the edit bar publishes.

export type SalesPageEditControls = {
  busy: boolean;
  saveMedia: (media: SalesPageMediaItem[]) => Promise<boolean>;
  saveText: (text: string) => Promise<boolean>;
  uploadImage: (file: File) => Promise<string>;
  // What the page shows under the media while it has no text of its own, so
  // the owner starts from it instead of a blank box.
  fallbackText: string;
};

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// Upload a picture or paste a link (a YouTube, Vimeo, Loom, Wistia or Descript
// link is a video; anything else a picture).
function SalesMediaPicker(props: {
  title: string;
  edit: SalesPageEditControls;
  onPick: (item: SalesPageMediaItem) => Promise<boolean>;
  onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => linkInput.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  const addLink = async () => {
    const url = link.trim();
    if (!isWebAddress(url)) {
      setProblem("Paste a full web address, starting with https://");
      return;
    }
    setProblem(null);
    if (await props.onPick({ kind: isCommunityLayoutVideoUrl(url) ? "video" : "image", url, caption: "" })) props.onClose();
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setProblem(null);
    try {
      const url = await props.edit.uploadImage(file);
      if (await props.onPick({ kind: "image", url, caption: "" })) props.onClose();
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "That picture didn't upload. Try again.");
    } finally {
      setUploading(false);
    }
  };
  const disabled = props.edit.busy || uploading;

  return (
    <div className="community-sales-picker" role="dialog" aria-label={props.title}>
      <div className="community-sales-picker-head">
        <strong>{props.title}</strong>
        <button type="button" className="community-sales-edit-icon" aria-label="Close" onClick={props.onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="community-sales-edit-button" disabled={disabled} onClick={() => fileInput.current?.click()}>
        <ImagePlus size={16} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload a picture"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        hidden
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <div className="community-sales-picker-or" aria-hidden="true">or paste a link</div>
      <div className="community-sales-picker-link">
        <Link2 size={14} aria-hidden="true" />
        <input
          ref={linkInput}
          type="url"
          value={link}
          placeholder="YouTube, Vimeo, Loom, Descript or picture link"
          aria-label="Video or picture link"
          disabled={disabled}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void addLink(); }}
        />
        <button type="button" className="community-sales-edit-button is-primary" disabled={disabled || !link.trim()} onClick={() => void addLink()}>
          Add
        </button>
      </div>
      {problem ? <p className="community-sales-edit-problem" role="alert">{problem}</p> : null}
    </div>
  );
}

export function EditableSalesGallery(props: { items: SalesPageMediaItem[]; communityName: string; edit: SalesPageEditControls }) {
  const { items, edit } = props;
  const [index, setIndex] = useState(0);
  const [picker, setPicker] = useState<"add" | "replace" | null>(null);
  const [caption, setCaption] = useState("");
  const current = items[Math.min(index, items.length - 1)];
  useEffect(() => setCaption(current?.caption ?? ""), [current?.url, current?.caption]);
  const full = items.length >= COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT;

  const add = async (item: SalesPageMediaItem) => {
    const ok = await edit.saveMedia([...items, item]);
    if (ok) setIndex(items.length);
    return ok;
  };
  const replace = (item: SalesPageMediaItem) =>
    edit.saveMedia(items.map((entry, i) => (i === index ? { ...item, caption: entry.caption } : entry)));
  const move = async (step: number) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + step, 0, moved!);
    if (await edit.saveMedia(next)) setIndex(index + step);
  };
  const remove = () => void edit.saveMedia(items.filter((_, i) => i !== index));
  const saveCaption = () => {
    if (!current || caption.trim() === current.caption) return;
    void edit.saveMedia(items.map((entry, i) => (i === index ? { ...entry, caption: caption.trim() } : entry)));
  };

  const pickerView = picker ? (
    <SalesMediaPicker
      title={picker === "add" ? "Add a picture or video" : "Replace this slide"}
      edit={edit}
      onPick={picker === "add" ? add : replace}
      onClose={() => setPicker(null)}
    />
  ) : null;

  if (!current) {
    return (
      <div className="community-sales-gallery-empty">
        <button type="button" className="community-sales-gallery-add-first" disabled={edit.busy} onClick={() => setPicker("add")}>
          <Plus size={22} aria-hidden="true" />
          <strong>Add pictures and videos</strong>
          <span>Visitors click through them like slides. Until you add one, the page shows your funnel video or banner.</span>
        </button>
        {pickerView}
      </div>
    );
  }

  return (
    <div className="community-sales-gallery-editing">
      <SalesPageGallery
        items={items}
        communityName={props.communityName}
        index={Math.min(index, items.length - 1)}
        onIndexChange={setIndex}
        stageOverlay={(
          <div className="community-sales-slide-tools" role="toolbar" aria-label="This slide">
            <button type="button" className="community-sales-edit-icon" aria-label="Move left" disabled={edit.busy || index === 0} onClick={() => void move(-1)}>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className="community-sales-edit-icon" aria-label="Move right" disabled={edit.busy || index >= items.length - 1} onClick={() => void move(1)}>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className="community-sales-edit-icon" aria-label="Replace" title="Replace" disabled={edit.busy} onClick={() => setPicker("replace")}>
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button type="button" className="community-sales-edit-icon" aria-label="Remove" title="Remove" disabled={edit.busy} onClick={remove}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        caption={(
          <input
            className="community-sales-caption-input"
            type="text"
            value={caption}
            maxLength={140}
            placeholder="Add a caption (optional)"
            aria-label={`Caption for slide ${index + 1}`}
            disabled={edit.busy}
            onChange={(event) => setCaption(event.target.value)}
            onBlur={saveCaption}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        )}
        afterThumbs={full ? null : (
          <button type="button" className="community-sales-gallery-thumb community-sales-gallery-add" aria-label="Add a picture or video" disabled={edit.busy} onClick={() => setPicker("add")}>
            <Plus size={18} aria-hidden="true" />
          </button>
        )}
      />
      {pickerView}
    </div>
  );
}

// The words under the media, edited in place as Markdown. Saves when the box
// loses focus.
export function EditableSalesText(props: { text: string; edit: SalesPageEditControls }) {
  const [value, setValue] = useState(props.text || props.edit.fallbackText);
  // Only typing saves: clicking through the starting text leaves it as it is.
  const [dirty, setDirty] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setValue(props.text || props.edit.fallbackText);
    setDirty(false);
  }, [props.text]);
  // Grow with the text, so it reads like the page rather than a form.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);
  const save = () => {
    const next = value.trim();
    if (!dirty || next === props.text) return;
    void props.edit.saveText(next);
  };
  return (
    <div className="community-sales-copy is-editing">
      <textarea
        ref={box}
        className="community-sales-text-input"
        value={value}
        maxLength={COMMUNITY_LAYOUT_ABOUT_TEXT_LIMIT}
        placeholder="Who it's for, what members get, and why now. Markdown works: **bold**, ## headings, - lists."
        aria-label="Text under the media"
        disabled={props.edit.busy && !value}
        onChange={(event) => { setValue(event.target.value); setDirty(true); }}
        onBlur={save}
      />
      <p className="community-sales-edit-hint">Markdown: **bold**, ## headings, - lists and links. Saves when you click away.</p>
    </div>
  );
}
