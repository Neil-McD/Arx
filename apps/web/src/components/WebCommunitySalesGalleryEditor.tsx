import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Link2, Play, X } from "lucide-react";

import {
  COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT,
  COMMUNITY_LAYOUT_ABOUT_TEXT_LIMIT,
  isCommunityLayoutVideoUrl,
  type CommunityLayoutAboutMedia,
} from "../../../../shared/communityLayout";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

// Settings > Sales page: the gallery at the top of the Classroom sales page and
// the words under it. Both are fields of the layout record (pages.about.media
// and pages.about.text), so they ride the same draft and Publish as the page
// style, and an agent sets them with the same layout file.

type AboutFields = { media: CommunityLayoutAboutMedia[]; text: string; show_members: boolean };

type Props = {
  media: CommunityLayoutAboutMedia[];
  text: string;
  showMembers: boolean;
  // The gallery and text belong to the Classroom sales page; the member count
  // switch works on both styles.
  classroom: boolean;
  // What the page shows under the media while no text of its own is set.
  fallbackText: string;
  busy: boolean;
  onSave: (next: AboutFields) => Promise<boolean>;
  uploadImage: (file: File) => Promise<string>;
};

function thumbnailOf(item: CommunityLayoutAboutMedia): string | null {
  if (item.kind === "image") return item.url;
  const embed = parseEmbedUrl(item.url);
  if (embed?.provider === "youtube") return embed.thumbnailUrl;
  if (embed?.provider === "loom") return `https://cdn.loom.com/sessions/thumbnails/${embed.id}-00001.jpg`;
  return null;
}

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function WebCommunitySalesGalleryEditor(props: Props) {
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [captions, setCaptions] = useState<string[]>(() => props.media.map((item) => item.caption));
  const [text, setText] = useState(props.text);
  const fileInput = useRef<HTMLInputElement>(null);

  // A save elsewhere (or a reload) brings new values in.
  useEffect(() => setCaptions(props.media.map((item) => item.caption)), [props.media]);
  useEffect(() => setText(props.text), [props.text]);

  const full = props.media.length >= COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT;
  const disabled = props.busy || uploading;

  const current: AboutFields = { media: props.media, text: props.text, show_members: props.showMembers };
  const saveMedia = (media: CommunityLayoutAboutMedia[]) => props.onSave({ ...current, media });

  const addLink = async () => {
    const url = link.trim();
    if (!url) return;
    if (!isWebAddress(url)) {
      setProblem("Paste a full web address, starting with https://");
      return;
    }
    // A YouTube, Vimeo, Loom, Wistia or Descript link is a video; anything else is a picture.
    const kind = isCommunityLayoutVideoUrl(url) ? "video" : "image";
    setProblem(null);
    if (await saveMedia([...props.media, { kind, url, caption: "" }])) setLink("");
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setProblem(null);
    try {
      const url = await props.uploadImage(file);
      await saveMedia([...props.media, { kind: "image", url, caption: "" }]);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "That picture didn't upload. Try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const move = (index: number, step: number) => {
    const next = [...props.media];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item!);
    void saveMedia(next);
  };

  const saveCaption = (index: number) => {
    const caption = (captions[index] ?? "").trim();
    if (caption === props.media[index]?.caption) return;
    void saveMedia(props.media.map((item, itemIndex) => (itemIndex === index ? { ...item, caption } : item)));
  };

  const saveText = () => {
    if (text.trim() === props.text) return;
    void props.onSave({ ...current, text: text.trim() });
  };

  const membersCard = (
      <section className="settings-section pn-settings-card" id="sales-members" aria-labelledby="sales-members-title">
        <div className="pn-settings-row">
          <div className="pn-settings-row-head">
            <div className="pn-settings-row-text">
              <h2 className="pn-settings-label" id="sales-members-title">Show member count</h2>
              <span className="pn-settings-help">Member faces and "N members" on your page{props.classroom ? ", plus the Members, Online and Admins numbers" : ""}. Off hides them.</span>
            </div>
            <div className="pn-settings-row-control">
              <button
                type="button"
                role="switch"
                aria-checked={props.showMembers}
                aria-labelledby="sales-members-title"
                className={`pn-settings-switch${props.showMembers ? " is-on" : ""}`}
                disabled={props.busy}
                onClick={() => void props.onSave({ ...current, show_members: !props.showMembers })}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>
  );
  if (!props.classroom) return membersCard;

  return (
    <>
      <section className="settings-section pn-settings-card" id="sales-gallery" aria-labelledby="sales-gallery-title">
        <header className="pn-settings-card-header">
          <h2 className="settings-section-title" id="sales-gallery-title">Pictures and videos</h2>
          <p className="settings-section-desc">
            The top of your sales page. Visitors click through them like slides. With none, the page shows your banner.
          </p>
        </header>
        {props.media.length > 0 ? (
          <ol className="pn-sales-gallery-list">
            {props.media.map((item, index) => {
              const picture = thumbnailOf(item);
              return (
                <li key={`${index}:${item.url}`} className="pn-sales-gallery-item">
                  <span className={`pn-sales-gallery-thumb${picture ? "" : " is-blank"}`}>
                    {picture ? <img src={picture} alt="" loading="lazy" /> : null}
                    {item.kind === "video" ? <span className="pn-sales-gallery-play" aria-hidden="true"><Play size={12} fill="currentColor" /></span> : null}
                  </span>
                  <div className="pn-sales-gallery-fields">
                    <span className="pn-sales-gallery-kind">{item.kind === "video" ? "Video" : "Picture"} {index + 1}</span>
                    <input
                      className="pn-settings-input"
                      type="text"
                      value={captions[index] ?? ""}
                      maxLength={140}
                      placeholder="Caption (optional)"
                      aria-label={`Caption for slide ${index + 1}`}
                      disabled={disabled}
                      onChange={(event) => setCaptions((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                      onBlur={() => saveCaption(index)}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    />
                  </div>
                  <div className="pn-sales-gallery-actions">
                    <button type="button" className="pn-sales-gallery-icon" aria-label={`Move slide ${index + 1} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button type="button" className="pn-sales-gallery-icon" aria-label={`Move slide ${index + 1} down`} disabled={disabled || index === props.media.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button type="button" className="pn-sales-gallery-icon" aria-label={`Remove slide ${index + 1}`} disabled={disabled} onClick={() => void saveMedia(props.media.filter((_, i) => i !== index))}>
                      <X size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="pn-settings-row">
          {full ? (
            <p className="pn-settings-help">That's the most a page holds ({COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT}). Remove one to add another.</p>
          ) : (
            <div className="pn-sales-gallery-add">
              <button type="button" className="pn-settings-button" disabled={disabled} onClick={() => fileInput.current?.click()}>
                <ImagePlus size={16} strokeWidth={2} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload picture"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                hidden
                onChange={(event) => void upload(event.target.files?.[0])}
              />
              <div className="pn-settings-affix pn-sales-gallery-link">
                <span aria-hidden="true"><Link2 size={14} strokeWidth={2} /></span>
                <input
                  className="pn-settings-input"
                  type="url"
                  value={link}
                  placeholder="Paste a YouTube, Vimeo, Loom, Descript or picture link"
                  aria-label="Add a video or picture by link"
                  disabled={disabled}
                  onChange={(event) => setLink(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void addLink(); }}
                />
              </div>
              <button type="button" className="pn-settings-button" disabled={disabled || !link.trim()} onClick={() => void addLink()}>
                Add
              </button>
            </div>
          )}
          {problem ? <p className="pn-settings-inline-error" role="alert">{problem}</p> : null}
        </div>
      </section>

      {membersCard}

      <section className="settings-section pn-settings-card" id="sales-text" aria-labelledby="sales-text-title">
        <header className="pn-settings-card-header">
          <h2 className="settings-section-title" id="sales-text-title">Text under the media</h2>
          <p className="settings-section-desc">
            Markdown: **bold**, ## headings, - lists and links. Left empty, the page shows your About text.
          </p>
        </header>
        <div className="pn-settings-row">
          <textarea
            className="pn-settings-input pn-sales-text"
            value={text}
            rows={10}
            maxLength={COMMUNITY_LAYOUT_ABOUT_TEXT_LIMIT}
            placeholder={props.fallbackText || "Who it's for, what members get, and why now."}
            aria-label="Text under the media"
            disabled={props.busy}
            onChange={(event) => setText(event.target.value)}
            onBlur={saveText}
          />
          {!props.text && props.fallbackText ? (
            <button type="button" className="pn-settings-link" disabled={props.busy} onClick={() => setText(props.fallbackText)}>
              Start from the text the page shows now
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
