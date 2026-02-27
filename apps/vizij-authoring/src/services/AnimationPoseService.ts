import { type AnimationTrack, evaluateTrack } from "../state/animationStore";

export class AnimationPoseService {
    /**
     * Evaluates all tracks at a specific time and returns a values record.
     */
    static evaluateAtTime(tracks: AnimationTrack[], time: number): Record<string, number> {
        const values: Record<string, number> = {};
        tracks.forEach((track) => {
            values[track.variableId] = evaluateTrack(track, time);
        });
        return values;
    }

    /**
     * Extracts all unique keyframe timestamps from a set of tracks.
     */
    static getUniqueTimestamps(tracks: AnimationTrack[]): number[] {
        const times = new Set<number>();
        tracks.forEach((track) => {
            track.keyframes.forEach((kf) => times.add(kf.time));
        });
        return Array.from(times).sort((a, b) => a - b);
    }
}
