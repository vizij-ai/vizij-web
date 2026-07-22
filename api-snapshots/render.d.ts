import * as react_jsx_runtime from 'react/jsx-runtime';
import * as react from 'react';
import { CSSProperties, ComponentProps, ReactNode, RefObject, MouseEvent } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import * as zustand from 'zustand';
import * as THREE from 'three';
import { Mesh, Group as Group$1, BufferGeometry, ShapeGeometry, AnimationClip, Object3D } from 'three';
import { RawValue, AnimatableValue, RawVector2 } from '@vizij/utils';
import { VizijBundleExtension } from '@vizij/face-core';
export { VizijAnimationId, VizijBundleAnimationClip, VizijBundleAnimationEntry, VizijBundleAnimationKeyframe, VizijBundleAnimationTrack, VizijBundleExtension, VizijBundleGraphEntry, VizijBundleGraphKind, VizijBundleGraphMetadata, VizijBundlePoseSection, VizijBundleVersion, VizijGraphId, VizijPoseDefinition, VizijPoseId, VizijPoseRigConfig, VizijSpeechConfig } from '@vizij/face-core';

interface VizijProps {
    style?: CSSProperties;
    className?: string;
    rootId: string;
    namespace?: string;
    showSafeArea?: boolean;
    showSelectionGlow?: boolean;
    onPointerMissed?: ComponentProps<typeof Canvas>["onPointerMissed"];
}
/**
 * Renders the Vizij component.
 *
 * @param style - The style object for the Vizij component.
 *
 * @param className - The CSS class name for the Vizij component
 *
 * @param rootId - The root identifier for the Vizij component.
 *
 * @param namespace - The namespace for the Vizij component
 *
 * @param showSafeArea - Whether to show the safe area.
 *
 * @returns The rendered ReactNode.
 */
declare function Vizij({ style, className, rootId, namespace, showSafeArea, showSelectionGlow, onPointerMissed, }: VizijProps): ReactNode;
interface InnerVizijProps {
    rootId: string;
    namespace: string;
    container?: {
        width: number;
        height: number;
        resolution: number;
    };
    showSafeArea?: boolean;
    showSelectionGlow?: boolean;
}
declare function InnerVizij({ rootId, namespace, container, showSafeArea, showSelectionGlow, }: InnerVizijProps): react_jsx_runtime.JSX.Element;

/**
 * A wrapping type to reference an attribute that is animatable.
 *
 * @param amimated - A boolean indicating whether the feature is animated. Always true for an AnimatedFeature.
 * @param value - The id of the {@link AnimatableValue} used to populate this value.
 */
interface AnimatedFeature {
    animated: true;
    value: string;
    label?: string;
}
/**
 * A wrapping type to specify an attribute that is not animatable (i.e. static) directly.
 *
 * @param amimated - A boolean indicating whether the feature is animated. Always false for a StaticFeature.
 * @param value - The value {@link RawValue} of the feature.
 */
interface StaticFeature {
    animated: false;
    value: RawValue;
    label?: string;
}
/**
 * A wrapping type to specify an attribute that is animatable, modified to directly
 * include the {@link AnimatableValue} for storage.
 *
 * @param amimated - A boolean indicating whether the feature is animated. Always true for an AnimatedFeature.
 * @param value - The {@link AnimatableValue} used to populate this value.
 */
interface StoredAnimatedFeature {
    animated: true;
    value: AnimatableValue;
    label?: string;
}
/**
 * A wrapping type to reference an attribute that is either animatable or static.
 *
 * @param amimated - A boolean indicating whether the feature is animated.
 * @param value - The id of the {@link AnimatableValue} used to populate this value if animated, or the value {@link RawValue} if static.
 */
type Feature = AnimatedFeature | StaticFeature;

interface RenderableBase {
    id: string;
    name: string;
    tags: string[];
    type: string;
    refs: Record<string, RefObject<any>>;
    features: Record<string, Feature>;
}

