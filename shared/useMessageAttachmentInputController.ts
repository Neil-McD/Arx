import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type Dispatch,
  type DragEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";

type AttachmentFileInput = FileList | readonly File[];

type UseMessageAttachmentInputControllerArgs<AttachmentT extends { id: string }> = {
  attachmentsRef: MutableRefObject<AttachmentT[]>;
  setAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  ingestAttachmentsFromFileList: (
    files: AttachmentFileInput,
    existing: AttachmentT[],
    onError: (message: string) => void,
  ) => Promise<AttachmentT[]>;
};

function hasTransferFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
}

function filesFromDataTransfer(dataTransfer: DataTransfer | null | undefined): File[] {
  if (!dataTransfer) return [];
  const direct = Array.from(dataTransfer.files ?? []).filter((file): file is File => file instanceof File);
  if (direct.length > 0) return direct;
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File);
}

function filesFromClipboard(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const direct = Array.from(data.files ?? []).filter((file): file is File => file instanceof File);
  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File);
  return [...direct, ...fromItems].filter(
    (file, index, list) =>
      list.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.type === file.type) === index,
  );
}

export function useMessageAttachmentInputController<AttachmentT extends { id: string }>(
  args: UseMessageAttachmentInputControllerArgs<AttachmentT>,
): {
  handleAttachmentFileInputChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleAttachmentDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  handleAttachmentDragEnter: (event: DragEvent<HTMLElement>) => void;
  handleAttachmentDragOver: (event: DragEvent<HTMLElement>) => void;
  handleAttachmentDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleAttachmentPaste: (event: ClipboardEvent<HTMLElement>) => Promise<void>;
  isAttachmentDragOver: boolean;
  removeAttachment: (id: string) => void;
} {
  const {
    attachmentsRef,
    setAttachments,
    setError,
    ingestAttachmentsFromFileList,
  } = args;
  const [isAttachmentDragOver, setIsAttachmentDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const ingestFiles = useCallback(
    async (files: AttachmentFileInput) => {
      if (files.length === 0) return;
      setError(null);
      const updated = await ingestAttachmentsFromFileList(files, attachmentsRef.current, (message) => {
        setError(message);
      });
      setAttachments(updated);
    },
    [attachmentsRef, ingestAttachmentsFromFileList, setAttachments, setError],
  );

  const handleAttachmentFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const files = input.files;
      if (!files || files.length === 0) {
        input.value = "";
        return;
      }
      await ingestFiles(files);
      input.value = "";
    },
    [ingestFiles],
  );

  const handleAttachmentDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasTransferFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dragDepthRef.current += 1;
    setIsAttachmentDragOver(true);
  }, []);

  const handleAttachmentDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasTransferFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsAttachmentDragOver(true);
  }, []);

  const handleAttachmentDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsAttachmentDragOver(false);
    }
  }, []);

  const handleAttachmentDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      if (!hasTransferFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsAttachmentDragOver(false);
      await ingestFiles(filesFromDataTransfer(event.dataTransfer));
    },
    [ingestFiles],
  );

  const handleAttachmentPaste = useCallback(
    async (event: ClipboardEvent<HTMLElement>) => {
      const files = filesFromClipboard(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      await ingestFiles(files);
    },
    [ingestFiles],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    },
    [setAttachments],
  );

  return {
    handleAttachmentFileInputChange,
    handleAttachmentDrop,
    handleAttachmentDragEnter,
    handleAttachmentDragOver,
    handleAttachmentDragLeave,
    handleAttachmentPaste,
    isAttachmentDragOver,
    removeAttachment,
  };
}
