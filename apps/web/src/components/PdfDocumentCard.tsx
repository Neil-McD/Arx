import { lazy, Suspense, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import { safeDocumentUrl } from "../../../../shared/messagePdf";

const PdfReader = lazy(() => import("./PdfReader").catch(() => ({
  default: () => <p role="alert" className="message-pdf-status">The reader could not load. Open the original to read or download this PDF.</p>,
})));

export function PdfDocumentCard({ url, name }: { url: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const href = safeDocumentUrl(url);
  if (!href) return null;
  return <>
    <button type="button" className="message-pdf-card" onClick={(event) => {
      event.stopPropagation(); setOpen(true); dialogRef.current?.showModal();
    }}>
      <FileText size={28} aria-hidden="true" />
      <span><strong>{name}</strong><small>PDF document · Read</small></span>
    </button>
    {typeof document !== "undefined" ? createPortal(
      <dialog ref={dialogRef} className="message-pdf-dialog" aria-labelledby={titleId}
        onClose={() => setOpen(false)} onClick={(event) => event.stopPropagation()}>
        <header><strong id={titleId}>{name}</strong>
          <a href={href} target="_blank" rel="noopener noreferrer">Open original</a>
          <button type="button" aria-label="Close document" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
        </header>
        {open ? <Suspense fallback={<p role="status">Opening document…</p>}><PdfReader url={href} name={name} /></Suspense> : null}
      </dialog>, document.body,
    ) : null}
  </>;
}