type StoredFeatures<T extends RenderableBase["features"]> = {
    [key in keyof T]: StaticFeature | StoredAnimatedFeature;
};
interface Stored<T extends Omit<RenderableBase, "refs">> {
    id: T["id"];
    name: T["name"];
    tags: T["tags"];
    type: T["type"];
    features: StoredFeatures<T["features"]>;
}
type StoredRenderable = Stored<RenderableBase>;

/**
 * An object for creating hierarchies/bodies
 *
 * @param id - The id of the ellipse
 * @param name - The name of the ellipse
 * @param tags - The tags of the ellipse
 * @param type - Type flag
 * @param refs - The reference to the group[s] in the scene, for each namespace
 * @param features - The features of the ellipse (translation, rotation, and scale)
 * @param children - The children of the ellipse (list of ids for other bodies or shapes)
 */
interface Ellipse extends RenderableBase {
    type: "ellipse";
    refs: Record<string, RefObject<Mesh>>;
    features: {
        height: Feature;
        width: Feature;
        fillOpacity?: Feature;
        strokeOpacity?: Feature;
        fillColor?: Feature;
        strokeColor?: Feature;
        strokeWidth?: Feature;
        strokeOffset?: Feature;
        translation: Feature;
        rotation: Feature;
    };
}
type EllipseFeature = keyof Ellipse["features"];
type StoredEllipse = Stored<Ellipse>;

/**
 * An object for creating rectangles
 *
 * @param id - The id of the rectangle
 * @param name - The name of the rectangle
 * @param tags - The tags of the rectangle
 * @param type - Type flag
 * @param refs - The reference to the group[s] in the scene, for each namespace
 * @param features - The features of the rectangle (translation, rotation, and scale)
 * @param children - The children of the rectangle (list of ids for other bodies or shapes)
 */
interface Rectangle extends RenderableBase {
    type: "rectangle";
    refs: Record<string, RefObject<Mesh>>;
    features: {
        height: Feature;
        width: Feature;
        fillOpacity?: Feature;
        strokeOpacity?: Feature;
        fillColor?: Feature;
        strokeColor?: Feature;
        strokeWidth?: Feature;
        strokeRadius?: Feature;
        strokeOffset?: Feature;
        translation: Feature;
        rotation: Feature;
    };
}
type RectangleFeature = keyof Rectangle["features"];
type StoredRectangle = Stored<Rectangle>;

/**
 * An object for creating hierarchies/groups
 *
 * @param id - The id of the group
 * @param name - The name of the group
 * @param tags - The tags of the group
 * @param type - Type flag
 * @param refs - The reference to the group[s] in the vizij, for each namespace
 * @param features - The features of the group (translation, rotation, and scale)
 * @param root - Whether the group is a root node
 * @param children - The children of the group (list of ids for other groups or shapes)
 */
interface Group extends RenderableBase {
    type: "group";
    refs: Record<string, RefObject<Group$1>>;
    root: boolean;
    features: {
        translation: Feature;
        rotation: Feature;
        scale?: Feature;
    };
    rootBounds?: {
        center: RawVector2;
        size: RawVector2;
    };
    children: string[];
}
type GroupFeature = keyof Group["features"];
type StoredGroup = Stored<Group>;

/**
 * Represents a 3D mesh object in the scene that can be rendered.
 *
 * Shapes are the visual building blocks of the scene, containing geometry and material
 * properties that define their appearance.
 *
 * @property id - Unique identifier for the shape
 * @property name - Human-readable name for the shape
 * @property tags - List of tags for categorizing and filtering
 * @property type - Always "shape"
 * @property refs - Map of React refs to Three.js Mesh objects
 * @property features - Visual and transformation properties that can be animated
 * @property material - The type of Three.js material to use for rendering
 * @property geometry - The Three.js geometry defining the shape's structure
 *
 * @remarks
 * Features include material properties (shininess, opacity, etc.) and transformations
 * (translation, rotation, scale).
 */
