import { useCallback, useState } from "react";

export const FEATURE_FLAG_DEFAULTS = {
  vectorAuthoringBeta: true,
  conditionalAuthoringBeta: true,
  irInspectorBeta: true,
} as const;

export type AuthoringFeatureFlag = keyof typeof FEATURE_FLAG_DEFAULTS;
export type FeatureFlagState = Record<AuthoringFeatureFlag, boolean>;

interface UseFeatureLabelsOptions {
  initialOverrides?: Record<string, string>;
  initialFlags?: FeatureFlagState;
}

export function useFeatureLabels(options?: UseFeatureLabelsOptions) {
  const [featureLabelOverrides, setFeatureLabelOverrides] = useState<
    Record<string, string>
  >(options?.initialOverrides ?? {});
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagState>(
    options?.initialFlags ?? FEATURE_FLAG_DEFAULTS,
  );

  const handleUpdateFeatureLabel = useCallback(
    (featureId: string, defaultLabel: string, value: string) => {
      const trimmed = value.trim();
      const normalizedDefault = defaultLabel.trim();
      setFeatureLabelOverrides((previous) => {
        if (!trimmed.length || trimmed === normalizedDefault) {
          if (!(featureId in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[featureId];
          return next;
        }
        if (previous[featureId] === trimmed) {
          return previous;
        }
        return {
          ...previous,
          [featureId]: trimmed,
        };
      });
    },
    [],
  );

  const handleFeatureFlagChange = useCallback(
    (flag: AuthoringFeatureFlag, enabled: boolean) => {
      setFeatureFlags((previous) => {
        if (previous[flag] === enabled) {
          return previous;
        }
        return {
          ...previous,
          [flag]: enabled,
        };
      });
    },
    [],
  );

  return {
    featureLabelOverrides,
    setFeatureLabelOverrides,
    featureFlags,
    setFeatureFlags,
    handleUpdateFeatureLabel,
    handleFeatureFlagChange,
  };
}
