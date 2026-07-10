import { useMemo } from "react";

import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_ACTIVE_MODEL_LABEL,
  type ModelToggle,
} from "../../../../shared/modelCatalog";

type UseWebWorkspaceModelStateControllerParams = {
  modelToggles: ModelToggle[];
};

export function useWebWorkspaceModelStateController(
  params: UseWebWorkspaceModelStateControllerParams,
) {
  const platformModel = useMemo(
    () =>
      params.modelToggles.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID) ??
      params.modelToggles[0] ?? {
        id: DEFAULT_ACTIVE_MODEL_ID,
        label: DEFAULT_ACTIVE_MODEL_LABEL,
        enabled: true,
      },
    [params.modelToggles],
  );

  return {
    derived: {
      activeModelLabel: platformModel.label,
      selectedModelId: platformModel.id,
      modelToggles: params.modelToggles,
    },
  };
}
