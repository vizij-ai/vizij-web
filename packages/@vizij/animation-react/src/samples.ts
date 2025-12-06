import {
  listAnimationFixtures,
  loadAnimationFixture,
  loadAnimationJson,
  resolveAnimationPath,
} from "@vizij/animation-wasm";

export {
  listAnimationFixtures,
  loadAnimationFixture,
  loadAnimationJson,
  resolveAnimationPath,
};

export const samples = {
  list: listAnimationFixtures,
  load: loadAnimationFixture,
  loadJson: loadAnimationJson,
  resolvePath: resolveAnimationPath,
} as const;
