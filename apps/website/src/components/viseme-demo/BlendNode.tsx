import { create, all, MathJsInstance } from "mathjs";
import { useEffect, useRef, useMemo } from "react";
import { Pose, TrackValue } from "@vizij/config";

export function checkIsNumber(
  value: TrackValue,
  channelIndex: number,
  index: number,
  blendType: string,
) {
  if (!TrackValue.isNum(value)) {
    throw new Error(
      `Invalid value type ${typeof value} for ${blendType} blend mode` +
        (channelIndex > 0 && index > 0
          ? `at channel index ${channelIndex}, input index ${index}`
          : ""),
    );
  }
}

// Create a configured mathjs instance
const math = create(all) as MathJsInstance;

// Utility function for argmax (index of maximum value)
const argmax = (arr: number[]): number => {
  return arr.reduce(
    (maxIdx, current, idx, array) =>
      current !== null && current > array[maxIdx] ? idx : maxIdx,
    0,
  );
};

// Generic types for the abstract blending interface
export type ChannelValue = number;
export type WeightedPose = { pose: Pose; weight?: number }; // single pose with optional weight
export type WeightedPoseInputs = WeightedPose[]; // array of poses with weights

export interface BlendNodeProps {
  input: WeightedPoseInputs | Pose[]; // array of poses with weights for input A
  blendOperation:
    | "weighted_average"
    | "additive"
    | "multiply"
    | "weighted_overlay"
    | "weighted_average_overlay"
    | "max";
  basePose?: Pose; // optional base pose for overlay modes
  onPoseChange: (pose: Pose | null) => void; // callback for pose output
  debug?: boolean;
  displayName?: string;
}

export function blendNode({
  input,
  blendOperation,
  basePose,
  debug = false,
  displayName = "Unnamed",
}: Omit<BlendNodeProps, "onPoseChange">): Pose | null {
  const inputPoses =
    input.length > 0 && !("weight" in input[0])
      ? (input as Pose[]).map((pose) => ({ pose, weight: 1.0 }))
      : (input as WeightedPoseInputs);

  function validateInputs() {
    // First validate that all poses have the same channelset
    if (inputPoses.length > 0) {
      const channelSetA = inputPoses[0].pose.channelSet;
      for (let i = 1; i < inputPoses.length; i++) {
        if (inputPoses[i].pose.channelSet !== channelSetA) {
          console.warn(
            "BlendNode",
            displayName,
            "input validation failed: channel sets do not match",
            inputPoses[0].pose.channelSet,
            inputPoses[i].pose.channelSet,
          );
          return (
            displayName +
            " Input poses have mismatched channel sets: " +
            `pose 0 has ${Object.keys(channelSetA).length} channels, ` +
            `pose ${i} has ${Object.keys(inputPoses[i].pose.channelSet).length} channels.`
          );
        }
      }
    }

    return null;
  }

  const valres = validateInputs();
  if (valres) {
    console.warn(displayName, "BlendNode input validation failed:", valres);
    return null;
  }

  if (debug) {
    const timestamp = Date.now();
    console.log(
      `🔧 [${timestamp}] `,
      displayName,
      `BlendNode - Input poses:`,
      inputPoses,
    );
    console.log(
      `🔧 [${timestamp}] `,
      displayName,
      `BlendNode - Base pose:`,
      basePose,
    );
    console.log(
      `🔧 [${timestamp}] `,
      displayName,
      `BlendNode - Blend operation: `,
      blendOperation,
    );
  }

  // Step 1: Blend inputPoses using the specified blending mode
  const finalResult = unifiedBlend(inputPoses, blendOperation, basePose);

  if (debug) {
    const timestamp = Date.now();
    console.log(
      `🔧 [${timestamp}] `,
      displayName,
      `BlendNode - Final blended result:`,
      finalResult,
    );
  }

  return finalResult;
}

