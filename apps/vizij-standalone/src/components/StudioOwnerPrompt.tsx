// In-app prompt for the Semio Studio device owner (studio-bridge feature).
//
// On mount it asks the Rust side (`studio_bridge_owner_status`) whether the app
// was built with the studio-bridge feature AND still needs an owner. Only then
// does it render a modal asking for the Studio user ID (Firebase UID). The
// device connects to the bridge regardless; the answer only decides which Studio
// account(s) can see and claim it. Submitting persists the choice Rust-side and
// re-registers the device live — so this never asks again, and no restart is
// needed. When the feature is off the command reports `active: false` and this
// renders nothing.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface StudioOwnerStatus {
  active: boolean;
  needs_prompt: boolean;
  owners: string[];
}

export function StudioOwnerPrompt() {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ask Rust whether we should prompt (feature on + no owner known yet).
  useEffect(() => {
    let mounted = true;
    invoke<StudioOwnerStatus>("studio_bridge_owner_status")
      .then((status) => {
        if (mounted && status.active && status.needs_prompt) {
          setVisible(true);
        }
      })
      .catch(() => {
        // Command unavailable (older shell) or feature off — never prompt.
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Focus the input as soon as the modal appears.
  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  const submit = async (owners: string[]) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await invoke("studio_bridge_set_owners", { owners });
      setVisible(false);
    } catch (err) {
      console.error("[vizij-standalone] Failed to set studio owners:", err);
      setSubmitting(false);
    }
  };

  const register = () => {
    const owners = value
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    void submit(owners);
  };

  // Skip = register unowned. Persists an explicit empty so we never ask again.
  const skip = () => void submit([]);

  // Escape anywhere = skip.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, submitting]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-owner-title"
        className="w-full max-w-md rounded-xl bg-neutral-900 p-6 text-neutral-100 shadow-2xl"
      >
        <h2 id="studio-owner-title" className="text-lg font-semibold">
          Register with Semio Studio
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          Enter your Semio Studio user ID (Firebase UID) so this device appears
          in your Studio account. You can enter several, comma-separated. Skip
          to register the device unowned — no one sees it until you claim it.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") register();
          }}
          placeholder="Firebase UID(s), comma-separated"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          className="mt-4 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={skip}
            disabled={submitting}
            className="rounded-lg bg-neutral-700 px-4 py-2 text-sm transition-colors hover:bg-neutral-600 disabled:opacity-50"
          >
            Skip (register unowned)
          </button>
          <button
            type="button"
            onClick={register}
            disabled={submitting || value.trim() === ""}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

export default StudioOwnerPrompt;
