// Lists every endpoint this standalone exposes: the WebSocket control socket
// (and browser control panel), the optional ROS 2 data-topic bridge, and the
// optional Semio Studio bridge. It reads the snapshot from the Rust side
// (`get_endpoints`) and re-polls periodically so the WS running state and the
// Studio owners (which the owner prompt can change live) stay current. Below
// the endpoints it lists the runtime's skills — the spawnable behaviors the
// face ships, from the same registry the authoring app's Skills menu offers.
//
// `ros2`/`studio` are present only when the app was built with those features;
// when absent, their sections simply don't render.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { skills as runtimeSkills, type Skill } from "@vizij/runtime";

interface WsEndpoint {
  url: string;
  web_control_url: string | null;
  running: boolean;
}

interface Ros2Endpoint {
  domain_id: number;
  namespace: string;
}

interface StudioEndpoint {
  device_name: string;
  model_family: string | null;
  software_version: string | null;
  endpoint: string;
  owners: string[];
}

interface EndpointsInfo {
  ws: WsEndpoint;
  ros2: Ros2Endpoint | null;
  studio: StudioEndpoint | null;
}

export function EndpointsPanel({ className }: { className?: string }) {
  const [info, setInfo] = useState<EndpointsInfo | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    let mounted = true;
    runtimeSkills()
      .then((list) => {
        if (mounted) setSkills(list);
      })
      .catch(() => {
        // Registry unavailable (wasm not loaded) — leave the section empty.
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      invoke<EndpointsInfo>("get_endpoints")
        .then((next) => {
          if (mounted) setInfo(next);
        })
        .catch(() => {
          // Command unavailable (older shell) — leave the panel empty.
        });
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (!info) return null;

  const { ws, ros2, studio } = info;

  return (
    <div className={className}>
      <div>
        <span className="font-medium text-neutral-300">WebSocket</span>{" "}
        <span className={ws.running ? "text-green-400" : "text-yellow-400"}>
          {ws.running ? "running" : "starting…"}
        </span>
        <div className="text-neutral-400">{ws.url}</div>
        {ws.web_control_url && (
          <div className="text-neutral-400">
            control panel: {ws.web_control_url}
          </div>
        )}
      </div>

      {ros2 && (
        <div className="mt-2">
          <span className="font-medium text-neutral-300">ROS 2 (DDS)</span>
          <div className="text-neutral-400">
            domain {ros2.domain_id}, namespace <code>/{ros2.namespace}</code>
          </div>
          <div className="text-neutral-500">
            keys published under{" "}
            <code>/{ros2.namespace}/keys/&lt;path&gt;</code>
          </div>
        </div>
      )}

      {studio && (
        <div className="mt-2">
          <span className="font-medium text-neutral-300">Semio Studio</span>
          <div className="text-neutral-400">
            connected via Zenoh to {studio.endpoint}
          </div>
          <p className="mt-1 text-neutral-400">
            Registered as device{" "}
            <span className="text-neutral-200">“{studio.device_name}”</span>
            {studio.model_family && <> (model family {studio.model_family})</>}
            {studio.software_version && <>, {studio.software_version}</>}.{" "}
            {studio.owners.length > 0 ? (
              <>
                Owned by{" "}
                <span className="text-neutral-200">
                  {studio.owners.join(", ")}
                </span>{" "}
                — only those Studio account(s) can see and drive it.
              </>
            ) : (
              <span className="text-yellow-400">
                Unclaimed — no Studio account sees it yet until an owner is set.
              </span>
            )}
          </p>
        </div>
      )}

      {skills.length > 0 && (
        <div className="mt-2" data-testid="endpoints-skills">
          <span className="font-medium text-neutral-300">Skills</span>
          {skills.map((skill) => (
            <div key={skill.id} className="mt-1">
              <div className="text-neutral-200">
                {skill.title}{" "}
                <code className="text-neutral-400">
                  ({skill.parameters.join(", ")})
                </code>
              </div>
              <div className="text-neutral-500">{skill.description}</div>
              <div className="text-neutral-500">
                served by this device as the <code>/skill/{skill.id}</code>{" "}
                action when built with ROS 2
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default EndpointsPanel;
