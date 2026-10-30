/* global AudioWorkletProcessor, registerProcessor */
/**
 * Audio worklet that hands the microphone's mono samples to the main thread in
 * blocks of `blockSize` frames (4096 by default). The audio thread renders 128
 * frames at a time; batching keeps the messages at the rate the Live API
 * stream is fed.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.blockSize = options?.processorOptions?.blockSize ?? 4096;
    this.block = new Float32Array(this.blockSize);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      let offset = 0;
      while (offset < channel.length) {
        const count = Math.min(
          channel.length - offset,
          this.blockSize - this.filled,
        );
        this.block.set(channel.subarray(offset, offset + count), this.filled);
        this.filled += count;
        offset += count;
        if (this.filled === this.blockSize) {
          this.port.postMessage(this.block, [this.block.buffer]);
          this.block = new Float32Array(this.blockSize);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
