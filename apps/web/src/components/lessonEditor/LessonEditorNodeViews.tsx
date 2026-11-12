import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CheckSquare,
  CircleHelp,
  ClipboardList,
  Code2,
  GalleryHorizontal,
  ImagePlus,
  MousePointerClick,
  Play,
  Plus,
  Quote,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { renderMarkdown } from "../../../../../shared/markdownUi";
import { COMMUNITY_EMBED_LANGUAGE } from "../../../../../shared/communityEmbed";
import { lessonCallout, lessonCalloutType, LESSON_CALLOUTS } from "../../../../../shared/lessonCallouts";
import { LessonCalloutIcon } from "../../../../../shared/lessonCalloutUi";
import { ToolbarMenuList, type ToolbarMenu } from "./LessonEditorMenu";
import {
  choiceIdFor,
  lessonBlockProblem,
  readElementDraft,
  readEmbedDraft,
  writeElementDraft,
  writeEmbedDraft,
  type LessonBlockAttrs,
  type LessonChoiceDraft,
  type LessonElementDraft,
  type LessonEmbedDraft,
} from "./lessonBlockModel";
import { SLIDES_HEADING, fencedBlockMarkdown, readSlidesSection, slidesSectionMarkdown } from "./lessonMarkdown";
import type { LessonSlide } from "./lessonEditorSchema";

export type LessonVideoInfo = { provider: string; thumbnail: string | null };

export type LessonEditorServices = {
  /** Uploads a picture into an image block (or a new one), or null when uploads aren't available. */
  uploadImage: ((file: File, replacePos?: number) => void) | null;
  describeVideo: (url: string) => LessonVideoInfo | null;
  /** Stores a picture and returns its address, or null when uploads aren't available. */
  upload: ((file: File) => Promise<string>) | null;
  /** Tells the owner something went wrong (an upload that failed). */
  notify: (message: string) => void;
};

export const LessonEditorServicesContext = createContext<LessonEditorServices>({
  uploadImage: null,
  describeVideo: () => null,
  upload: null,
  notify: () => undefined,
});

