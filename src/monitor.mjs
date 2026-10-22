import { Accounting } from './accounting.mjs';
import { MihomoSource } from './mihomo.mjs';
import { ProcessObserver } from './processes.mjs';
import { SessionReader } from './sessions.mjs';
import { DemoSource } from './demo.mjs';

export class Monitor {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.accounting = new Accounting();
    this.source = config.demo ? new DemoSource() : new MihomoSource(config);
    this.observer = new ProcessObserver(config);
    this.sessions = new SessionReader(config, store);
    this.state = 'starting';
    this.error = '';
    this.startedAt = Date.now();
    this.lastAt = 0;
    this.lastSessionRefresh = 0;
    this.lastPrune = 0;
    this.lastAlert = 0;
    this.recent = [];
    this.alertMBPerMinute = store.get('alertMBPerMinute', config.alertMBPerMinute);
  }
  start() {
    this.stopping = false;
    if (!this.config.demo) this.observer.start();
    this.tick();
  }
  async tick() {
    if (this.stopping) return;
    const began = Date.now();
    try {
      if (began - this.lastSessionRefresh >= 8000 && !this.config.demo) {
        this.sessions.refresh(began);
        this.lastSessionRefresh = began;
      }
      const snapshot = await this.source.snapshot();
      if (this.stopping) return;
      if (this.source.generation !== this.sourceGeneration) {
        this.accounting.resetBaseline();
        this.recent = [];
        this.sourceGeneration = this.source.generation;
      }
      const now = Date.now();
      if (this.config.demo && this.source.tick % 8 === 1) {
        const examples = [
          ['demo-session-ui', '优化设置页交互', 'gpt-example'],
          ['demo-session-build', '排查构建失败', 'gpt-example'],
          ['demo-session-docs', '更新接口文档', 'gpt-example'],
        ];
        this.sessions.active = examples.slice(0, 2).map((x) => x[0]);
        for (let i = 0; i < examples.length; i++) {
          const [id, title, model] = examples[i];
          this.store.saveSession(
            {
              id,
              title,
              model,
              activity: now - i * 45000,
              total: 125000 + i * 90000 + this.source.tick * 1000,
              input: 110000 + i * 80000 + this.source.tick * 1000,
              cached: 80000 + i * 70000,
              output: 15000 + i * 10000,
            },
            this.source.tick > 1 ? 8000 : 0,
          );
        }
      }
      const sample = this.accounting.consume(
        snapshot,
        now,
        (m, t) => this.observer.classify(m, t),
        this.sessions.active,
      );
      this.store.record(sample);
      this.latest = sample;
      this.lastAt = now;
      this.state = 'connected';
      this.error = '';
      this.recent.push(sample);
      this.recent = this.recent.filter((x) => x.at >= now - 60000);
      const bytes = this.recent.reduce((n, x) => n + x.codexUp + x.codexDown, 0);
      if (bytes >= this.alertMBPerMinute * 1000000 && now - this.lastAlert >= 60000) {
        this.store.alert(
          now,
          `Codex 最近 60 秒已观测到 ${(bytes / 1000000).toFixed(1)} MB，超过 ${this.alertMBPerMinute} MB 提醒阈值。`,
        );
        this.lastAlert = now;
      }
      if (now - this.lastPrune >= 3600000) {
        this.store.prune(this.config.retentionDays);
        this.lastPrune = now;
      }
    } catch (error) {
      this.state = 'disconnected';
      this.error = /未连接|接口需要/.test(error.message)
        ? error.message
        : '采集暂时失败，正在自动重试；空档不计为零流量。';
      // Reconnect starts a new baseline. Offline traffic is deliberately not invented.
      this.accounting.resetBaseline();
      this.recent = [];
      console.error(`[${new Date().toISOString()}] sampling failed: ${error.code || error.name}`);
    } finally {
      if (!this.stopping)
        this.timer = setTimeout(
          () => this.tick(),
          Math.max(50, this.config.intervalMs - (Date.now() - began)),
        );
    }
  }
  status() {
    const s = this.latest;
    const elapsed = s?.duration ? s.duration / 1000 : 1;
    const live =
      this.state === 'connected' && Date.now() - this.lastAt < this.config.intervalMs + 6000;
    return {
      state: this.state,
      error: this.error,
      demo: this.config.demo,
      startedAt: this.startedAt,
      firstAt: this.store.firstAt(),
      lastAt: this.lastAt,
      endpoint: this.source.endpoint,
      observer: this.config.demo ? 'demo' : this.observer.status,
      sessionReader: this.config.demo ? 'demo' : this.sessions.status,
      retentionDays: this.config.retentionDays,
      intervalMs: this.config.intervalMs,
      alertMBPerMinute: this.alertMBPerMinute,
      upRate: live ? s.codexUp / elapsed : null,
      downRate: live ? s.codexDown / elapsed : null,
      allRate: live ? (s.allUp + s.allDown) / elapsed : null,
      connections: s?.rows.length || 0,
      codexConnections: s?.rows.filter((x) => x.scope === 'codex').length || 0,
      unknownConnections: s?.rows.filter((x) => x.scope === 'unknown').length || 0,
      processes: this.observer.processes.size,
    };
  }
  setThreshold(value) {
    this.alertMBPerMinute = value;
    this.store.set('alertMBPerMinute', value);
  }
  stop() {
    this.stopping = true;
    clearTimeout(this.timer);
    this.observer.stop();
  }
}