/**
 * Unified blending method that takes a vector of WeightedPose inputs and returns a single blended Pose.
 * Uses Math.js for efficient matrix operations and mathematical functions.
 *
 * @param inputs - Array of WeightedPose objects to blend
 * @param blendMode - The blending mode to use
 * @param basePose - Base pose as fallback or for some operations
 * @returns Blended pose or null if no valid result
 */
function unifiedBlend(
  inputs: WeightedPoseInputs,
  blendMode:
    | "weighted_average"
    | "additive"
    | "multiply"
    | "weighted_overlay"
    | "weighted_average_overlay"
    | "max",
  basePose?: Pose,
): Pose | null {
  if (inputs.length === 0) {
    return basePose || null;
  }

  // Use the first pose's channelSet as the template (all should be compatible)
  const templatePose = inputs[0].pose;
  const resultPose = Pose.create(templatePose.channelSet);

  // Step 1: Collect union of all channels defined by any input pose
  // Initialize with the channels defined in basePose if provided
  const activeChannels = new Set<number>();
  if (basePose) {
    basePose.values.forEach((value, index) => {
      if (value !== null) {
        activeChannels.add(index);
      }
    });
  }
  inputs.forEach(({ pose }) => {
    pose.values.forEach((value, index) => {
      if (value !== null) {
        activeChannels.add(index);
      }
    });
  });

  if (activeChannels.size === 0) {
    return basePose || null;
  }

  // Convert to sorted array for consistent processing
  const channelIndices = Array.from(activeChannels).sort((a, b) => a - b);

  // Step 2: Create value matrix [channels × poses]:float, mask matrix [channels x poses]:int and weight vector [poses]:float
  const valueMatrix = channelIndices.map((channelIndex) =>
    inputs.map(({ pose }) => pose.values[channelIndex] ?? 0),
  );

  const maskMatrix = channelIndices.map((channelIndex) =>
    inputs.map(({ pose }) => (pose.values[channelIndex] !== null ? 1 : 0)),
  );

  const inputWeights = inputs.map(({ weight }) => weight ?? 1.0);

  // Define helper functions for blending modes

  function weightedSumVector(
    values: TrackValue[],
    weights: number[],
    masks: number[],
  ): {
    totalWeightedSum: number;
    totalWeight: number;
    maxWeight: number;
  } {
    // Verify track values are all numbers first
    values.forEach((value, idx) => {
      if (value !== null) {
        checkIsNumber(value, -1, idx, "weightedSumVector");
      }
    });
    // Element-wise operations: value * weight * mask
    const weightedValues = math.dotMultiply(
      math.dotMultiply(values as number[], weights),
      masks,
    );
    const effectiveWeights = math.dotMultiply(weights, masks);

    const totalWeightedSum = math.sum(weightedValues);
    const totalWeight = math.sum(effectiveWeights);
    const maxWeight = math.max(effectiveWeights);

    return {
      totalWeightedSum,
      totalWeight,
      maxWeight,
    };
  }

  function resultSafeSet(
    index: number,
    valueIfTrue: number,
    condition?: boolean,
  ) {
    if (condition && !Number.isNaN(valueIfTrue)) {
      return valueIfTrue;
    } else {
      return basePose ? basePose.values[index] : null;
    }
  }

  // Step 3: Perform blending using Math.js operations
  switch (blendMode) {
    case "weighted_average": {
      // For each channel: Σ(value[i] * weight[i] * mask[i]) / Σ(weight[i] * mask[i])
      channelIndices.forEach((channelIndex, i) => {
        const { totalWeightedSum, totalWeight, maxWeight } = weightedSumVector(
          valueMatrix[i],
          inputWeights,
          maskMatrix[i],
        );

        resultPose.values[channelIndex] = resultSafeSet(
          channelIndex,
          totalWeightedSum / (totalWeight / maxWeight),
          totalWeight > 0,
        );
      });
      break;
    }

    case "additive": {
      // For each channel: Σ(value[i] * weight[i] * mask[i])
      channelIndices.forEach((channelIndex, i) => {
        // Element-wise operations: value * weight * mask
        const { totalWeightedSum, totalWeight } = weightedSumVector(
          valueMatrix[i],
          inputWeights,
          maskMatrix[i],
        );

        resultPose.values[channelIndex] = resultSafeSet(
          channelIndex,
          totalWeightedSum,
          totalWeight > 0,
        );
      });
      break;
    }

    case "multiply": {
      // For each channel: Π( (1 - weight[i]) + value[i] * weight[i] * mask[i] )
      channelIndices.forEach((channelIndex, i) => {
        const values = valueMatrix[i];
        const masks = maskMatrix[i];

        // Element-wise operations: (1 - weight) + value * weight * mask
        const factors = values.map((value, j) => {
          checkIsNumber(value, channelIndex, j, "multiply");
          const weight = inputWeights[j];
          const mask = masks[j];
          return 1 - weight + (value as number) * weight * mask;
        });

        const product = factors.reduce((acc, val) => acc * val, 1);
        resultPose.values[channelIndex] = product;
      });
      break;
    }

    case "max": {
      // For each channel: prefer the highest-weighted input when available, otherwise use base pose
      channelIndices.forEach((channelIndex, i) => {
        const values = valueMatrix[i];

        const selectedIndex = argmax(inputWeights);
        const selectedWeight = inputWeights[selectedIndex];
        const selectedValue = values[selectedIndex];

        if (selectedValue !== null) {
          checkIsNumber(selectedValue, channelIndex, selectedIndex, "max");
          resultPose.values[channelIndex] =
            (selectedValue as number) * selectedWeight;
        } else if (basePose) {
          resultPose.values[channelIndex] = basePose.values[channelIndex];
        } else {
          resultPose.values[channelIndex] = null;
        }
      });
      break;
    }

    case "weighted_overlay": {
      // For each channel, interpolate from base into weighted sum of inputs
      channelIndices.forEach((channelIndex, i) => {
        const { totalWeightedSum, maxWeight } = weightedSumVector(
          valueMatrix[i],
          inputWeights,
          maskMatrix[i],
        );

        if (totalWeightedSum !== null) {
          if (basePose && basePose.values[channelIndex] !== null) {
            checkIsNumber(
              basePose.values[channelIndex],
              channelIndex,
              i,
              "weighted_overlay",
            );
            resultPose.values[channelIndex] =
              (basePose.values[channelIndex] as number) * (1 - maxWeight) +
              totalWeightedSum * maxWeight;
          } else {
            resultPose.values[channelIndex] = totalWeightedSum;
          }
        } else if (basePose) {
          resultPose.values[channelIndex] = basePose.values[channelIndex];
        } else {
          resultPose.values[channelIndex] = null;
        }
      });
      break;
    }

    case "weighted_average_overlay": {
      // For each channel, interpolate from base into weighted sum of inputs
      channelIndices.forEach((channelIndex, i) => {
        // First get the base value of this channel
        // Then compute the diff between the base and each target value (turning the valueMatrix into a diffMatrix)
        // Then compute the weighted average of the diffs
        // Finally apply the weighted average diff to the base value

        const diffMatrix =
          basePose && basePose.values[channelIndex] !== null
            ? valueMatrix[i].map((value, j) => {
                if (value !== null) {
                  checkIsNumber(
                    value,
                    channelIndex,
                    j,
                    "weighted_average_overlay",
                  );
                  return (
                    (value as number) -
                    (basePose.values[channelIndex] as number)
                  );
                } else {
                  return null;
                }
              })
            : valueMatrix[i];

        const { totalWeightedSum, totalWeight, maxWeight } = weightedSumVector(
          diffMatrix,
          inputWeights,
          maskMatrix[i],
        );

        if (totalWeightedSum !== null && totalWeight > 0) {
          const average_divider =
            inputWeights.length > 1 ? totalWeight / maxWeight : 1;
          const average_weighted_sum = totalWeightedSum / average_divider;
          if (basePose && basePose.values[channelIndex] !== null) {
            checkIsNumber(
              basePose.values[channelIndex],
              channelIndex,
              i,
              "weighted_average_overlay",
            );
            resultPose.values[channelIndex] =
              (basePose.values[channelIndex] as number) + average_weighted_sum;
          } else {
            resultPose.values[channelIndex] = average_weighted_sum;
          }
        } else if (basePose) {
          resultPose.values[channelIndex] = basePose.values[channelIndex];
        } else {
          resultPose.values[channelIndex] = null;
        }
      });
      break;
    }

    default: {
      // Default: use highest-weighted input when available, otherwise use base pose
      channelIndices.forEach((channelIndex, i) => {
        const values = valueMatrix[i];

        const selectedIndex = argmax(inputWeights);
        const selectedWeight = inputWeights[selectedIndex];
        const selectedValue = values[selectedIndex];

        if (selectedValue !== null) {
          checkIsNumber(selectedValue, channelIndex, selectedIndex, "default");
          resultPose.values[channelIndex] =
            (selectedValue as number) * selectedWeight;
        } else if (basePose) {
          resultPose.values[channelIndex] = basePose.values[channelIndex];
        } else {
          resultPose.values[channelIndex] = null;
        }
      });
      break;
    }
  }

  return resultPose;
}