interface Shape extends RenderableBase {
    type: "shape";
    refs: Record<string, RefObject<Mesh>>;
    features: {
        shininess?: Feature;
        opacity?: Feature;
        roughness?: Feature;
        metalness?: Feature;
        color?: Feature;
        emissive?: Feature;
        emissiveIntensity?: Feature;
        specular?: Feature;
        translation: Feature;
        rotation: Feature;
        scale?: Feature;
    };
    material: ShapeMaterial;
    geometry: BufferGeometry | ShapeGeometry;
    morphTargets?: string[];
    children?: string[];
}
/**
 * Supported material types for shapes.
 *
 * @remarks
 * Maps to Three.js material types.
 */
declare enum ShapeMaterial {
    Standard = "standard",
    Phong = "phong",
    Basic = "basic",
    Lambert = "lambert",
    Normal = "normal"
}
type ShapeFeature = keyof Shape["features"];
type StoredShape = Stored<Omit<Shape, "geometry">>;

type World = Record<string, Group | Ellipse | Rectangle | Shape>;

type RenderableFeature = GroupFeature | EllipseFeature;

/**
 * A type representing the selection of an element.
 * @param {string} id - The unique identifier of the id being selected.
 * @param {string} namespace - The namespace of the selection.
 * @param {string} type - The type of the selection.
 * @param {string} [color] - The color of the selection.
 * @param {object} [tooltip] - The tooltip information for the selection.
 */
interface Selection {
    id: string;
    namespace: string;
    type: "body" | "joint" | "screen" | "shape" | "slot" | "group" | "ellipse" | "rectangle" | "animatable" | "parent";
    color?: string;
    tooltip?: {
        type: "animatable" | "text";
        title: string;
        description?: string;
    };
}

interface VizijAnimationTrackData {
    /** Vizij animatable id extracted from RobotData.features.*.value.id */
    componentId: string;
    /** Feature key (e.g. translation, chin, etc.) */
    feature: string;
    /** Vizij renderable id that owns the feature. */
    renderableId: string;
    /** glTF node index referenced by the channel. */
    nodeIndex: number;
    /** Optional glTF node name for debugging. */
    nodeName?: string;
    /** Original glTF channel path (translation, rotation, etc.). */
    path?: string;
    /** Optional feature component label (e.g. x, y, z) if provided by the glTF channel. */
    component?: string;
    /** Index within the output accessor for multi-component values. */
    componentIndex?: number;
    /** Numeric type reported by the Vizij animatable (number, vector3, etc.). */
    valueType?: string;
    /** Number of numeric entries per keyframe within `values`. */
    valueSize: number;
    /** Interpolation declared on the glTF sampler. */
    interpolation?: string;
    /** Keyframe times extracted from the GLTF animation sampler. */
    times: number[];
    /** Keyframe values (flattened, length === times.length * valueSize). */
    values: number[];
}
interface VizijAnimationClipData {
    /** Stable identifier derived from glTF animation name or index. */
    id: string;
    /** Human readable name (mirrors glTF animation name when available). */
    name?: string;
    /** Duration in seconds resolved from the THREE.AnimationClip. */
    duration: number;
    /** Raw glTF animation index in the asset. */
    index: number;
    /** Optional metadata copied from glTF animation extras. */
    metadata?: Record<string, unknown>;
    /** Extracted per-channel track data for Vizij animatables. */
    tracks: VizijAnimationTrackData[];
}