// A block just added from the "/" menu takes the caret into its first field.
let pendingFocus: string | null = null;
export function focusNextBlock(key: string) {
  pendingFocus = key;
}
function useClaimFocus(key: string, focus: () => void) {
  useEffect(() => {
    if (pendingFocus !== key) return;
    pendingFocus = null;
    const id = window.requestAnimationFrame(focus);
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function BlockChrome(props: {
  className: string;
  selected: boolean;
  label: string;
  icon: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <NodeViewWrapper className={`lesson-editor-block ${props.className}${props.selected ? " is-selected" : ""}`} contentEditable={false}>
      <div className="lesson-editor-block-head">
        <span className="lesson-editor-block-icon" aria-hidden="true">{props.icon}</span>
        <span className="lesson-editor-block-label">{props.label}</span>
        {props.aside ? <span className="lesson-editor-block-aside">{props.aside}</span> : null}
      </div>
      {props.children}
    </NodeViewWrapper>
  );
}

/* Images ------------------------------------------------------------------ */

export function LessonImageView({ node, updateAttributes, deleteNode, selected, getPos }: NodeViewProps) {
  const services = useContext(LessonEditorServicesContext);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const linkRef = useRef<HTMLInputElement | null>(null);
  const [link, setLink] = useState("");
  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const uploading = Boolean(node.attrs.uploadId);
  useClaimFocus("image", () => linkRef.current?.focus());

  const pick = (file: File | undefined) => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (file && services.uploadImage && typeof pos === "number") services.uploadImage(file, pos);
  };
  const filePicker = (
    <input
      ref={fileRef}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
      hidden
      onChange={(event) => {
        pick(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );

  if (!src) {
    return (
      <NodeViewWrapper className={`lesson-editor-media-empty${selected ? " is-selected" : ""}`} contentEditable={false}>
        <ImagePlus aria-hidden="true" />
        <div className="lesson-editor-media-empty-actions">
          {services.uploadImage ? (
            <button type="button" className="lesson-editor-button is-primary" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden="true" /> Upload an image
            </button>
          ) : null}
          <form
            className="lesson-editor-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^https?:\/\//i.test(link.trim())) updateAttributes({ src: link.trim() });
            }}
          >
            <input
              ref={linkRef}
              className="lesson-editor-field"
              value={link}
              placeholder={services.uploadImage ? "or paste an image link" : "Paste an image link"}
              aria-label="Image link"
              onChange={(event) => setLink(event.target.value)}
            />
            <button type="submit" className="lesson-editor-button" disabled={!/^https?:\/\//i.test(link.trim())}>Add</button>
          </form>
        </div>
        <button type="button" className="lesson-editor-icon-button" aria-label="Remove image block" onClick={() => deleteNode()}>
          <X aria-hidden="true" />
        </button>
        {filePicker}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={`lesson-editor-image${selected ? " is-selected" : ""}${uploading ? " is-uploading" : ""}`} contentEditable={false}>
      <figure>
        <img src={src} alt={alt} draggable={false} />
        {uploading ? <span className="lesson-editor-image-status" role="status">Uploading…</span> : null}
      </figure>
      <div className="lesson-editor-image-bar">
        <input
          className="lesson-editor-field lesson-editor-image-alt"
          value={alt}
          placeholder="Describe the image for people who can't see it"
          aria-label="Image description (alt text)"
          onChange={(event) => updateAttributes({ alt: event.target.value })}
        />
        {services.uploadImage && !uploading ? (
          <button type="button" className="lesson-editor-button" onClick={() => fileRef.current?.click()}>Replace</button>
        ) : null}
        <button type="button" className="lesson-editor-icon-button" aria-label="Remove image" onClick={() => deleteNode()}>
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      {filePicker}
    </NodeViewWrapper>
  );
}

/* Video ------------------------------------------------------------------- */

export function LessonVideoView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const services = useContext(LessonEditorServicesContext);
  const url = String(node.attrs.url ?? "");
  const [draft, setDraft] = useState(url);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => setDraft(url), [url]);
  useClaimFocus("video", () => inputRef.current?.focus());
  const info = url ? services.describeVideo(url) : null;
  const draftOk = Boolean(services.describeVideo(draft.trim()));

  return (
    <BlockChrome
      className="lesson-editor-video"
      selected={selected}
      label={info ? `${info.provider} video` : "Video"}
      icon={<Play />}
      aside={
        <button type="button" className="lesson-editor-icon-button" aria-label="Remove video" onClick={() => deleteNode()}>
          <Trash2 aria-hidden="true" />
        </button>
      }
    >
      {info ? (
        <div className="lesson-editor-video-poster">
          {info.thumbnail ? <img src={info.thumbnail} alt="" draggable={false} /> : null}
          <span className="lesson-editor-video-play" aria-hidden="true"><Play /></span>
        </div>
      ) : null}
      <form
        className="lesson-editor-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (draftOk) updateAttributes({ url: draft.trim() });
        }}
      >
        <input
          ref={inputRef}
          className="lesson-editor-field"
          value={draft}
          placeholder="Paste a YouTube, Loom, Vimeo, Wistia or Descript link"
          aria-label="Video link"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draftOk && draft.trim() !== url) updateAttributes({ url: draft.trim() });
          }}
        />
        {draft.trim() !== url ? (
          <button type="submit" className="lesson-editor-button is-primary" disabled={!draftOk}>Embed</button>
        ) : null}
      </form>
      {draft.trim() && !draftOk ? <p className="lesson-editor-block-problem">Polynet plays YouTube, Loom, Vimeo, Wistia and Descript links.</p> : null}
    </BlockChrome>
  );
}

/* Raw Markdown ------------------------------------------------------------ */

