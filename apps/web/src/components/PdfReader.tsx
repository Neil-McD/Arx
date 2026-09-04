import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer, version, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "../styles/pdf-text-layer.css";

GlobalWorkerOptions.workerSrc = workerUrl;
const LOAD_TIMEOUT_MS = 30_000;

export default function PdfReader({ url, name }: { url: string; name: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(640);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    setPdf(null); setPageNumber(1); setZoom(1); setError(""); setRendering(true);
    const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/${version}/`, window.location.href).href;
    const task = getDocument({ url, withCredentials: false, enableXfa: false,
      cMapUrl: `${assets}cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/`,
    });
    const timeout = window.setTimeout(() => {
      if (disposed) return;
      disposed = true;
      setRendering(false);
      setError("This PDF took too long to load. Retry or open the original.");
      void task.destroy();
    }, LOAD_TIMEOUT_MS);
    void task.promise.then((document) => {
      window.clearTimeout(timeout);
      if (!disposed) setPdf(document);
    }).catch(() => {
      window.clearTimeout(timeout);
      if (!disposed) {
        setRendering(false);
        setError("This PDF cannot be previewed here. Retry or open the original to read or download it.");
      }
    });
    return () => { disposed = true; window.clearTimeout(timeout); void task.destroy(); };
  }, [url, attempt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pageNumber, url, attempt]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(160, element.clientWidth - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;
    element.replaceChildren();
    if (!pdf) return;
    let disposed = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    setRendering(true); setError("");
    const timeout = window.setTimeout(() => {
      if (disposed) return;
      disposed = true;
      renderTask?.cancel(); textLayer?.cancel();
      setPdf(null);
      void pdf.loadingTask.destroy();
      setError("This page took too long to display. Retry or open the original.");
      setRendering(false);
    }, LOAD_TIMEOUT_MS);
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (disposed) return;
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(width, 1000) / original.width * zoom;
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      element.style.setProperty("--scale-factor", String(scale));
      element.style.setProperty("--total-scale-factor", String(scale));
      const text = document.createElement("div");
      text.className = "textLayer";
      element.append(canvas, text);
      renderTask = page.render({ canvas, viewport, transform: [outputScale, 0, 0, outputScale, 0, 0] });
      await renderTask.promise;
      if (disposed) return;
      const textContentSource = await page.getTextContent();
      if (disposed) return;
      textLayer = new TextLayer({ textContentSource, container: text, viewport });
      await textLayer.render();
      if (!disposed) setRendering(false);
    })().catch(() => {
      if (!disposed) { setError("This page could not be displayed. Try another page or open the original."); setRendering(false); }
    }).finally(() => window.clearTimeout(timeout));
    return () => { disposed = true; window.clearTimeout(timeout); renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, pageNumber, zoom, width]);

  async function download() {
    if (!pdf) return;
    try {
      const bytes = await pdf.getData();
      const href = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = href; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch { setError("Download failed. Use Open original to get the file."); }
  }

  return <div className="message-pdf-reader">
    <div className="message-pdf-toolbar" aria-label="Document controls">
      <button type="button" disabled={!pdf || pageNumber <= 1} onClick={() => setPageNumber((page) => page - 1)}>Previous</button>
      <span aria-live="polite">{pdf ? `Page ${pageNumber} of ${pdf.numPages}` : error ? "Preview unavailable" : "Loading…"}</span>
      <button type="button" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber((page) => page + 1)}>Next</button>
      <button type="button" aria-label="Zoom out" disabled={!pdf || zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>−</button>
      <button type="button" disabled={!pdf} onClick={() => setZoom(1)}>Fit width</button>
      <button type="button" aria-label="Zoom in" disabled={!pdf || zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.25))}>+</button>
      <button type="button" disabled={!pdf} onClick={() => void download()}>Download</button>
    </div>
    {error ? <div role="alert" className="message-pdf-status">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div> : null}
    {!error && rendering ? <span role="status" className="message-pdf-status">Loading page…</span> : null}
    <div ref={scrollRef} className="message-pdf-scroll">
      <div ref={pageRef} className="message-pdf-page" role="region" aria-label={`${name}, page ${pageNumber}`} />
    </div>
  </div>;
}
