export type PoseContributionSemantics = {
  targetValue: number;
  appliedValue: number;
  neutralValue: number;
  targetOffset: number;
  appliedOffset: number;
  contributionStrength: number | null;
};

type ComputePoseContributionSemanticsArgs = {
  targetValue: number;
  appliedValue: number;
  neutralValue: number;
  epsilon?: number;
};

export function computePoseContributionSemantics({
  targetValue,
  appliedValue,
  neutralValue,
  epsilon = 0.000001,
}: ComputePoseContributionSemanticsArgs): PoseContributionSemantics {
  const targetOffset = targetValue - neutralValue;
  const appliedOffset = appliedValue - neutralValue;
  const hasResolvableTarget = Math.abs(targetOffset) > epsilon;
  return {
    targetValue,
    appliedValue,
    neutralValue,
    targetOffset,
    appliedOffset,
    contributionStrength: hasResolvableTarget
      ? appliedOffset / targetOffset
      : null,
  };
}
