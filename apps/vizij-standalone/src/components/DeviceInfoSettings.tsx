// Device-info section of the settings page. The Studio device name and the
// owner list (one uid per entry, each with an Owner/Editor/Viewer role) are
// editable; saving persists them on the Rust side and re-registers the device
// with Studio live. Editor/viewer roles are kept in the persisted config only:
// the Studio registration currently carries owner-role entries (the bridge
// client's DeviceInfo has a flat owner list).

import { useState } from "react";
import type {
  StudioDeviceConfig,
  StudioOwnerEntry,
  StudioRole,
} from "../hooks/useStudioDevice";

const ROLES: StudioRole[] = ["owner", "editor", "viewer"];

const ROLE_LABELS: Record<StudioRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const FIELD_CLASS =
  "rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-blue-500";

interface DeviceInfoSettingsProps {
  /** The persisted config this section edits (seeded once on mount). */
  config: StudioDeviceConfig;
  onSave: (deviceName: string, owners: StudioOwnerEntry[]) => Promise<void>;
}

export function DeviceInfoSettings({
  config,
  onSave,
}: DeviceInfoSettingsProps) {
  // Local draft, seeded from the persisted config when the settings page
  // mounts this section. Nothing is applied until "Save device info".
  const [name, setName] = useState(config.device_name);
  const [owners, setOwners] = useState<StudioOwnerEntry[]>(config.owners);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateOwner = (index: number, patch: Partial<StudioOwnerEntry>) => {
    setOwners((entries) =>
      entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
    setSaved(false);
  };

  const removeOwner = (index: number) => {
    setOwners((entries) => entries.filter((_, i) => i !== index));
    setSaved(false);
  };

  const addOwner = () => {
    setOwners((entries) => [...entries, { uid: "", role: "owner" }]);
    setSaved(false);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(
        name,
        owners.filter((entry) => entry.uid.trim() !== ""),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">
        Device
      </p>
      <label className="block">
        <span className="mb-1 block text-xs text-neutral-400">Device name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          className={`w-full max-w-sm ${FIELD_CLASS}`}
        />
      </label>

      <div className="mt-4">
        <span className="mb-1 block text-xs text-neutral-400">Owners</span>
        {owners.length === 0 && (
          <p className="text-sm text-neutral-500">
            No owners — the device registers unclaimed.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {owners.map((entry, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={entry.uid}
                onChange={(e) => updateOwner(index, { uid: e.target.value })}
                placeholder="Studio user ID (Firebase UID)"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                className={`min-w-0 flex-1 ${FIELD_CLASS}`}
              />
              <select
                value={entry.role}
                onChange={(e) =>
                  updateOwner(index, { role: e.target.value as StudioRole })
                }
                className={FIELD_CLASS}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeOwner(index)}
                className="rounded-lg bg-neutral-700 px-3 py-2 text-sm transition-colors hover:bg-neutral-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addOwner}
          className="mt-2 rounded-lg bg-neutral-700 px-4 py-2 text-sm transition-colors hover:bg-neutral-600"
        >
          Add owner
        </button>
        <p className="mt-2 text-xs text-neutral-500">
          Roles are stored on the device; the Studio registration currently
          carries Owner entries only.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save device info"}
        </button>
        {saved && (
          <span className="text-sm text-green-400">
            Saved — device re-registered.
          </span>
        )}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}

export default DeviceInfoSettings;
