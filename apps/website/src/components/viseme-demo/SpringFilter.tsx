import { useEffect, useMemo, useRef, useState } from "react";
import { Pose } from "@vizij/config";
import { checkIsNumber } from "./BlendNode";

/**
 * SpringFilter hook converts a Pose into animated values using a simplified approach.
 * Since React hooks can't be called conditionally, we use a state-based spring simulation.
 */
export function useSpringFilter(
  inputPose: Pose | null,
  onOutputChange: (output: Pose) => void,
) {
  // Store current values and target values
  const [currentValues, setCurrentValues] = useState<Record<string, number>>(
    {},
  );
  const [targetValues, setTargetValues] = useState<Record<string, number>>({});
  const currentValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    currentValuesRef.current = currentValues;
  }, [currentValues]);

  const channelSet = useMemo(() => {
    if (!inputPose) {
      return {};
    }
    return inputPose.channelSet;
  }, [inputPose]);

  // Get all the paths we need to animate
  const springPaths = useMemo(() => {
    const paths: string[] = [];
    Object.entries(channelSet).forEach(([channelName, tracks]) => {
      tracks.forEach((trackName) => {
        paths.push(`${channelName}.${trackName}`);
      });
    });
    return paths;
  }, [channelSet]);

  function getDefaultValueForChannel(path: string) {
    return path.includes("scale") ? 1 : 0;
  }

  // Initialize values when paths change
  useEffect(() => {
    const initialValues: Record<string, number> = {};
    springPaths.forEach((path) => {
      const defaultValue = getDefaultValueForChannel(path);
      initialValues[path] = defaultValue;
    });
    setCurrentValues((prev) => ({ ...prev, ...initialValues }));
    currentValuesRef.current = {
      ...currentValuesRef.current,
      ...initialValues,
    };
    setTargetValues((prev) => ({ ...prev, ...initialValues }));
  }, [springPaths]);

  // Use useRef to maintain a stable reference to the latest onOutputChange
  const onOutputChangeRef = useRef(onOutputChange);
  useEffect(() => {
    onOutputChangeRef.current = onOutputChange;
  }, [onOutputChange]);

  // Update target values when inputPose changes
  useEffect(() => {
    if (!inputPose) {
      // Set neutral values when no pose is provided
      const neutralValues: Record<string, number> = {};
      springPaths.forEach((path) => {
        neutralValues[path] = getDefaultValueForChannel(path);
      });
      setTargetValues(neutralValues);
      return;
    }

    const newTargets: Record<string, number> = {};
    springPaths.forEach((path) => {
      const value = Pose.getValue(inputPose, path);
      if (value !== undefined && value !== null) {
        checkIsNumber(value, -1, -1, `SpringFilter channel ${path}`); // Validate it's a number
        newTargets[path] = value as number;
      } else {
        newTargets[path] = getDefaultValueForChannel(path);
      }
    });
    setTargetValues(newTargets);
  }, [inputPose, springPaths]);

  // Create output pose from current values
  // Simple spring animation using requestAnimationFrame
  useEffect(() => {
    let animationFrame: number | null = null;
    let lastTime = performance.now();
    let running = true;

    const createPoseFrom = (values: Record<string, number>) => {
      const output = Pose.create(channelSet);
      springPaths.forEach((path) => {
        const value = values[path];
        if (value !== undefined) {
          Pose.setValue(output, path, value);
        }
      });
      return output;
    };

    const animate = (currentTime: number) => {
      if (!running) return;

      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const latestValues = { ...currentValuesRef.current };
      let hasChanges = false;
      const springStiffness = 10;

      Object.keys(targetValues).forEach((path) => {
        const current = latestValues[path] ?? getDefaultValueForChannel(path);
        const target = targetValues[path] ?? getDefaultValueForChannel(path);
        const diff = target - current;

        if (Math.abs(diff) > 0.001) {
          const newValue = current + diff * springStiffness * deltaTime;
          latestValues[path] = newValue;
          hasChanges = true;
        } else {
          latestValues[path] = target;
        }
      });

      if (hasChanges) {
        currentValuesRef.current = latestValues;
        setCurrentValues(latestValues);
        onOutputChangeRef.current(createPoseFrom(latestValues));
        animationFrame = requestAnimationFrame(animate);
      } else {
        onOutputChangeRef.current(createPoseFrom(latestValues));
      }
    };

    const needsAnimation = Object.keys(targetValues).some((path) => {
      const current =
        currentValuesRef.current[path] ?? getDefaultValueForChannel(path);
      const target = targetValues[path] ?? getDefaultValueForChannel(path);
      return Math.abs(target - current) > 0.001;
    });

    if (needsAnimation) {
      animationFrame = requestAnimationFrame((time) => {
        lastTime = time;
        animate(time);
      });
    } else {
      onOutputChangeRef.current(createPoseFrom(currentValuesRef.current));
    }

    return () => {
      running = false;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [targetValues, channelSet, springPaths]);
}