interface VizijData {
    world: World;
    animatables: Record<string, AnimatableValue>;
    values: Map<string, RawValue | undefined>;
    renderHit: boolean;
    preferences: {
        damping: boolean;
    };
    elementSelection: Selection[];
    hoveredElement: Selection | null;
    slotConfig: Record<string, string>;
}
interface VizijActions {
    setValue: (id: string, namespace: string, value: RawValue | ((current: RawValue | undefined) => RawValue | undefined)) => void;
    setValues: (writes: Array<{
        id: string;
        namespace: string;
        value: RawValue;
    }>) => void;
    setWorldElementName: (id: string, value: string) => void;
    setVizij: (scene: World, animatables: Record<string, AnimatableValue>) => void;
    setSlot: (parentId: string, parentNamespace: string, childId: string, childNamespace: string) => void;
    setSlots: (slots: Record<string, string>, replace?: boolean) => void;
    clearSlot: (parentId: string, parentNamespace: string) => void;
    addWorldElements: (world: World, animatables: Record<string, AnimatableValue>, replace?: boolean) => void;
    setPreferences: (preferences: Partial<VizijData["preferences"]>) => void;
    getExportableBodies: (filterIds?: string[]) => Group$1[];
    updateElementSelection: (selection: Selection, chain: string[]) => void;
    setHoveredElement: (selection: Selection | null) => void;
    onElementClick: (selection: Selection, chain: string[], event: ThreeEvent<MouseEvent>) => void;
    clearSelection: () => void;
    setOrigin: (id: string, origin: {
        translation?: THREE.Vector3;
        rotation?: THREE.Vector3;
    }) => void;
    setAxis: (id: string, axis: THREE.Vector3) => void;
    setTags: (id: string, tags: string[]) => void;
    setStaticFeature: (id: string, feature: RenderableFeature, value: RawValue) => void;
    setAnimatableValue: (id: string, value: AnimatableValue) => void;
    setParent: (id: string, parent: string) => void;
    setChild: (id: string, child: string) => void;
    setChildren: (id: string, children: string[]) => void;
    setGeometry: (id: string, geometry: THREE.BufferGeometry) => void;
    setMaterial: (id: string, material: string) => void;
    setReference: (id: string, namespace: string, object: RefObject<Group$1 | Mesh>) => void;
    createGroup: (root: boolean) => void;
    createAnimatable: (elementId: string, featureName: string, value: Partial<AnimatableValue>) => void;
    createStatic: (elementId: string, featureName: string, value: RawValue) => void;
}
type VizijStoreSetter = (partial: (VizijData & VizijActions) | Partial<VizijData & VizijActions> | ((state: VizijData & VizijActions) => (VizijData & VizijActions) | Partial<VizijData & VizijActions>), replace?: false | undefined) => void;
type VizijStoreGetter = () => VizijData & VizijActions;

