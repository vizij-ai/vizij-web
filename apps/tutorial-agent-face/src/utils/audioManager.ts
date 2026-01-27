import {
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
  scorePhonemeDistribution,
  PHONEMES,
  normalizeVolume,
  type AudioFeatures,
  type AudioVisualizerData,
  type FeatureFrame,
  type PhonemeProbFrame,
} from "../phoneme-core";

type ChunkSchedule = {
  startTime: number; // absolute AudioContext time when chunk starts
  endTime: number; // absolute AudioContext time when chunk ends
  arrivalTs: number; // performance.now() when received
  scheduleTs: number; // performance.now() when scheduled
};

export class AudioManager {
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private inputStream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private outputGain: GainNode | null = null;

  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();

  // Sync / Timing State
  private activeChainStartTime: number = 0;
  private activeChainDuration: number = 0;

  // Live analyser feature deltas (used for visualization)
  private liveLastRms: number = 0;
  private liveLastCentroid: number = 0;

  // Cached features (decoded output audio)
  private featureCache: FeatureFrame[] = [];
  private latestFeatureIndex: number = 0;
  private cacheLastRms: number = 0;
  private cacheLastCentroid: number = 0;
  private chunkSchedule: ChunkSchedule[] = [];

  // Cached phoneme probabilities (raw + smoothed)
  private phonemeCache: PhonemeProbFrame[] = [];
  // Configurable analysis params
  private featureHopMs: number = 20;
  private featureWindowMs: number = 40;
  private phonemeSmoothFrames: number = 2;

  // Latency measurement
  private lastLatencyMs: number = 0;
  private latencySamples: number[] = [];
  private lastArrivalLatencyMs: number = 0;
  private arrivalLatencySamples: number[] = [];

  constructor() {
    // Initial setup if needed
  }

