// Read + edit the Studio device identity (name + owner entries with roles)
// persisted by the Rust side. `config.active` is false when the app was built
// without the studio-bridge feature; the UI hides device info then. Saving
// persists the config and re-registers the device with Studio live (no
// restart needed).

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type StudioRole = "owner" | "editor" | "viewer";

export interface StudioOwnerEntry {
  uid: string;
  role: StudioRole;
}

export interface StudioDeviceConfig {
  active: boolean;
  device_name: string;
  owners: StudioOwnerEntry[];
}

export function useStudioDevice() {
  const [config, setConfig] = useState<StudioDeviceConfig | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConfig(await invoke<StudioDeviceConfig>("get_studio_device_config"));
    } catch {
      // Command unavailable (older shell) — device info stays hidden.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (deviceName: string, owners: StudioOwnerEntry[]) => {
      await invoke("set_studio_device_config", { deviceName, owners });
      await refresh();
    },
    [refresh],
  );

  return { config, save };
}
