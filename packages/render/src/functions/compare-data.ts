// import { mapValues } from "lodash";
import { AnimatableValue } from "@vizij/utils";
// import stringify from "json-stable-stringify";
import { World } from "../types/world";
// import { Shape, StoredShape } from "../types/shape";
// import { Body, StoredBody } from "../types/body";
// import { Joint, JointType, StoredJoint } from "../types/joint";
// import { Screen, StoredScreen } from "../types/screen";
// import { Light, StoredLight } from "../types/light";
// import {
//   createStoredBody,
//   createStoredJoint,
//   createStoredLight,
//   createStoredScreen,
//   createStoredShape,
// } from "./create-stored-data";

export function compareData(
  world1: World,
  world2: World,
  animatableValues1: Record<string, AnimatableValue>,
  animatableValues2: Record<string, AnimatableValue>,
) {
  // Test if generated world and world data match
  const world1Keys = Object.keys(world1);
  const world2Keys = Object.keys(world2);
  if (world1Keys.length !== world2Keys.length) {
    console.error(
      "Keys in generated world and world data do not match in length",
      world1Keys.length,
      world2Keys.length,
    );
  } else {
    console.log("Keys in generated world and world data match in length");
  }
  if (!arraysEqual(world1Keys, world2Keys)) {
    console.error(
      "Keys in generated world and world data do not match",
      world1Keys,
      world2Keys,
    );
  } else {
    console.log("Keys in generated world and world data match");
  }

  world1Keys.forEach((key) => {
    if (world1[key].type !== world2[key].type) {
      console.error(
        "Types in generated world and world data do not match",
        world1[key].type,
        world2[key].type,
      );
    }
  });

  // Test if generated data match
  // We will see if the stored versions of each are the same
  // const world1Stored = store(world1, animatableValues1);
  // const world2Stored = store(world2, animatableValues2);
  // if (stringify(world1Stored) !== stringify(world2Stored)) {
  //   console.error("Stored world data does not match", world1Stored, world2Stored);
  // } else {
  //   console.log("Stored world data matches");
  // }

  // Test if generated animatables and animated values match
  const animatableValues1Keys = Object.keys(animatableValues1);
  const animatableValues2Keys = Object.keys(animatableValues2);
  if (animatableValues1Keys.length !== animatableValues2Keys.length) {
    console.error(
      "Keys in generated animatables and animated values do not match in length",
      animatableValues1Keys.length,
      animatableValues2Keys.length,
    );
  } else {
    console.log(
      "Keys in generated animatables and animated values match in length",
    );
  }
  if (!arraysEqual(animatableValues1Keys, animatableValues2Keys)) {
    console.error(
      "Keys in generated animatables and animated values do not match",
      animatableValues1Keys,
      animatableValues2Keys,
    );
  } else {
    console.log("Keys in generated animatables and animated values match");
  }
}

const arraysEqual = (a: string[], b: string[]): boolean => {
  return (
    a.every((item) => b.includes(item)) && b.every((item) => a.includes(item))
  );
};

// function store(
//   world: World,
//   animatableValues: Record<string, AnimatableValue>,
// ) {

//   return mapValues(world, (e) => {
//     if (e.type === "light") {
//       return createStoredLight(e as Light, animatableValues);
//     } else if (e.type === "screen") {
//       return createStoredScreen(e as Screen, animatableValues);
//     } else if (e.type === "shape") {
//       return createStoredShape(e as Shape, animatableValues);
//     } else if (e.type in JointType) {
//       return createStoredJoint(e as Joint, animatableValues);
//     } else {
//       return createStoredBody(e as Body, animatableValues);
//     }
//   });
// }
