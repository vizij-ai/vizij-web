import type { ReactNode } from "react";
import type { WorkbenchView } from "./workbenchConfig";

export type WorkbenchGuide = {
    label: string;
    summary: string;
    content: ReactNode;
};

export const WORKBENCH_GUIDES: Record<WorkbenchView, WorkbenchGuide> = {
    "import-export": {
        label: "How the import/export sidebar flows",
        summary: "Load GLBs → audit data → export clean assets",
        content: (
            <ol>
                <li>
                    Drop in a Vizij GLB or use the loader below to populate the bundle
                    summary and runtime preview.
                </li>
                <li>
                    Run RobotData and bundle audits before exporting—green statuses
                    confirm GraphSpecs and IR are in sync.
                </li>
                <li>
                    Use the export + optional sections to save GLBs, rig graphs, and pose
                    configs once everything checks out.
                </li>
            </ol>
        ),
    },
    "scene-composer": {
        label: "Scene composer quickstart",
        summary: "Select nodes, inspect drivers, edit bindings",
        content: (
            <ol>
                <li>
                    Use the hierarchy tree to pick objects or search by name / type;
                    selections remain in sync with the viewport.
                </li>
                <li>
                    The inspector surfaces drivers, bindings, and metadata for the active
                    object—tweak values to preview changes live.
                </li>
                <li>
                    Clear or refocus selections anytime via the tree or directly clicking
                    in the viewer.
                </li>
                <li>
                    Pose the face by manipulating drivers and save the pose with the
                    viewport header.
                </li>
            </ol>
        ),
    },
    "pose-rig": {
        label: "Pose rig workflow",
        summary: "Capture neutrals → sculpt poses → export grouped graphs",
        content: (
            <ol>
                <li>
                    Capture/overwrite the neutral pose, then create pose entries to store
                    sculpted driver deltas.
                </li>
                <li>
                    Assign group labels to define rig path prefixes and batch apply names
                    to related poses.
                </li>
                <li>
                    Export grouped pose graphs or import an existing graph to reuse naming
                    + weights.
                </li>
            </ol>
        ),
    },
    "std-feature-spaces": {
        label: "Standard Feature Spaces workflow",
        summary: "Map your face to a Standard Feature Space",
        content: (
            <div>
                <p>
                    The Standard Feature Spaces Editor allows you to align your face to
                    predefined feature spaces. This enables consistent facial rigging and
                    animation across different models by providing a common reference
                    frame.
                </p>
                <p>
                    There is no single Standard Feature Space. Instead we refer to a
                    Standard, which may be developed by the community or specific
                    entities. By mapping your face to a given Standard, your face complies
                    with its feature space, and thus supports being controlled by rigs and
                    animations built for that Standard.
                </p>
                <ol>
                    <li>
                        Load your face model and a Standard model which you will use as
                        reference.
                    </li>
                    <li>
                        Your face model should already be rigged with the Vizij rigging
                        system.
                    </li>
                    <li>
                        The reference model can be any face that is already rigged to the
                        Standard feature space.
                    </li>
                    <li>
                        Use the reference controls to set features on the reference model.
                    </li>
                    <li>
                        By viewing them side by side, adjust the mapping controls to align
                        your face model so that it matches the reference model's features as
                        close as as possible.
                    </li>
                    <li>
                        Once you are satisfied with the mapping, save the mapping
                        configuration into your Vizij bundle for future use.
                    </li>
                </ol>
                <p className="mt-4 font-bold text-slate-200">
                    Mapping Editor Status Indicators:
                </p>
                <ul className="mt-2 space-y-1">
                    <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-slate-300">
                            <strong className="text-slate-200">Green</strong> — Track exists and has a binding
                            configured. Ready to use.
                        </span>
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-slate-300">
                            <strong className="text-slate-200">Blue</strong> — Track exists but has no binding. Configure
                            a binding to drive features.
                        </span>
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span className="text-slate-300">
                            <strong className="text-slate-200">Gray</strong> — Track is missing in the main face. Create
                            it first.
                        </span>
                    </li>
                </ul>
            </div>
        ),
    },
};
