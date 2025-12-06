export interface AudioFeatures {
  rms: number;
  totalEnergy: number;
  bandLow: number;
  bandMidLow: number;
  bandMidHigh: number;
  bandHigh: number;
  spectralCentroidHz: number;
  spectralFlatness: number;
  zcr: number;
  harmonicRatio: number;
  f0Hz: number | null;
  energyDelta: number;
  centroidDelta: number;
  /**
   * Normalized loudness estimate mapped to 0–1 (0 = silence, 1 = loud).
   */
  volume: number;
}

export interface FeatureFrame {
  time: number; // seconds relative to playback chain start
  features: AudioFeatures;
}

export interface PhonemeProbFrame {
  time: number;
  probs: Record<string, number>; // raw distribution over phonemes
  top: string;
  smoothProbs?: Record<string, number>; // optional smoothed windowed probs
  smoothTop?: string;
}

// Sparse phoneme event (text / align) and dense phoneme timeline wrapper
import type { Phoneme } from "./phonemes";

export interface PhonemeEvent {
  index: number;
  phoneme: Phoneme;
  wordIndex: number; // -1 when not tied to a word
  phonemeIndex: number; // position within the word, -1 if not applicable
  startTime: number;
  endTime: number;
}

export interface WordAlignment {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
  phonemes: Phoneme[];
  visemes?: string[];
  isPunct?: boolean;
}

export type TimelineKind = "text" | "audio" | "synth" | "align";

export interface PhonemeTimeline {
  kind: TimelineKind;
  words: WordAlignment[];
  events: PhonemeEvent[];
  frames?: PhonemeProbFrame[];
}

export interface AudioVisualizerData {
  waveform: Uint8Array;
  frequency: Uint8Array;
  features: AudioFeatures;
}

export interface LogMessage {
  role: "user" | "model" | "system";
  text: string;
  timestamp: Date;
}

export interface Viseme {
  id: string;
  name: string;
  probability: number; // 0-1 based on frequency analysis
  character: string; // e.g. 'O', 'Ah', 'Ee', 'S'
}

export enum LiveStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}
