import { useState, useEffect, useMemo } from "react";
import { VizijLowRig, Pose } from "@vizij/config";
import { useBlendNode } from "./BlendNode";
import { useSpringFilter } from "./SpringFilter";
import { WeightedPose } from "./BlendNode";

interface BlendTreeProps {
  inputPoses: WeightedPose[];
  neutralPose: Pose;
  visemePose: Pose;
  debug?: boolean;
  outputRigs: VizijLowRig[];
}

/**
 * Custom hook that encapsulates the entire blending pipeline:
 * 1. Expression blend (inputPoses + neutralPose)
 * 2. Spring filtering
 * 3. Final blend (filtered + visemePose)
 * 4. Rig output
 */
export function useBlendTree({
  inputPoses,
  neutralPose,
  visemePose,
  outputRigs,
  debug = false,
}: BlendTreeProps) {
  // Internal state for the pipeline stages
  const [expressionPose, setExpressionPose] = useState<Pose | null>(null);
  const [filteredPose, setFilteredPose] = useState<Pose | null>(null);
  const [blendedPose, setBlendedPose] = useState<Pose | null>(null);

  // Memoize the final blend input to prevent recreation on every render
  const finalBlendInput = useMemo(() => {
    return filteredPose ? [filteredPose, visemePose] : [visemePose];
  }, [filteredPose, visemePose]);

  if (debug) {
    console.log("useBlendTree inputPoses:", inputPoses);
  }
  // Expression blend using the hook
  useBlendNode(
    inputPoses,
    "weighted_average_overlay",
    neutralPose,
    setExpressionPose,
    debug,
    "Expression Blend",
  );

  // Convert the blended pose to spring-animated values
  useSpringFilter(expressionPose, setFilteredPose);

  // Final blend: Combine filtered expression pose with viseme data
  useBlendNode(
    finalBlendInput,
    "weighted_average",
    neutralPose,
    setBlendedPose,
    debug,
    "Viseme Blend",
  );

  // Send the final pose to the rig output - separate effect to avoid circular dependency
  useEffect(() => {
    if (blendedPose) {
      for (const rig of outputRigs) {
        rig.apply(blendedPose);
      }
    }
  }, [blendedPose, outputRigs]);

  // Return the current state for debugging or external use if needed
  return {
    expressionPose,
    filteredPose,
    blendedPose,
    outputRigs,
  };
}
