import { describe, expect, it } from "vitest";
import {
  buildAnimationControllerCommandPath,
  buildAnimationControllerInstancePath,
  buildAnimationControllerPlayInputs,
  prepareAnimationRegistrationForTransport,
  resolveAnimationTransportMode,
} from "../index";

describe("animation transport support", () => {
  it("uses orchestrator playback for Arora web runtimes in auto mode", () => {
    expect(resolveAnimationTransportMode("auto", "aroraWeb")).toBe(
      "orchestrator",
    );
    expect(resolveAnimationTransportMode(undefined, "aroraWeb")).toBe(
      "orchestrator",
    );
    expect(resolveAnimationTransportMode("auto", "moduleFacade")).toBe("host");
  });

  it("builds controller-scoped command and instance paths", () => {
    expect(
      buildAnimationControllerCommandPath(
        "demo-player/animation/blink",
        "seek",
      ),
    ).toBe("anim/controller/demo-player/animation/blink/player/0/cmd/seek");
    expect(
      buildAnimationControllerInstancePath(
        "demo-player/animation/blink",
        "weight",
      ),
    ).toBe(
      "anim/controller/demo-player/animation/blink/player/0/instance/0/weight",
    );
  });

  it("builds the full play pulse sent to animation controllers", () => {
    expect(
      buildAnimationControllerPlayInputs("demo-player/animation/blink", {
        reset: true,
        loop: false,
        speed: 1.5,
        weight: 0.75,
      }),
    ).toEqual([
      {
        path: "anim/controller/demo-player/animation/blink/player/0/cmd/seek",
        value: { float: 0 },
      },
      {
        path: "anim/controller/demo-player/animation/blink/player/0/cmd/set_loop",
        value: "once",
      },
      {
        path: "anim/controller/demo-player/animation/blink/player/0/cmd/set_speed",
        value: { float: 1.5 },
      },
      {
        path: "anim/controller/demo-player/animation/blink/player/0/instance/0/weight",
        value: { float: 0.75 },
      },
      {
        path: "anim/controller/demo-player/animation/blink/player/0/cmd/play",
        value: { bool: true },
      },
    ]);
  });

  it("pauses registered clips when the orchestrator owns playback transport", () => {
    const config = {
      id: "demo-player/animation/blink",
      setup: {
        player: { name: "blink-player", speed: 1, loopMode: "loop" },
        instance: { weight: 0.75, active: true },
      },
    } as const;

    expect(
      prepareAnimationRegistrationForTransport(config, "orchestrator"),
    ).toEqual({
      id: "demo-player/animation/blink",
      setup: {
        player: { name: "blink-player", speed: 0, loopMode: "loop" },
        instance: { weight: 0.75, active: true },
      },
    });
    expect(prepareAnimationRegistrationForTransport(config, "host")).toBe(
      config,
    );
  });
});
