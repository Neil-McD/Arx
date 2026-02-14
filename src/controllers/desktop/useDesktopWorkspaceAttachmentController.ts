import { useCallback, useEffect, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DesktopShellClient, ShellAttachmentResult } from "../../runtime/shell/client";

type UseDesktopWorkspaceAttachmentControllerArgs<AttachmentT extends { id: string }> = {
  shellClient: DesktopShellClient;
  setAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
  toAttachment: (result: ShellAttachmentResult) => AttachmentT;
};

const ATTACHMENT_PICKER_FILTERS = [
  { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
  { name: "Documents", extensions: ["txt", "md", "json", "csv", "pdf"] },
  { name: "Code", extensions: ["ts", "tsx", "js", "jsx", "py", "rs", "go", "html", "css"] },
  { name: "All Files", extensions: ["*"] },
];

export function useDesktopWorkspaceAttachmentController<AttachmentT extends { id: string }>(
  args: UseDesktopWorkspaceAttachmentControllerArgs<AttachmentT>,
): {
  isDraggingOver: boolean;
  handleAddAttachment: () => Promise<void>;
  handleRemoveAttachment: (id: string) => void;
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => void;
} {
  const { shellClient, setAttachments, toAttachment } = args;
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const ingestPathAsAttachment = useCallback(
    async (path: string, onFailureMessage: string) => {
      try {
        const result = await shellClient.ingestAttachment(path);
        setAttachments((prev) => [...prev, toAttachment(result)]);
      } catch (error) {
        console.error(onFailureMessage, error);
      }
    },
    [setAttachments, shellClient, toAttachment],
  );

  const handleAddAttachment = useCallback(async () => {
    const selected = await open({
      multiple: true,
      title: "Add files to message",
      filters: ATTACHMENT_PICKER_FILTERS,
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      await ingestPathAsAttachment(path, "Failed to add attachment:");
    }
  }, [ingestPathAsAttachment]);

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    },
    [setAttachments],
  );

  useEffect(() => {
    const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauriRuntime) return;

    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    try {
      const webview = getCurrentWebviewWindow();
      void webview
        .onDragDropEvent(async (event) => {
          if (event.payload.type === "over") {
            setIsDraggingOver(true);
          } else if (event.payload.type === "leave") {
            setIsDraggingOver(false);
          } else if (event.payload.type === "drop") {
            setIsDraggingOver(false);
            const paths = event.payload.paths;
            for (const path of paths) {
              await ingestPathAsAttachment(path, "Failed to add dropped file:");
            }
          }
        })
        .then((fn) => {
          if (disposed) {
            fn();
          } else {
            unsubscribe = fn;
          }
        })
        .catch((error) => {
          console.warn("Failed to register Tauri drag-drop listener:", error);
        });
    } catch (error) {
      console.warn("Tauri drag-drop unavailable in this runtime:", error);
      return;
    }

    return () => {
      disposed = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [ingestPathAsAttachment]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return {
    isDraggingOver,
    handleAddAttachment,
    handleRemoveAttachment,
    handleDragOver,
    handleDrop,
  };
}
