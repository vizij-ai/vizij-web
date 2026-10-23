import { useCallback, useEffect, useRef, useState } from "react";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";
import { Button } from "../../ui";

/** The face standard's expression weights, relative to the face. */
const EXPRESSIONS = "standard/vizij/expression/";

/** The expressions the demo offers, in order, where the face implements
 * them. */
const FEATURED_EXPRESSIONS = [
  "concerned",
  "happy",
  "sad",
  "sleepy",
  "surprised",
  "angry",
] as const;

const WEIGHT = 0.75;
const RISE_SECONDS = 0.25;
const RELEASE_DELAY_MS = 650;
const RELEASE_SECONDS = 0.35;

function formatLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * A button per featured expression the face implements — the expression
 * keys its device lists. A press eases that expression up, every other one
 * back to 0, and releases it shortly after.
 */
export function DemoEmotionRow() {
  const { status, runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();
  const [expressions, setExpressions] = useState<string[]>([]);
  const releaseRef = useRef<number | null>(null);

  useEffect(() => {
    setExpressions([]);
    if (!runtime) {
      return;
    }
    let current = true;
    const prefix = runtime.path(EXPRESSIONS);
    runtime.listKeys(prefix).then(
      (keys) => {
        if (!current) {
          return;
        }
        const implemented = new Set(
          keys.map((key) => key.path.slice(prefix.length)),
        );
        setExpressions(
          FEATURED_EXPRESSIONS.filter((name) => implemented.has(name)),
        );
      },
      (error: unknown) => {
        console.error(
          "[vizij-authoring] the demo face's expressions did not list",
          error,
        );
      },
    );
    return () => {
      current = false;
    };
  }, [runtime]);

  const ease = useCallback(
    (name: string, weight: number, seconds: number) => {
      if (!runtime) {
        return;
      }
      void animateValue(runtime.path(`${EXPRESSIONS}${name}`), weight, {
        duration: seconds,
        easing: "easeInOut",
      }).catch((error: unknown) => {
        console.error(
          `[vizij-authoring] the demo face's ${name} expression did not move`,
          error,
        );
      });
    },
    [animateValue, runtime],
  );

  const trigger = useCallback(
    (name: string) => {
      expressions.forEach((other) => {
        ease(other, other === name ? WEIGHT : 0, RISE_SECONDS);
      });
      if (releaseRef.current !== null) {
        window.clearTimeout(releaseRef.current);
      }
      releaseRef.current = window.setTimeout(() => {
        releaseRef.current = null;
        ease(name, 0, RELEASE_SECONDS);
      }, RELEASE_DELAY_MS);
    },
    [ease, expressions],
  );

  useEffect(
    () => () => {
      if (releaseRef.current !== null) {
        window.clearTimeout(releaseRef.current);
      }
    },
    [],
  );

  if (status !== "ready" || expressions.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="empty-state-demo-emotions"
      className="flex flex-wrap justify-center gap-2"
    >
      {expressions.map((name) => (
        <Button
          key={name}
          data-testid={`empty-state-demo-emotion-${name}`}
          variant="secondary"
          size="sm"
          onClick={() => trigger(name)}
        >
          {formatLabel(name)}
        </Button>
      ))}
    </div>
  );
}
