import { omit } from "lodash";
import { AnimatableValue } from "@semio/utils";
import { type Stored } from "../types/stored";
import { type RenderableBase } from "../types/renderable-base";
import { Body, BodyFeature, StoredBody } from "../types/body";
import { Joint, JointFeature, StoredJoint } from "../types/joint";
import { Shape, ShapeFeature, StoredShape } from "../types/shape";
import { Screen, ScreenFeature, StoredScreen } from "../types/screen";
import { Light, LightFeature, StoredLight } from "../types/light";
import { Feature } from "../types/feature";
import { createStoredFeatures } from "./create-stored-features";

export function createStoredRenderable<T extends RenderableBase>(
  data: T,
  animatableValues: Record<string, AnimatableValue>,
): Stored<T> {
  const d = omit(data, "refs", "geometry");
  const storedFeatures = createStoredFeatures(
    data.features as Record<string, Feature>,
    animatableValues,
  );
  return { ...d, features: storedFeatures };
}

export function createStoredBody(
  data: Body | Omit<Body, "refs">,
  animatableValues: Record<string, AnimatableValue>,
): StoredBody {
  const body = omit(data, "refs");
  const storedFeatures = createStoredFeatures(
    data.features as Record<BodyFeature, Feature>,
    animatableValues,
  );
  return { ...body, features: storedFeatures };
}

export function createStoredJoint(
  data: Joint | Omit<Joint, "refs">,
  animatableValues: Record<string, AnimatableValue>,
): StoredJoint {
  const joint = omit(data, "refs");
  const storedFeatures = createStoredFeatures(
    data.features as Record<JointFeature, Feature>,
    animatableValues,
  );
  return { ...joint, features: storedFeatures };
}

export function createStoredShape(
  data: Shape | Omit<Shape, "refs">,
  animatableValues: Record<string, AnimatableValue>,
): StoredShape {
  const shape = omit(data, "refs", "geometry");
  const storedFeatures = createStoredFeatures(
    data.features as Record<ShapeFeature, Feature>,
    animatableValues,
  );
  return { ...shape, features: storedFeatures };
}

export function createStoredScreen(
  data: Screen | Omit<Screen, "refs">,
  animatableValues: Record<string, AnimatableValue>,
): StoredScreen {
  const screen = omit(data, "refs");
  const storedFeatures = createStoredFeatures(
    data.features as Record<ScreenFeature, Feature>,
    animatableValues,
  );
  return { ...screen, features: storedFeatures };
}

export function createStoredLight(
  data: Light | Omit<Light, "refs">,
  animatableValues: Record<string, AnimatableValue>,
): StoredLight {
  const light = omit(data, "refs");
  const storedFeatures = createStoredFeatures(
    data.features as Record<LightFeature, Feature>,
    animatableValues,
  );
  return { ...light, features: storedFeatures };
}
