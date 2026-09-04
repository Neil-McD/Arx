import { lazy, Suspense, useId, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { safeDocumentUrl } from "../../../../shared/messagePdf";

const PdfReader = lazy(() => import("./PdfReader").catch(() => ({
  default: () => <p role="alert" className="message-pdf-status">The reader could not load. Open the original to read or download this PDF.</p>,
})));

export function PdfDocumentCard({ url, name }: { url: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const href = safeDocumentUrl(url);
  if (!href) return null;
  return <>
    <button ref={cardRef} type="button" className="message-pdf-card" onClick={(event) => {
      event.stopPropagation(); setOpen(true); dialogRef.current?.showModal();
    }}>
      <FileText size={28} aria-hidden="true" />
      <span><strong>{name}</strong><small>PDF document · Read</small></span>
    </button>
    {/* Native modal top-layer rendering avoids clipping without moving the dialog
        outside its owner (notably the DM host's outside-click boundary). */}
    <dialog ref={dialogRef} className="message-pdf-dialog" aria-labelledby={titleId}
      onClose={() => { setOpen(false); cardRef.current?.focus({ preventScroll: true }); }}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      onClick={(event) => event.stopPropagation()}>
      <header><strong id={titleId}>{name}</strong>
        <a href={href} target="_blank" rel="noopener noreferrer">Open original</a>
        <button type="button" aria-label="Close document" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
      </header>
      {open ? <Suspense fallback={<p role="status">Opening document…</p>}><PdfReader url={href} name={name} /></Suspense> : null}
    </dialog>
  </>;
}
