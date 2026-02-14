import { useCallback, type ChangeEvent, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type UseMessageAttachmentInputControllerArgs<AttachmentT extends { id: string }> = {
  attachmentsRef: MutableRefObject<AttachmentT[]>;
  setAttachments: Dispatch<SetStateAction<AttachmentT[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  ingestAttachmentsFromFileList: (
    files: FileList,
    existing: AttachmentT[],
    onError: (message: string) => void,
  ) => Promise<AttachmentT[]>;
};

export function useMessageAttachmentInputController<AttachmentT extends { id: string }>(
  args: UseMessageAttachmentInputControllerArgs<AttachmentT>,
): {
  handleAttachmentFileInputChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  removeAttachment: (id: string) => void;
} {
  const {
    attachmentsRef,
    setAttachments,
    setError,
    ingestAttachmentsFromFileList,
  } = args;

  const handleAttachmentFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const files = input.files;
      if (!files || files.length === 0) {
        input.value = "";
        return;
      }
      setError(null);
      const updated = await ingestAttachmentsFromFileList(files, attachmentsRef.current, (message) => {
        setError(message);
      });
      setAttachments(updated);
      input.value = "";
    },
    [attachmentsRef, ingestAttachmentsFromFileList, setAttachments, setError],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    },
    [setAttachments],
  );

  return {
    handleAttachmentFileInputChange,
    removeAttachment,
  };
}
