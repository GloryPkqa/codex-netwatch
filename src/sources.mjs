import { MihomoSource } from './mihomo.mjs';
import { NativeSource } from './native.mjs';

// One source supplies each sample. Never add ETW and proxy counters together.
export class TrafficSource {
  constructor(config) {
    this.native = new NativeSource(config);
    this.proxy = new MihomoSource(config);
    this.preference = config.captureMode || 'auto';
    this.active = null; this.generation = 0;
  }
  async snapshot() {
    if (!this.attempted && this.preference !== 'mihomo') {
      this.attempted = true;
      try { await this.native.start(); } catch { /* No UAC until an explicit settings action. */ }
    }
    const source = this.preference !== 'mihomo' && this.native.state === 'ready' ? this.native : this.proxy;
    if (this.preference === 'native' && source !== this.native) {
      this.issue = this.native.issue || 'elevation_required'; throw new Error(this.issue);
    }
    try {
      const result = await source.snapshot();
      const key = `${source === this.native ? 'native' : 'mihomo'}:${source.generation}`;
      if (key !== this.key) { this.generation++; this.key = key; }
      this.active = source; this.eventsLost = result.eventsLost || 0; this.issue = null; return result;
    } catch (error) {
      this.issue = source.issue || 'unreachable'; throw error;
    }
  }
  get endpoint() { return this.active?.endpoint || this.proxy.endpoint; }
  status() { return { mode: this.preference, active: this.active === this.native ? 'native' : this.active ? 'mihomo' : null,
    nativeState: this.native.state, nativeIssue: this.native.issue, eventsLost: this.eventsLost || 0 }; }
  async setMode(mode, authorize = false) {
    if (!['auto', 'native', 'mihomo'].includes(mode)) throw new Error('Invalid capture mode');
    if (authorize) { this.attempted = true; await this.native.start(true); }
    this.preference = mode;
    if (mode === 'mihomo') this.native.stop();
    else if (this.native.state !== 'ready') this.attempted = false;
  }
  stop() { this.native.stop(); }
}
