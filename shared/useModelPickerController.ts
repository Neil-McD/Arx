import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";

const MODEL_SECTION_ORDER: Record<string, number> = {
  all: 0,
  free: 1,
  openai: 2,
  anthropic: 3,
  google: 4,
  "x-ai": 5,
  openrouter: 6,
};

type UseModelPickerControllerArgs<
  ModelT extends {
    id: string;
    label: string;
    section: SectionT;
  },
  SectionT extends string,
> = {
  curatedPickerModels: readonly ModelT[];
  modelPickerQuery: string;
  modelPickerSection: SectionT;
  setModelPickerQuery: Dispatch<SetStateAction<string>>;
  setModelPickerSection: Dispatch<SetStateAction<SectionT>>;
  setIsModelPickerOpen: Dispatch<SetStateAction<boolean>>;
  allSectionId: SectionT;
};

export function useModelPickerController<
  ModelT extends {
    id: string;
    label: string;
    section: SectionT;
  },
  SectionT extends string,
>(
  args: UseModelPickerControllerArgs<ModelT, SectionT>,
): {
  visiblePickerModels: ModelT[];
  openModelPicker: () => void;
  closeModelPicker: () => void;
} {
  const visiblePickerModels = useMemo(() => {
    const normalizedQuery = args.modelPickerQuery.trim().toLowerCase();
    const filtered = args.curatedPickerModels.filter((model) => {
      if (args.modelPickerSection !== args.allSectionId && model.section !== args.modelPickerSection) return false;
      if (!normalizedQuery) return true;
      return (
        model.label.toLowerCase().includes(normalizedQuery) || model.id.toLowerCase().includes(normalizedQuery)
      );
    });

    return filtered.slice().sort((left, right) => {
      const leftOrder = MODEL_SECTION_ORDER[left.section] ?? 99;
      const rightOrder = MODEL_SECTION_ORDER[right.section] ?? 99;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.label.localeCompare(right.label);
    });
  }, [args.curatedPickerModels, args.modelPickerQuery, args.modelPickerSection, args.allSectionId]);

  const openModelPicker = useCallback(() => {
    args.setModelPickerQuery("");
    args.setModelPickerSection(args.allSectionId);
    args.setIsModelPickerOpen(true);
  }, [args.setModelPickerQuery, args.setModelPickerSection, args.setIsModelPickerOpen, args.allSectionId]);

  const closeModelPicker = useCallback(() => {
    args.setIsModelPickerOpen(false);
    args.setModelPickerQuery("");
  }, [args.setIsModelPickerOpen, args.setModelPickerQuery]);

  return {
    visiblePickerModels,
    openModelPicker,
    closeModelPicker,
  };
}