export function LessonRawMarkdownView({ node, updateAttributes, selected }: NodeViewProps) {
  const source = String(node.attrs.source ?? "");
  const [editing, setEditing] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  useClaimFocus("raw", () => setEditing(true));
  useEffect(() => {
    if (!editing) return;
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [editing]);
  const preview = useMemo(() => renderMarkdown(source, { embedStandaloneMedia: false, headingLevelOffset: 1 }), [source]);
  const kind = /^\s*\|/.test(source) ? "Table" : "Markdown";

  return (
    <BlockChrome
      className="lesson-editor-raw"
      selected={selected || editing}
      label={kind}
      icon={<Code2 />}
      aside={
        <button type="button" className="lesson-editor-text-button" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit as text"}
        </button>
      }
    >
      {editing ? (
        <textarea
          ref={areaRef}
          className="lesson-editor-field lesson-editor-code-field"
          value={source}
          spellCheck={false}
          aria-label={`${kind} source`}
          onChange={(event) => {
            updateAttributes({ source: event.target.value });
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <div className="resource-viewer-prose lesson-editor-raw-preview" onDoubleClick={() => setEditing(true)}>
          {preview}
        </div>
      )}
    </BlockChrome>
  );
}

/* Slides ------------------------------------------------------------------ */

type DeckSlide = LessonSlide & { uploadId?: string };

// Pictures still uploading show from the file itself until their address comes back.
const uploadPreviews = new Map<string, string>();
const IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp,image/avif";

function AutoGrowArea(props: { value: string; placeholder: string; label: string; onChange: (value: string) => void; className?: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    const fit = () => {
      area.style.height = "auto";
      area.style.height = `${area.scrollHeight}px`;
    };
    fit();
    // A narrower column wraps more lines.
    let width = area.clientWidth;
    const observer = new ResizeObserver(() => {
      if (area.clientWidth === width) return;
      width = area.clientWidth;
      fit();
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={2}
      className={`lesson-editor-field ${props.className ?? ""}`}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.label}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

// Shown as members read it; a click turns it into the Markdown it's saved as.
function SlideNote(props: { value: string; label: string; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const rendered = useMemo(() => (props.value.trim() ? renderMarkdown(props.value, { embedStandaloneMedia: false, headingLevelOffset: 1 }) : null), [props.value]);
  useEffect(() => {
    if (!editing) return;
    // After the editor has handled the click (it selects the card and takes focus).
    const id = window.setTimeout(() => holderRef.current?.querySelector("textarea")?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [editing]);
  if (editing) {
    return (
      <div
        ref={holderRef}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
      >
        <AutoGrowArea value={props.value} label={props.label} placeholder="What members read under this slide" onChange={props.onChange} />
      </div>
    );
  }
  return (
    <div
      className={`resource-viewer-prose lesson-editor-slide-note${rendered ? "" : " is-empty"}`}
      role="button"
      tabIndex={0}
      aria-label={`${props.label}: edit`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a")) setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      }}
    >
      {rendered ?? "What members read under this slide"}
    </div>
  );
}

export function LessonSlideDeckView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const services = useContext(LessonEditorServicesContext);
  const slides = (node.attrs.slides ?? []) as DeckSlide[];
  const lead = String(node.attrs.lead ?? "");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const replaceAt = useRef<number | null>(null);
  const firstLinkRef = useRef<HTMLInputElement | null>(null);
  const [links, setLinks] = useState<Record<number, string>>({});
  const [textMode, setTextMode] = useState<string | null>(null);
  const [, setTick] = useState(0);
  useClaimFocus("deck", () => firstLinkRef.current?.focus());
  // Redraw when the blocks around the deck change, for the note below it.
  useEffect(() => {
    const rerender = () => setTick((tick) => tick + 1);
    editor.on("update", rerender);
    return () => void editor.off("update", rerender);
  }, [editor]);

  // Async work (uploads) reads the deck as it is now, not as it was when it started.
  const currentSlides = (): DeckSlide[] => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    const current = typeof pos === "number" ? editor.state.doc.nodeAt(pos) : null;
    return current?.type.name === "slideDeck" ? ([...current.attrs.slides] as DeckSlide[]) : [...slides];
  };
  const setSlides = (next: DeckSlide[]) => updateAttributes({ slides: next });
  const patch = (index: number, change: Partial<DeckSlide>) => setSlides(slides.map((slide, i) => (i === index ? { ...slide, ...change } : slide)));
  const move = (index: number, by: number) => {
    const next = [...slides];
    const [slide] = next.splice(index, 1);
    next.splice(index + by, 0, slide);
    setSlides(next);
  };
  const remove = (index: number) => {
    const next = slides.filter((_, i) => i !== index);
    if (next.length) setSlides(next);
    else deleteNode();
  };

  const uploadInto = (files: File[], at: number | null) => {
    const upload = services.upload;
    if (!upload || !files.length) return;
    const ids = files.map((file) => {
      const uploadId = `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      uploadPreviews.set(uploadId, URL.createObjectURL(file));
      return uploadId;
    });
    const base = currentSlides();
    if (at !== null) {
      base[at] = { ...base[at], src: "", uploadId: ids[0] };
    } else {
      // A blank slide at the end takes the first picture.
      const lastSlide = base[base.length - 1];
      const fillsBlank = Boolean(lastSlide && !lastSlide.src && !lastSlide.uploadId);
      ids.forEach((uploadId, i) => {
        if (i === 0 && fillsBlank) base[base.length - 1] = { ...lastSlide, uploadId };
        else base.push({ src: "", alt: "", note: "", uploadId });
      });
    }
    setSlides(base);
    files.forEach((file, i) => {
      const uploadId = ids[i];
      if (!uploadId) return;
      upload(file)
        .then((url) => setSlides(currentSlides().map((slide) => (slide.uploadId === uploadId ? { src: url, alt: slide.alt, note: slide.note } : slide))))
        .catch((error: unknown) => {
          services.notify(error instanceof Error ? error.message : "That picture didn't upload. Try again.");
          setSlides(currentSlides().map((slide) => (slide.uploadId === uploadId ? { src: "", alt: slide.alt, note: slide.note } : slide)));
        })
        .finally(() => {
          const preview = uploadPreviews.get(uploadId);
          uploadPreviews.delete(uploadId);
          if (preview) window.setTimeout(() => URL.revokeObjectURL(preview), 60_000);
        });
    });
  };

  const pos = typeof getPos === "function" ? getPos() : undefined;
  const after = typeof pos === "number" ? editor.state.doc.resolve(pos + node.nodeSize).nodeAfter : null;
  const absorbsNext = Boolean(after && !(after.type.name === "heading" && after.attrs.level === 2));
  const count = slides.filter((slide) => slide.src || slide.uploadId).length;
  const sectionText = slidesSectionMarkdown(lead, slides);
  const parsedText = textMode === null ? null : readSlidesSection(textMode.replace(/^## Slides[ \t]*\n?/, ""));

  return (
    <BlockChrome
      className="lesson-editor-deck"
      selected={selected}
      label="Slides"
      icon={<GalleryHorizontal />}
      aside={
        <>
          <span className="lesson-editor-block-meta">{count === 1 ? "1 slide" : `${count} slides`}</span>
          <button
            type="button"
            className="lesson-editor-text-button"
            onClick={() => {
              if (textMode === null) setTextMode(sectionText);
              else {
                if (parsedText) updateAttributes({ lead: parsedText.lead, slides: parsedText.slides });
                setTextMode(null);
              }
            }}
            disabled={textMode !== null && !parsedText}
          >
            {textMode === null ? "Edit as text" : "Done"}
          </button>
          <button type="button" className="lesson-editor-icon-button" aria-label="Delete slides" onClick={() => deleteNode()}>
            <Trash2 aria-hidden="true" />
          </button>
        </>
      }
    >
      {textMode !== null ? (
        <>
          <AutoGrowArea className="lesson-editor-code-field" value={textMode} label="Slides as text" placeholder={SLIDES_HEADING} onChange={setTextMode} />
          {!parsedText ? <p className="lesson-editor-block-problem" role="alert">Add at least one picture line, like ![Slide 1](https://…/slide-1.png).</p> : null}
        </>
      ) : (
        <>
          {lead ? (
            <AutoGrowArea value={lead} label="Text above the slides" placeholder="Text above the slides" onChange={(value) => updateAttributes({ lead: value })} />
          ) : null}
          <ol className="lesson-editor-slides">
            {slides.map((slide, index) => {
              const preview = slide.uploadId ? uploadPreviews.get(slide.uploadId) : null;
              const shown = preview ?? slide.src;
              const link = links[index] ?? "";
              return (
                <li key={slide.uploadId ?? `${index}-${slide.src}`} className="lesson-editor-slide">
                  <div className={`lesson-editor-slide-thumb${shown ? "" : " is-empty"}`}>
                    <span className="lesson-editor-slide-number" aria-hidden="true">{index + 1}</span>
                    {shown ? (
                      <>
                        <img src={shown} alt="" draggable={false} />
                        {slide.uploadId ? <span className="lesson-editor-image-status" role="status">Uploading…</span> : null}
                        {services.upload && !slide.uploadId ? (
                          <button
                            type="button"
                            className="lesson-editor-slide-replace"
                            onClick={() => {
                              replaceAt.current = index;
                              fileRef.current?.click();
                            }}
                          >
                            Replace
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <div className="lesson-editor-slide-empty">
                        {services.upload ? (
                          <button
                            type="button"
                            className="lesson-editor-button is-primary"
                            onClick={() => {
                              replaceAt.current = index;
                              fileRef.current?.click();
                            }}
                          >
                            <Upload aria-hidden="true" /> Upload
                          </button>
                        ) : null}
                        <form
                          className="lesson-editor-inline-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!/^https?:\/\//i.test(link.trim())) return;
                            patch(index, { src: link.trim() });
                            setLinks((current) => ({ ...current, [index]: "" }));
                          }}
                        >
                          <input
                            ref={index === 0 ? firstLinkRef : undefined}
                            className="lesson-editor-field"
                            value={link}
                            placeholder={services.upload ? "or paste a link" : "Paste a picture link"}
                            aria-label={`Slide ${index + 1} picture link`}
                            onChange={(event) => setLinks((current) => ({ ...current, [index]: event.target.value }))}
                          />
                        </form>
                      </div>
                    )}
                  </div>
                  <div className="lesson-editor-slide-fields">
                    <input
                      className="lesson-editor-field lesson-editor-slide-title"
                      value={slide.alt}
                      placeholder={`Slide ${index + 1} title`}
                      aria-label={`Slide ${index + 1} title (read out for people who can't see it)`}
                      onChange={(event) => patch(index, { alt: event.target.value })}
                    />
                    <SlideNote
                      value={slide.note}
                      label={`Slide ${index + 1} note`}
                      onChange={(value) => patch(index, { note: value })}
                    />
                  </div>
                  <div className="lesson-editor-slide-actions">
                    <button type="button" className="lesson-editor-icon-button" aria-label={`Move slide ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" className="lesson-editor-icon-button" aria-label={`Move slide ${index + 1} down`} disabled={index === slides.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown aria-hidden="true" />
                    </button>
                    <button type="button" className="lesson-editor-icon-button" aria-label={`Remove slide ${index + 1}`} onClick={() => remove(index)}>
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="lesson-editor-deck-foot">
            {services.upload ? (
              <button
                type="button"
                className="lesson-editor-button"
                onClick={() => {
                  replaceAt.current = null;
                  fileRef.current?.click();
                }}
              >
                <Upload aria-hidden="true" /> Upload slides
              </button>
            ) : null}
            <button type="button" className="lesson-editor-text-button" onClick={() => setSlides([...slides, { src: "", alt: "", note: "" }])}>
              <Plus aria-hidden="true" /> Add a slide
            </button>
          </div>
          {absorbsNext ? (
            <p className="lesson-editor-deck-hint">Text below the slides, up to the next Heading 1, shows under the last slide.</p>
          ) : null}
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_TYPES}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          const at = replaceAt.current;
          uploadInto(at === null ? files : files.slice(0, 1), at);
        }}
      />
    </BlockChrome>
  );
}

/* Follow-along elements and widgets --------------------------------------- */

const BLOCK_LABELS: Record<string, { label: string; icon: ReactNode }> = {
  button: { label: "Button", icon: <MousePointerClick /> },
  checklist: { label: "Checklist", icon: <CheckSquare /> },
  quiz: { label: "Quiz", icon: <CircleHelp /> },
  form: { label: "Form", icon: <ClipboardList /> },
  [COMMUNITY_EMBED_LANGUAGE]: { label: "Interactive widget", icon: <AppWindow /> },
};

const BUTTON_ACTIONS: { value: LessonElementDraft["action"]; label: string }[] = [
  { value: "mark_done", label: "Marks the lesson done" },
  { value: "confirm", label: "Records that they clicked" },
  { value: "ask_agent", label: "Asks the community agent" },
  { value: "open_form", label: "Opens a Polynet Form" },
];

type ChoiceRow = LessonChoiceDraft & { key: string; saved: boolean };
type ElementState = Omit<LessonElementDraft, "choices"> & { choices: ChoiceRow[] };

let rowKey = 0;
function toState(draft: LessonElementDraft): ElementState {
  return { ...draft, choices: draft.choices.map((choice) => ({ ...choice, key: `c${rowKey++}`, saved: true })) };
}
function toDraft(state: ElementState): LessonElementDraft {
  return { ...state, choices: state.choices.map(({ id, label, correct }) => ({ id, label, correct })) };
}

function Toggle(props: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="lesson-editor-toggle">
      <input type="checkbox" role="switch" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span className="lesson-editor-toggle-track" aria-hidden="true" />
      <span>{props.label}</span>
      {props.hint ? <small>{props.hint}</small> : null}
    </label>
  );
}

function ElementFields({ attrs, onChange }: { attrs: LessonBlockAttrs; onChange: (next: LessonBlockAttrs) => void }) {
  const [state, setState] = useState<ElementState>(() => toState(readElementDraft(attrs)));
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  useClaimFocus(readElementDraft(attrs).id, () => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  });
  // Undo, or an edit as Markdown, changes the block underneath the fields.
  useEffect(() => {
    const ours = writeElementDraft(toDraft(state));
    if (ours.info !== attrs.info || ours.body !== attrs.body) setState(toState(readElementDraft(attrs)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrs.info, attrs.body]);

  const commit = (next: ElementState) => {
    setState(next);
    const written = writeElementDraft(toDraft(next));
    if (written.info !== attrs.info || written.body !== attrs.body) onChange(written);
  };
  const setField = <K extends keyof ElementState>(key: K, value: ElementState[K]) => commit({ ...state, [key]: value });
  const setChoice = (key: string, patch: Partial<ChoiceRow>) =>
    commit({
      ...state,
      choices: state.choices.map((choice) => {
        if (choice.key !== key) return choice;
        // Its id stays the one members' answers were saved under.
        const id = patch.label !== undefined && choice.saved && !choice.id ? choiceIdFor(choice.label) : choice.id;
        return { ...choice, ...patch, id };
      }),
    });
  const addChoice = () =>
    commit({ ...state, choices: [...state.choices, { id: null, label: "", correct: false, key: `c${rowKey++}`, saved: false }] });
  const removeChoice = (key: string) => commit({ ...state, choices: state.choices.filter((choice) => choice.key !== key) });

  const required = state.type !== "form" ? (
    <Toggle
      checked={state.required}
      onChange={(value) => setField("required", value)}
      label="Required"
      hint="Members finish it before the lesson counts as done"
    />
  ) : null;

  if (state.type === "button") {
    return (
      <div className="lesson-editor-fields">
        <input
          ref={firstFieldRef}
          className="lesson-editor-field lesson-editor-button-preview"
          value={state.label}
          placeholder="Button text"
          aria-label="Button text"
          maxLength={300}
          onChange={(event) => setField("label", event.target.value)}
        />
        <label className="lesson-editor-row">
          <span>When clicked</span>
          <select className="lesson-editor-field" value={state.action} onChange={(event) => setField("action", event.target.value as ElementState["action"])}>
            {BUTTON_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
          </select>
        </label>
        {state.action === "open_form" ? (
          <label className="lesson-editor-row">
            <span>Form key</span>
            <input className="lesson-editor-field" value={state.formKey} placeholder="welcome-intake" onChange={(event) => setField("formKey", event.target.value.trim())} />
          </label>
        ) : null}
        {required}
      </div>
    );
  }

  if (state.type === "form") {
    return (
      <div className="lesson-editor-fields">
        <label className="lesson-editor-row">
          <span>Form key</span>
          <input
            ref={firstFieldRef}
            className="lesson-editor-field"
            value={state.formKey}
            placeholder="welcome-intake"
            onChange={(event) => setField("formKey", event.target.value.trim())}
          />
        </label>
        <input
          className="lesson-editor-field"
          value={state.prompt}
          placeholder="A line above the form (optional)"
          aria-label="Text above the form"
          onChange={(event) => setField("prompt", event.target.value)}
        />
        <p className="lesson-editor-hint">The form comes from Workflows → Forms. Members fill it in right here in the lesson.</p>
      </div>
    );
  }

  const isQuiz = state.type === "quiz";
  return (
    <div className="lesson-editor-fields">
      <input
        ref={firstFieldRef}
        className="lesson-editor-field lesson-editor-prompt"
        value={state.prompt}
        placeholder={isQuiz ? "Ask a question" : "A line above the list (optional)"}
        aria-label={isQuiz ? "Question" : "Checklist intro"}
        maxLength={1000}
        onChange={(event) => setField("prompt", event.target.value)}
      />
      <ul className="lesson-editor-choices">
        {state.choices.map((choice, index) => (
          <li key={choice.key} className={choice.correct ? "is-correct" : undefined}>
            {isQuiz ? (
              <button
                type="button"
                className="lesson-editor-choice-mark"
                role="checkbox"
                aria-checked={choice.correct}
                aria-label={choice.correct ? "Right answer. Click to unmark." : "Mark as a right answer"}
                title={choice.correct ? "Right answer" : "Mark as a right answer"}
                onClick={() => setChoice(choice.key, { correct: !choice.correct })}
              />
            ) : (
              <span className="lesson-editor-choice-box" aria-hidden="true" />
            )}
            <input
              className="lesson-editor-field"
              value={choice.label}
              placeholder={isQuiz ? `Option ${index + 1}` : `Item ${index + 1}`}
              aria-label={isQuiz ? `Option ${index + 1}` : `Item ${index + 1}`}
              maxLength={300}
              onChange={(event) => setChoice(choice.key, { label: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addChoice();
                }
              }}
              autoFocus={!choice.saved && index === state.choices.length - 1}
            />
            <button type="button" className="lesson-editor-icon-button" aria-label={`Remove ${choice.label || "this one"}`} onClick={() => removeChoice(choice.key)}>
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="lesson-editor-text-button lesson-editor-add" onClick={addChoice}>
        <Plus aria-hidden="true" /> {isQuiz ? "Add an option" : "Add an item"}
      </button>
      {isQuiz ? (
        <textarea
          className="lesson-editor-field lesson-editor-explanation"
          value={state.explanation}
          rows={2}
          placeholder="Explain the answer (members see it after they answer)"
          aria-label="Explanation"
          onChange={(event) => setField("explanation", event.target.value)}
        />
      ) : null}
      {required}
    </div>
  );
}

function EmbedFields({ attrs, onChange }: { attrs: LessonBlockAttrs; onChange: (next: LessonBlockAttrs) => void }) {
  const [state, setState] = useState<LessonEmbedDraft>(() => readEmbedDraft(attrs.body));
  const srcRef = useRef<HTMLInputElement | null>(null);
  useClaimFocus("embed", () => srcRef.current?.select());
  useEffect(() => {
    if (writeEmbedDraft(state).body !== attrs.body) setState(readEmbedDraft(attrs.body));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrs.body]);
  const set = (key: keyof LessonEmbedDraft, value: string) => {
    const next = { ...state, [key]: value };
    setState(next);
    const written = writeEmbedDraft(next);
    if (written.body !== attrs.body) onChange(written);
  };
  return (
    <div className="lesson-editor-fields lesson-editor-embed-fields">
      <label className="lesson-editor-row"><span>Widget file</span>
        <input ref={srcRef} className="lesson-editor-field" value={state.src} placeholder="embeds/widget.html" onChange={(event) => set("src", event.target.value.trim())} />
      </label>
      <label className="lesson-editor-row"><span>Title</span>
        <input className="lesson-editor-field" value={state.title} placeholder="What it is, for screen readers" onChange={(event) => set("title", event.target.value)} />
      </label>
      <label className="lesson-editor-row"><span>Height</span>
        <input className="lesson-editor-field" value={state.height} inputMode="numeric" placeholder="600" onChange={(event) => set("height", event.target.value.replace(/\D/g, ""))} />
      </label>
      <label className="lesson-editor-row"><span>Fallback image</span>
        <input className="lesson-editor-field" value={state.fallback} placeholder="media/widget.png (optional)" onChange={(event) => set("fallback", event.target.value.trim())} />
      </label>
      <p className="lesson-editor-hint">Widgets are pages on your community site, published with <code>polynet push</code>.</p>
    </div>
  );
}

export function LessonFencedBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const attrs = node.attrs as LessonBlockAttrs;
  const [asText, setAsText] = useState(false);
  const [text, setText] = useState("");
  const meta = BLOCK_LABELS[attrs.language] ?? { label: attrs.language, icon: <Code2 /> };
  const problem = lessonBlockProblem(attrs);
  const id = attrs.language === COMMUNITY_EMBED_LANGUAGE ? null : attrs.info.trim().split(/\s+/)[0] ?? null;

  return (
    <BlockChrome
      className={`lesson-editor-card lesson-editor-card--${attrs.language}`}
      selected={selected}
      label={meta.label}
      icon={meta.icon}
      aside={
        <>
          {id ? <code className="lesson-editor-card-id" title="Members' answers are saved under this id">{id}</code> : null}
          <button
            type="button"
            className="lesson-editor-text-button"
            onClick={() => {
              setText(fencedBlockMarkdown(attrs.language, attrs.info, attrs.body));
              setAsText(!asText);
            }}
          >
            {asText ? "Edit as form" : "Edit as text"}
          </button>
          <button type="button" className="lesson-editor-icon-button" aria-label={`Remove ${meta.label.toLowerCase()}`} onClick={() => deleteNode()}>
            <Trash2 aria-hidden="true" />
          </button>
        </>
      }
    >
      {asText ? (
        <textarea
          className="lesson-editor-field lesson-editor-code-field"
          value={text}
          spellCheck={false}
          rows={Math.max(3, text.split("\n").length)}
          aria-label={`${meta.label} as Markdown`}
          onChange={(event) => {
            setText(event.target.value);
            // The block takes the text once its opening line still names this kind of block.
            const lines = event.target.value.split("\n");
            const open = /^(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)(?:[ \t]+(.*?))?\s*$/.exec(lines[0] ?? "");
            if (!open || open[2] !== attrs.language) return;
            const closeAt = lines.findIndex((line, index) => index > 0 && line.startsWith(open[1]));
            const body = lines.slice(1, closeAt > 0 ? closeAt : undefined).join("\n");
            updateAttributes({ info: open[3] ?? "", body });
          }}
        />
      ) : attrs.language === COMMUNITY_EMBED_LANGUAGE ? (
        <EmbedFields attrs={attrs} onChange={(next) => updateAttributes(next)} />
      ) : (
        <ElementFields attrs={attrs} onChange={(next) => updateAttributes(next)} />
      )}
      {problem ? <p className="lesson-editor-block-problem" role="alert">{problem}</p> : null}
    </BlockChrome>
  );
}

/* Quotes and callouts -------------------------------------------------------- */

/** A quote, or a callout: a type switch (colour and icon) and its own typed title. */
export function LessonBlockquoteView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [menu, setMenu] = useState<ToolbarMenu>(null);
  const callout = lessonCalloutType(node.attrs.callout);
  const items = [
    ...LESSON_CALLOUTS.map((item) => ({
      key: item.type,
      title: item.label,
      hint: item.hint,
      icon: <LessonCalloutIcon type={item.type} />,
      active: item.type === callout,
      run: () => updateAttributes({ callout: item.type }),
    })),
    { key: "quote", title: "Plain quote", hint: "No label or colour", icon: <Quote />, run: () => updateAttributes({ callout: null }) },
  ];
  // One shape for a quote and a callout, so switching keeps the text's element (and the caret).
  return (
    <NodeViewWrapper className={callout ? `md-callout is-${callout}` : "md-blockquote"} data-callout={callout ?? undefined}>
      {callout ? <p className="md-callout-label" contentEditable={false}>
        <button
          type="button"
          className="lesson-editor-callout-type"
          aria-haspopup="menu"
          aria-expanded={Boolean(menu)}
          title="Change the callout type"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu((current) => (current ? null : { key: "callout", rect }));
          }}
        >
          <LessonCalloutIcon type={callout} />
          <span>{lessonCallout(callout).label}</span>
          <ChevronDown className="lesson-editor-callout-caret" aria-hidden="true" />
        </button>
        {/* The type only sets colour and icon; members see the title, if any. */}
        <input
          className="lesson-editor-callout-title"
          type="text"
          value={typeof node.attrs.calloutTitle === "string" ? node.attrs.calloutTitle : ""}
          placeholder="Title (optional)"
          aria-label="Callout title"
          maxLength={120}
          onChange={(event) => updateAttributes({ calloutTitle: event.currentTarget.value || null })}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const pos = getPos();
            if (typeof pos === "number") editor.commands.focus(pos + 2);
          }}
        />
      </p> : null}
      <NodeViewContent className={callout ? "md-callout-body" : undefined} />
      {menu && callout ? (
        <ToolbarMenuList menu={menu} items={items} host={editor.view.dom as HTMLElement} label="Callout type" onClose={() => setMenu(null)} />
      ) : null}
    </NodeViewWrapper>
  );
}
