/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@semio/eslint-config/react.js"],
  rules: {
    "react/no-unknown-property": [
      "error",
      {
        ignore: [
          "args",
          "position",
          "shadow-mapSize",
          "intensity",
          "castShadow",
          "userData",
          "rotation",
          "attach",
          "uuid",
          "geometry",
          "up",
          "onBeforeRender",
          "transparent",
          "wireframe",
          "toneMapped",
          "side",
          "receiveShadow",
          "depthTest",
          "dispose",
          "object",
          "morphTargetDictionary",
          "morphTargetInfluences",
        ],
      },
    ],
    "no-console": "off",
  },
};