  async initializeInput(onAudioData: (blob: Blob) => void) {
    // Clean up any existing input setup first
    if (this.inputContext || this.inputStream) {
      await this.closeInput();
    }

    try {
      // Request audio with specific constraints
      this.inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        },
      });

      this.inputContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({
        sampleRate: INPUT_SAMPLE_RATE,
      });

      if (this.inputContext.state === "suspended") {
        await this.inputContext.resume();
      }

      this.inputSource = this.inputContext.createMediaStreamSource(
        this.inputStream,
      );

      // Use ScriptProcessor for raw PCM access
      this.processor = this.inputContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.convertFloat32ToInt16(inputData);
        const buffer = new ArrayBuffer(pcmData.byteLength);
        new Int16Array(buffer).set(pcmData);
        const blob = new Blob([buffer], { type: "audio/pcm" });
        onAudioData(blob);
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputContext.destination);
    } catch (error) {
      await this.closeInput();
      throw error;
    }
  }

  async initializeOutput() {
    if (this.outputContext) {
      await this.outputContext.close();
    }

    this.outputContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });

    this.outputGain = this.outputContext.createGain();
    this.outputAnalyser = this.outputContext.createAnalyser();
    this.outputAnalyser.fftSize = 1024; // Higher resolution for better Viseme detection
    this.outputAnalyser.smoothingTimeConstant = 0.5;

    this.outputGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(this.outputContext.destination);
    this.nextStartTime = 0;
    this.activeChainStartTime = 0;
    this.activeChainDuration = 0;

    // reset caches for a new turn/output chain
    this.resetFeatureCache();
  }

  async playAudioChunk(base64Audio: string) {
    if (!this.outputContext || !this.outputGain) return;

    if (this.outputContext.state === "suspended") {
      await this.outputContext.resume();
    }

    const arrayBuffer = this.base64ToArrayBuffer(base64Audio);
    const float32Data = this.convertInt16ToFloat32(new Int16Array(arrayBuffer));

    const audioBuffer = this.outputContext.createBuffer(
      1,
      float32Data.length,
      OUTPUT_SAMPLE_RATE,
    );
    audioBuffer.getChannelData(0).set(float32Data);

    const source = this.outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputGain);

    const currentTime = this.outputContext.currentTime;
    const arrivalTs = performance.now();

    // Keep a continuous chain; if gap occurs, just schedule at now without wiping caches.
    if (this.nextStartTime === 0) {
      this.nextStartTime = currentTime;
      this.activeChainStartTime = currentTime;
      this.activeChainDuration = 0;
    }

    const scheduleStart = Math.max(this.nextStartTime, currentTime);
    const scheduleEnd = scheduleStart + audioBuffer.duration;

    // Schedule at nextStartTime (which might be slightly in the past if we are jittering, causing immediate playback)
    source.start(scheduleStart);

    // Update Tracking
    this.activeChainDuration += audioBuffer.duration;
    this.nextStartTime = scheduleEnd;
    if (this.featureCache.length === 0) {
      this.activeChainStartTime = scheduleStart;
    }

    // Cache per-chunk schedule for latency + feature indexing
    const scheduleTs = performance.now();
    this.chunkSchedule.push({
      startTime: scheduleStart,
      endTime: scheduleEnd,
      arrivalTs,
      scheduleTs,
    });

    // latency samples
    const startDelayMs = (scheduleStart - currentTime) * 1000;
    this.lastLatencyMs = startDelayMs;
    this.latencySamples.push(startDelayMs);
    const arrivalToStartMs = scheduleTs - arrivalTs + startDelayMs;
    this.lastArrivalLatencyMs = arrivalToStartMs;
    this.arrivalLatencySamples.push(arrivalToStartMs);
    if (this.latencySamples.length > 200) this.latencySamples.shift();
    if (this.arrivalLatencySamples.length > 200)
      this.arrivalLatencySamples.shift();

    // Precompute per-frame features once for this chunk
    this.appendChunkFeatures(
      float32Data,
      scheduleStart,
      audioBuffer.duration,
      this.outputContext.sampleRate,
    );

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };
  }

  async playSilence(durationSec: number) {
    if (!this.outputContext || !this.outputGain) return;
    const frames = Math.max(1, Math.floor(durationSec * OUTPUT_SAMPLE_RATE));
    const silent = new Float32Array(frames);
    const audioBuffer = this.outputContext.createBuffer(
      1,
      frames,
      OUTPUT_SAMPLE_RATE,
    );
    audioBuffer.getChannelData(0).set(silent);

    const source = this.outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputGain);

    const currentTime = this.outputContext.currentTime;
    if (this.nextStartTime === 0) {
      this.nextStartTime = currentTime;
      this.activeChainStartTime = currentTime;
      this.activeChainDuration = 0;
    }

    const scheduleStart = Math.max(this.nextStartTime, currentTime);
    const scheduleEnd = scheduleStart + audioBuffer.duration;
    source.start(scheduleStart);
    this.activeChainDuration += audioBuffer.duration;
    this.nextStartTime = scheduleEnd;
    if (this.featureCache.length === 0) {
      this.activeChainStartTime = scheduleStart;
    }

    const scheduleTs = performance.now();
    const arrivalTs = scheduleTs;
    this.chunkSchedule.push({
      startTime: scheduleStart,
      endTime: scheduleEnd,
      arrivalTs,
      scheduleTs,
    });

    const startDelayMs = (scheduleStart - currentTime) * 1000;
    const arrivalToStartMs = scheduleTs - arrivalTs + startDelayMs;
    this.lastLatencyMs = startDelayMs;
    this.lastArrivalLatencyMs = arrivalToStartMs;
    this.latencySamples.push(startDelayMs);
    this.arrivalLatencySamples.push(arrivalToStartMs);
    if (this.latencySamples.length > 200) this.latencySamples.shift();
    if (this.arrivalLatencySamples.length > 200)
      this.arrivalLatencySamples.shift();

    // push silent features
    this.appendChunkFeatures(
      silent,
      scheduleStart,
      audioBuffer.duration,
      this.outputContext.sampleRate,
    );

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };
  }

  /**
   * Manually resets the audio timing chain.
   * Call this when a new conversational turn begins.
   */
  resetChain() {
    if (this.outputContext) {
      const now = this.outputContext.currentTime;
      this.nextStartTime = now;
      this.activeChainStartTime = now;
      this.activeChainDuration = 0;
    } else {
      this.nextStartTime = 0;
      this.activeChainStartTime = 0;
      this.activeChainDuration = 0;
    }

    this.resetFeatureCache();
  }

  interrupt() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* ignore */
      }
    });
    this.sources.clear();
    this.resetChain();
  }

  getVisualizerData(): AudioVisualizerData {
    if (!this.outputAnalyser || !this.outputContext) {
      return {
        waveform: new Uint8Array(0),
        frequency: new Uint8Array(0),
        features: this.emptyFeatures(),
      };
    }

    const bufferLength = this.outputAnalyser.frequencyBinCount;
    const waveform = new Uint8Array(bufferLength);
    const floatWave = new Float32Array(bufferLength);
    const frequency = new Uint8Array(bufferLength);

    this.outputAnalyser.getByteTimeDomainData(waveform);
    this.outputAnalyser.getFloatTimeDomainData(floatWave);
    this.outputAnalyser.getByteFrequencyData(frequency);

    const features = this.computeLiveFeatures(
      floatWave,
      frequency,
      this.outputContext.sampleRate,
    );
    return { waveform, frequency, features };
  }

  /**
   * Returns the current progress of the active audio chain.
   * Useful for synchronizing text with audio.
   */
  getPlaybackState() {
    if (!this.outputContext) return { played: 0, total: 0 };
    const now = this.outputContext.currentTime;

    // Calculate how much time has passed since the chain started
    let played = now - this.activeChainStartTime;

    // Clamp logic
    played = Math.max(0, Math.min(played, this.activeChainDuration));

    return {
      played,
      total: this.activeChainDuration,
    };
  }

  // --- Feature Cache API ---
  getFeatureFrames(): FeatureFrame[] {
    return this.featureCache;
  }

  getPhonemeFrames(): PhonemeProbFrame[] {
    return this.phonemeCache;
  }

  getLatestFeatureIndex(): number {
    return this.latestFeatureIndex;
  }

  getChunkSchedule(): ChunkSchedule[] {
    return this.chunkSchedule;
  }

  getLatencyMs(): number {
    return this.lastLatencyMs;
  }

  getLatencyStats() {
    if (!this.latencySamples.length) return { p50: 0, p95: 0, avg: 0 };
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const sum = this.latencySamples.reduce((a, b) => a + b, 0);
    return {
      p50: pct(0.5),
      p95: pct(0.95),
      avg: sum / this.latencySamples.length,
    };
  }

  getArrivalLatencyStats() {
    if (!this.arrivalLatencySamples.length) return { p50: 0, p95: 0, avg: 0 };
    const sorted = [...this.arrivalLatencySamples].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const sum = this.arrivalLatencySamples.reduce((a, b) => a + b, 0);
    return {
      p50: pct(0.5),
      p95: pct(0.95),
      avg: sum / this.arrivalLatencySamples.length,
    };
  }

  resetFeatureCache() {
    this.featureCache = [];
    this.latestFeatureIndex = 0;
    this.cacheLastRms = 0;
    this.cacheLastCentroid = 0;
    this.chunkSchedule = [];
    this.latencySamples = [];
    this.lastLatencyMs = 0;
    this.arrivalLatencySamples = [];
    this.lastArrivalLatencyMs = 0;
    this.phonemeCache = [];
  }

  setFeatureConfig(opts: {
    hopMs?: number;
    windowMs?: number;
    smoothFrames?: number;
  }) {
    if (opts.hopMs !== undefined && opts.hopMs > 0)
      this.featureHopMs = opts.hopMs;
    if (opts.windowMs !== undefined && opts.windowMs > 0)
      this.featureWindowMs = opts.windowMs;
    if (opts.smoothFrames !== undefined && opts.smoothFrames > 0)
      this.phonemeSmoothFrames = opts.smoothFrames;
  }

  private async closeInput() {
    if (this.inputStream) {
      this.inputStream.getTracks().forEach((track) => track.stop());
      this.inputStream = null;
    }
    this.processor?.disconnect();
    this.inputSource?.disconnect();
    this.processor = null;
    this.inputSource = null;
    if (this.inputContext) {
      try {
        await this.inputContext.close();
      } catch (err) {
        // Ignore double-closes or invalid state errors.
        console.warn("[audio] input context close ignored", err);
      }
      this.inputContext = null;
    }
  }

  private emptyFeatures(): AudioFeatures {
    return {
      rms: 0,
      totalEnergy: 0,
      bandLow: 0,
      bandMidLow: 0,
      bandMidHigh: 0,
      bandHigh: 0,
      spectralCentroidHz: 0,
      spectralFlatness: 0,
      zcr: 0,
      harmonicRatio: 0,
      f0Hz: null,
      energyDelta: 0,
      centroidDelta: 0,
      volume: 0,
    };
  }

  // Live analyser feature path (used by visualizers)
  private computeLiveFeatures(
    wave: Float32Array,
    freq: Uint8Array,
    sampleRate: number,
  ): AudioFeatures {
    if (wave.length === 0 || freq.length === 0) {
      return this.emptyFeatures();
    }

    const nyquist = sampleRate / 2;
    const binSize = nyquist / freq.length;

    const rms = this.computeRms(wave);
    const volume = normalizeVolume(rms);
    const { bandLow, bandMidLow, bandMidHigh, bandHigh, totalEnergy } =
      this.computeBands(freq, binSize);
    const spectralCentroidHz = this.computeCentroid(freq, binSize);
    const spectralFlatness = this.computeFlatness(freq);
    const zcr = this.computeZcr(wave);
    const { harmonicRatio, f0Hz } = this.estimateF0AndHarmonicity(
      wave,
      sampleRate,
    );

    const energyDelta = rms - this.liveLastRms;
    const centroidDelta = spectralCentroidHz - this.liveLastCentroid;

    this.liveLastRms = rms;
    this.liveLastCentroid = spectralCentroidHz;

    return {
      rms,
      totalEnergy,
      bandLow,
      bandMidLow,
      bandMidHigh,
      bandHigh,
      spectralCentroidHz,
      spectralFlatness,
      zcr,
      harmonicRatio,
      f0Hz,
      energyDelta,
      centroidDelta,
      volume,
    };
  }

  // Feature cache extraction for decoded chunks
  private appendChunkFeatures(
    samples: Float32Array,
    chunkStart: number,
    duration: number,
    sampleRate: number,
  ) {
    if (duration <= 0) return;

    const hopSamples = Math.max(
      1,
      Math.floor((this.featureHopMs / 1000) * sampleRate),
    );
    const frameSize = Math.max(
      hopSamples + 1,
      Math.floor((this.featureWindowMs / 1000) * sampleRate),
    );
    const totalSamples = samples.length;
    const frameCount = Math.max(
      1,
      Math.floor((totalSamples - frameSize) / hopSamples),
    );

    for (let i = 0; i <= frameCount; i++) {
      const startSample = i * hopSamples;
      const endSample = Math.min(startSample + frameSize, totalSamples);
      if (endSample - startSample <= 8) break; // too small
      const frame = samples.slice(startSample, endSample);
      const features = this.computeCacheFeatures(frame, sampleRate);
      const frameTime =
        chunkStart - this.activeChainStartTime + startSample / sampleRate;
      this.featureCache.push({ time: frameTime, features });
      this.latestFeatureIndex = this.featureCache.length - 1;

      // phoneme probabilities (raw)
      const probs = scorePhonemeDistribution(features);
      const top = PHONEMES.reduce(
        (best, p) => (probs[p] > probs[best] ? p : best),
        PHONEMES[0],
      );

      // smoothing over trailing window
      const smoothing = this.phonemeSmoothFrames;
      const startIdx = Math.max(0, this.phonemeCache.length - (smoothing - 1));
      const window = [
        ...this.phonemeCache.slice(startIdx).map((f) => f.probs),
        probs,
      ];
      const smooth: Record<string, number> = {};
      PHONEMES.forEach((p) => {
        smooth[p] =
          window.reduce((acc, w) => acc + (w[p] ?? 0), 0) / window.length;
      });
      const smoothTop = PHONEMES.reduce(
        (best, p) => (smooth[p] > smooth[best] ? p : best),
        PHONEMES[0],
      );

      this.phonemeCache.push({
        time: frameTime,
        probs,
        top,
        smoothProbs: smooth,
        smoothTop,
      });
    }

    // Trim cache to ~60s worth if needed (based on time)
    const maxSeconds = 60;
    if (
      this.featureCache.length &&
      this.featureCache[this.featureCache.length - 1].time > maxSeconds
    ) {
      const cutoff =
        this.featureCache[this.featureCache.length - 1].time - maxSeconds;
      const idx = this.featureCache.findIndex((f) => f.time >= cutoff);
      if (idx > 0) {
        this.featureCache = this.featureCache.slice(idx);
      }
      if (this.phonemeCache.length) {
        const idx2 = this.phonemeCache.findIndex((f) => f.time >= cutoff);
        if (idx2 > 0) this.phonemeCache = this.phonemeCache.slice(idx2);
      }
    }
  }

  private computeCacheFeatures(
    frame: Float32Array,
    sampleRate: number,
  ): AudioFeatures {
    const spectrum = this.computeSpectrum(frame, 256);

    // Convert spectrum to pseudo-byte frequency bins for reuse of band helpers
    let maxMag = 0;
    for (let i = 0; i < spectrum.length; i++)
      maxMag = Math.max(maxMag, spectrum[i]);
    const scale = maxMag > 0 ? 255 / maxMag : 0;
    const freqBytes = new Uint8Array(spectrum.length);
    for (let i = 0; i < spectrum.length; i++) {
      freqBytes[i] = Math.min(255, Math.round(spectrum[i] * scale));
    }

    const rms = this.computeRms(frame);
    const volume = normalizeVolume(rms);
    const { bandLow, bandMidLow, bandMidHigh, bandHigh, totalEnergy } =
      this.computeBands(freqBytes, sampleRate / 2 / spectrum.length);
    const spectralCentroidHz = this.computeCentroid(
      freqBytes,
      sampleRate / 2 / spectrum.length,
    );
    const spectralFlatness = this.computeFlatness(freqBytes);
    const zcr = this.computeZcr(frame);
    const { harmonicRatio, f0Hz } = this.estimateF0AndHarmonicity(
      frame,
      sampleRate,
    );

    const energyDelta = rms - this.cacheLastRms;
    const centroidDelta = spectralCentroidHz - this.cacheLastCentroid;
    this.cacheLastRms = rms;
    this.cacheLastCentroid = spectralCentroidHz;

    return {
      rms,
      totalEnergy,
      bandLow,
      bandMidLow,
      bandMidHigh,
      bandHigh,
      spectralCentroidHz,
      spectralFlatness,
      zcr,
      harmonicRatio,
      f0Hz,
      energyDelta,
      centroidDelta,
      volume,
    };
  }

  private computeSpectrum(frame: Float32Array, fftSize: number): Float32Array {
    const N = Math.min(fftSize, frame.length);
    const half = N / 2;
    const out = new Float32Array(half);
    // simple radix-2 DFT (sufficient for modest fftSize=256)
    for (let k = 0; k < half; k++) {
      let re = 0;
      let im = 0;
      const angleBase = (-2 * Math.PI * k) / N;
      for (let n = 0; n < N; n++) {
        const angle = angleBase * n;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const x = frame[n];
        re += x * c;
        im += x * s;
      }
      out[k] = Math.sqrt(re * re + im * im);
    }
    return out;
  }

  private computeRms(wave: Float32Array): number {
    if (wave.length === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < wave.length; i++) {
      const x = wave[i];
      sumSq += x * x;
    }
    return Math.sqrt(sumSq / wave.length);
  }

  private computeBands(freq: Uint8Array, binSize: number) {
    const band = (min: number, max: number) => {
      let sum = 0;
      let count = 0;
      const startBin = Math.max(0, Math.floor(min / binSize));
      const endBin = Math.min(freq.length, Math.ceil(max / binSize));
      for (let i = startBin; i < endBin; i++) {
        sum += freq[i];
        count++;
      }
      return count > 0 ? sum / count : 0;
    };

    const bandLow = band(80, 400);
    const bandMidLow = band(400, 1000);
    const bandMidHigh = band(1000, 2500);
    const bandHigh = band(2500, 8000);
    const totalEnergy = freq.length
      ? freq.reduce((a, b) => a + b, 0) / freq.length
      : 0;

    return { bandLow, bandMidLow, bandMidHigh, bandHigh, totalEnergy };
  }

  private computeCentroid(freq: Uint8Array, binSize: number): number {
    let weighted = 0;
    let sum = 0;
    for (let i = 0; i < freq.length; i++) {
      const mag = freq[i];
      const f = i * binSize;
      weighted += f * mag;
      sum += mag;
    }
    return sum > 0 ? weighted / sum : 0;
  }

  private computeFlatness(freq: Uint8Array): number {
    if (!freq.length) return 0;
    const eps = 1e-6;
    let geoLogSum = 0;
    let arithSum = 0;
    for (let i = 0; i < freq.length; i++) {
      const mag = freq[i] + eps;
      geoLogSum += Math.log(mag);
      arithSum += mag;
    }
    const geoMean = Math.exp(geoLogSum / freq.length);
    const arithMean = arithSum / freq.length + eps;
    return geoMean / arithMean;
  }

  private computeZcr(wave: Float32Array): number {
    if (wave.length < 2) return 0;
    let crossings = 0;
    let prev = wave[0];
    for (let i = 1; i < wave.length; i++) {
      const cur = wave[i];
      if ((cur >= 0 && prev < 0) || (cur < 0 && prev >= 0)) crossings++;
      prev = cur;
    }
    return crossings / (wave.length - 1);
  }

  private estimateF0AndHarmonicity(wave: Float32Array, sampleRate: number) {
    const minF0 = 80;
    const maxF0 = 400;
    const maxLag = Math.floor(sampleRate / minF0);
    const minLag = Math.floor(sampleRate / maxF0);

    let bestLag = -1;
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = lag; i < wave.length; i++) {
        corr += wave[i] * wave[i - lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    let energy = 0;
    for (let i = 0; i < wave.length; i++) {
      energy += wave[i] * wave[i];
    }

    const harmonicRatio = energy > 0 ? bestCorr / energy : 0;
    const f0Hz = bestLag > 0 ? sampleRate / bestLag : null;

    return { harmonicRatio, f0Hz };
  }

  async close() {
    await this.closeInput();
    if (this.outputContext) {
      await this.outputContext.close();
      this.outputContext = null;
    }
    this.outputAnalyser = null;
    this.outputGain = null;
    this.sources.clear();
    this.activeChainDuration = 0;
    this.activeChainStartTime = 0;
    this.resetFeatureCache();
  }

  // --- Helpers ---

  private convertFloat32ToInt16(float32: Float32Array): Int16Array {
    const l = float32.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  private convertInt16ToFloat32(int16: Int16Array): Float32Array {
    const l = int16.length;
    const float32 = new Float32Array(l);
    for (let i = 0; i < l; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  }
}

export const audioManager = new AudioManager();