/**
 * Hook version of blendNode that automatically triggers when inputs change
 */
export function useBlendNode(
  input: WeightedPoseInputs | Pose[],
  blendOperation:
    | "weighted_average"
    | "additive"
    | "multiply"
    | "weighted_overlay"
    | "weighted_average_overlay"
    | "max",
  basePose: Pose | undefined,
  onPoseChange: (pose: Pose | null) => void,
  debug?: boolean,
  displayName?: string,
) {
  const onPoseChangeRef = useRef(onPoseChange);
  useEffect(() => {
    onPoseChangeRef.current = onPoseChange;
  }, [onPoseChange]);

  // Memoize the normalized input to prevent unnecessary re-renders when the input array is recreated
  const normalizedInput = useMemo(() => {
    if (input === undefined || input === null || input.length === 0) return [];

    // Convert to a stable format for comparison
    return input.length > 0 && !("weight" in input[0])
      ? (input as Pose[]).map((pose) => ({ pose, weight: 1.0 }))
      : (input as WeightedPoseInputs);
  }, [input]);

  // Create a stable dependency for basePose by serializing its key properties
  const basePoseDependency = useMemo(() => {
    if (!basePose) return null;
    // Create a stable representation of the basePose for dependency tracking
    return {
      channelSetKeys: Object.keys(basePose.channelSet).sort(),
      valuesHash: basePose.values
        .map((v, i) => (v !== null ? `${i}:${v}` : `${i}:null`))
        .join("|"),
    };
  }, [basePose]);

  useEffect(() => {
    if (debug) {
      console.log(
        "useBlendNode",
        displayName,
        "triggered with inputs:",
        blendOperation,
        normalizedInput,
        "basePose:",
        basePose,
      );
    }
    if (
      normalizedInput === undefined ||
      normalizedInput == null ||
      normalizedInput.length === 0
    ) {
      if (debug) {
        console.log(
          "useBlendNode",
          displayName,
          "no input poses, returning basePose:",
          basePose,
        );
      }
      if (!basePose) {
        onPoseChangeRef.current(basePose || null);
      }
      return;
    }
    const result = blendNode({
      input: normalizedInput,
      blendOperation,
      basePose,
      debug,
      displayName,
    });

    onPoseChangeRef.current(result);
  }, [
    normalizedInput,
    blendOperation,
    basePoseDependency,
    debug,
    basePose,
    displayName,
  ]);
}
