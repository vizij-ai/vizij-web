import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import init, { Animation } from "@vizij/animation-wasm";

type Outputs = { value: number } | null;

type Ctx = {
  ready: boolean;
  outputs: Outputs;
  setFrequency: (f: number) => void;
  setAmplitude: (a: number) => void;
};

const AnimationCtx = createContext<Ctx | null>(null);

export const AnimationProvider: React.FC<{
  children: React.ReactNode;
  frequencyHz?: number;
  amplitude?: number;
}> = ({ children, frequencyHz = 1, amplitude = 1 }) => {
  const animRef = useRef<Animation | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const [ready, setReady] = useState(false);
  const [outputs, setOutputs] = useState<Outputs>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await init();
      const anim = new Animation({ frequency_hz: frequencyHz, amplitude });
      animRef.current = anim;
      setReady(true);
      const loop = (t: number) => {
        if (cancelled) return;
        const last = lastRef.current || t;
        const dt = (t - last) / 1000;
        lastRef.current = t;
        const out = anim.update(dt, {}) as unknown as Outputs;
        setOutputs(out);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [frequencyHz, amplitude]);

  const setFrequency = (f: number) => {
    animRef.current?.set_frequency(f);
  };

  const setAmplitude = (a: number) => {
    animRef.current?.set_amplitude(a);
  };

  return (
    <AnimationCtx.Provider value={{ ready, outputs, setFrequency, setAmplitude }}>
      {children}
    </AnimationCtx.Provider>
  );
};

export const useAnimation = () => {
  const ctx = useContext(AnimationCtx);
  if (!ctx) throw new Error("useAnimation must be used within AnimationProvider");
  return ctx;
};