declare const VizijSlice: (set: VizijStoreSetter, get: VizijStoreGetter) => {
    world: {};
    animatables: {};
    values: Map<any, any>;
    renderHit: boolean;
    preferences: {
        damping: boolean;
    };
    elementSelection: never[];
    hoveredElement: null;
    slotConfig: {};
    clearSelection: () => void;
    updateElementSelection: (selection: Selection, _chain: string[]) => void;
    setHoveredElement: (selection: Selection | null) => void;
    onElementClick: (selection: Selection, _chain: string[], event: ThreeEvent<MouseEvent>) => void;
    getExportableBodies: (filterIds?: string[]) => THREE.Group<THREE.Object3DEventMap>[];
    setGeometry: (id: string, geometry: THREE.BufferGeometry) => void;
    setValue: (id: string, namespace: string, value: RawValue | ((current: RawValue | undefined) => RawValue | undefined)) => void;
    setValues: (writes?: Array<{
        id: string;
        namespace: string;
        value: RawValue;
    }>) => void;
    setWorldElementName: (id: string, value: string) => void;
    setParent: (id: string, parent: string) => void;
    setChild: (id: string, child: string) => void;
    setChildren: (id: string, children: string[]) => void;
    createGroup: (root: boolean) => void;
    setOrigin: (id: string, origin: {
        translation?: THREE.Vector3;
        rotation?: THREE.Vector3;
    }) => void;
    setAxis: (id: string, axis: THREE.Vector3) => void;
    setTags: (id: string, tags: string[]) => void;
    setMaterial: (id: string, material: string) => void;
    setStaticFeature: (id: string, feature: RenderableFeature, value: RawValue) => void;
    createAnimatable: (elementId: string, featureName: string, value: Partial<AnimatableValue>) => void;
    createStatic: (elementId: string, featureName: string, value: RawValue) => void;
    setAnimatableValue: (id: string, value: AnimatableValue) => void;
    setSlot: (parentId: string, parentNamespace: string, childId: string, childNamespace: string) => void;
    setSlots: (slots: Record<string, string>, replace?: boolean) => void;
    clearSlot: (parentId: string, parentNamespace: string) => void;
    setVizij: (scene: World, animatables: Record<string, AnimatableValue>) => void;
    addWorldElements(world: World, animatables: Record<string, AnimatableValue>, replace?: boolean): void;
    setPreferences: (preferences: Partial<VizijData["preferences"]>) => void;
    setReference: (id: string, namespace: string, ref: RefObject<Group$1 | Mesh>) => void;
};
declare const useDefaultVizijStore: zustand.UseBoundStore<Omit<zustand.StoreApi<VizijData & VizijActions>, "subscribe"> & {
    subscribe: {
        (listener: (selectedState: VizijData & VizijActions, previousSelectedState: VizijData & VizijActions) => void): () => void;
        <U>(selector: (state: VizijData & VizijActions) => U, listener: (selectedState: U, previousSelectedState: U) => void, options?: {
            equalityFn?: ((a: U, b: U) => boolean) | undefined;
            fireImmediately?: boolean;
        } | undefined): () => void;
    };
}>;
declare const createVizijStore: (initial?: Partial<VizijData & VizijActions>) => zustand.UseBoundStore<Omit<zustand.StoreApi<VizijData & VizijActions>, "subscribe"> & {
    subscribe: {
        (listener: (selectedState: VizijData & VizijActions, previousSelectedState: VizijData & VizijActions) => void): () => void;
        <U>(selector: (state: VizijData & VizijActions) => U, listener: (selectedState: U, previousSelectedState: U) => void, options?: {
            equalityFn?: ((a: U, b: U) => boolean) | undefined;
            fireImmediately?: boolean;
        } | undefined): () => void;
    };
}>;
type VizijStore = typeof useDefaultVizijStore;

declare const VizijContext: react.Context<zustand.UseBoundStore<Omit<zustand.StoreApi<VizijData & VizijActions>, "subscribe"> & {
    subscribe: {
        (listener: (selectedState: VizijData & VizijActions, previousSelectedState: VizijData & VizijActions) => void): () => void;
        <U>(selector: (state: VizijData & VizijActions) => U, listener: (selectedState: U, previousSelectedState: U) => void, options?: {
            equalityFn?: ((a: U, b: U) => boolean) | undefined;
            fireImmediately?: boolean;
        } | undefined): () => void;
    };
}> | null>;

declare function useVizijStore<T>(selector: (state: VizijData & VizijActions) => T): T;

declare function useVizijStoreSubscription<T>(selector: (state: VizijData & VizijActions) => T, listener: (state: T) => void): void;

/**
 * Custom React hook to manage and subscribe to feature values.
 *
 * @param namespace - The namespace for the features.
 * @param features - A record of feature objects keyed by their IDs.
 * @param callbacks - A record of callback functions keyed by feature IDs.
 * @param debugInfo - Optional debug information to log in case of errors.
 *
 * @throws [Error] If the SceneContext store is not found.
 *
 * @returns [void]
 *
 * This hook sets up subscriptions to feature values and invokes the provided callbacks when the values change.
 * It handles both animated and non-animated features. For animated features, it subscribes to the animatable value
 * in the store and invokes the callback whenever the value changes. For non-animated features, it immediately
 * invokes the callback with the feature's value.
 */
declare function useFeatures(namespace: string, features: Record<string, Feature>, callbacks: Record<string, (current: RawValue) => void>, debugInfo?: any): void;

declare function useVizijStoreSetter(): {
    (partial: (VizijData & VizijActions) | Partial<VizijData & VizijActions> | ((state: VizijData & VizijActions) => (VizijData & VizijActions) | Partial<VizijData & VizijActions>), replace?: false): void;
    (state: (VizijData & VizijActions) | ((state: VizijData & VizijActions) => VizijData & VizijActions), replace: true): void;
};

declare function useVizijStoreGetter(): () => VizijData & VizijActions;

declare class EmptyModelError extends Error {
    constructor(message: string);
}
type ParserJsonFallbackSource = {
    url?: string;
    blob?: Blob;
    arrayBuffer?: ArrayBuffer;
};
declare function parseGlbJsonChunk(buffer: ArrayBuffer): unknown | undefined;
declare function loadGLTF(url: string, namespaces: string[], aggressiveImport?: boolean, rootBounds?: {
    center: RawVector2;
    size: RawVector2;
}): Promise<[World, Record<string, AnimatableValue>, VizijAnimationClipData[]]>;
declare function loadGLTFFromBlob(blob: Blob, namespaces: string[], aggressiveImport?: boolean, rootBounds?: {
    center: RawVector2;
    size: RawVector2;
}): Promise<[World, Record<string, AnimatableValue>, VizijAnimationClipData[]]>;
type LoadedVizijAsset = {
    world: World;
    animatables: Record<string, AnimatableValue>;
    bundle: VizijBundleExtension | null;
    animations: VizijAnimationClipData[];
    scene: Group$1;
};
declare function loadGLTFWithBundle(url: string, namespaces: string[], aggressiveImport?: boolean, rootBounds?: {
    center: RawVector2;
    size: RawVector2;
}, parserJsonFallback?: ParserJsonFallbackSource): Promise<LoadedVizijAsset>;
declare function loadGLTFFromBlobWithBundle(blob: Blob, namespaces: string[], aggressiveImport?: boolean, rootBounds?: {
    center: RawVector2;
    size: RawVector2;
}): Promise<LoadedVizijAsset>;

/**
 * Loads a GLTF model from a Blob and returns the Three.js scene containing the model.
 *
 * @param blob - The Blob containing the GLTF data.
 * @returns A Promise that resolves with the THREE.Scene containing the loaded model.
 */
declare const loadGltfFromBlob: (blob: Blob, namespaces: string[]) => Promise<[World, Record<string, AnimatableValue>]>;

type ExportSceneOptions = {
    fileName?: string;
    bundle?: VizijBundleExtension | null;
    animations?: AnimationClip[];
    binary?: boolean;
    onError?: (error: Error) => void;
    onComplete?: () => void;
};
declare function exportScene(data: Group$1, fileNameOrOptions?: string | ExportSceneOptions): void;

declare function extractVizijBundle(object: Object3D, parserJson?: unknown): VizijBundleExtension | null;
declare function applyVizijBundle(object: Object3D, bundle: VizijBundleExtension | null): () => void;

export { type AnimatedFeature, type Ellipse, type EllipseFeature, EmptyModelError, type ExportSceneOptions, type Feature, type Group, type GroupFeature, InnerVizij, type InnerVizijProps, type LoadedVizijAsset, type Rectangle, type RectangleFeature, type RenderableBase, type RenderableFeature, type Selection, type Shape, type ShapeFeature, ShapeMaterial, type StaticFeature, type Stored, type StoredAnimatedFeature, type StoredEllipse, type StoredFeatures, type StoredGroup, type StoredRectangle, type StoredRenderable, type StoredShape, Vizij, type VizijActions, type VizijAnimationClipData, type VizijAnimationTrackData, VizijContext, type VizijData, type VizijProps, VizijSlice, type VizijStore, type VizijStoreGetter, type VizijStoreSetter, type World, applyVizijBundle, createVizijStore, exportScene, extractVizijBundle, loadGLTF, loadGLTFFromBlob, loadGLTFFromBlobWithBundle, loadGLTFWithBundle, loadGltfFromBlob, parseGlbJsonChunk, useDefaultVizijStore, useFeatures, useVizijStore, useVizijStoreGetter, useVizijStoreSetter, useVizijStoreSubscription };
