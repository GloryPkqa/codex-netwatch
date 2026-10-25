import { Accounting } from './accounting.mjs';
import { TrafficSource } from './sources.mjs';
import { ProcessObserver } from './processes.mjs';
import { SessionReader } from './sessions.mjs';
import { DemoSource } from './demo.mjs';
import { AnomalyDetector } from './anomalies.mjs';
import { DEFAULT_BUDGET, validateBudget } from './budgets.mjs';

export class Monitor {
  constructor(config, store, { now = Date.now } = {}) {
    this.config = config;
    this.store = store;
    this.now = now;
    this.accounting = new Accounting();
    this.source = config.demo ? new DemoSource() : new TrafficSource({ ...config, captureMode: store.get('captureMode', config.captureMode || 'auto') });
    this.observer = new ProcessObserver(config);
    this.sessions = new SessionReader(config, store);
    this.state = 'starting';
    this.error = '';
    this.startedAt = this.now();
    this.lastAt = 0;
    this.lastSessionRefresh = 0;
    this.lastPrune = 0;
    this.lastAlert = 0;
    this.recent = [];
    this.detector = new AnomalyDetector();
    this.gaps = new Map();
    this.diagnostics = { polls: 0, failures: 0, reconnects: 0, lastPollMs: 0, maxPollMs: 0 };
    this.alertMBPerMinute = store.get('alertMBPerMinute', config.alertMBPerMinute);
    this.budgetSettings = validateBudget(store.get('budget', DEFAULT_BUDGET));
    const savedRetention = store.get('retentionDays', config.retentionDays);
    this.retentionDays = Number.isInteger(savedRetention) && savedRetention >= 1 && savedRetention <= 365
      ? savedRetention : config.retentionDays;
  }
  openGap(reason, from) {
    if (!this.gaps.has(reason)) this.gaps.set(reason, this.store.openGap?.(reason, from));
  }
  closeGap(reason, to) {
    if (!this.gaps.has(reason)) return;
    const id = this.gaps.get(reason);
    if (id !== undefined) this.store.closeGap?.(id, to);
    this.gaps.delete(reason);
  }
  intervalGap(reason, from, to) {
    const id = this.store.openGap?.(reason, Math.min(from, to));
    if (id !== undefined) this.store.closeGap?.(id, Math.max(from, to));
  }
  resetBaseline() {
    this.accounting.resetBaseline();
    this.detector.reset();
    this.recent = [];
  }
  start() {
    this.stopping = false;
    if (!this.config.demo) this.observer.start();
    this.tick();
  }
  async tick() {
    if (this.stopping) return;
    const began = this.now();
    const pollBegan = performance.now();
    let operation = 'collector';
    this.diagnostics.polls++;
    try {
      if (!this.trackingStarted) {
        this.store.closeOpenGaps?.(began);
        const previous = this.store.lastAt?.();
        if (previous && previous > began) this.intervalGap('clock_changed', began, previous);
        this.openGap(
          previous ? 'collector_restart' : 'initial_baseline',
          Math.min(previous || began, began),
        );
        this.trackingStarted = true;
      }
      if (began - this.lastSessionRefresh >= 8000 && !this.config.demo) {
        this.sessions.refresh(began);
        this.lastSessionRefresh = began;
      }
      operation = 'source';
      const snapshot = await this.source.snapshot();
      operation = 'collector';
      if (this.stopping) return;
      const now = this.now();
      if (this.lastAt && now < this.lastAt) {
        this.intervalGap('clock_changed', now, this.lastAt);
        this.resetBaseline();
        this.lastAlert = 0;
      } else if (
        this.lastAt &&
        !this.gaps.has('source_unavailable') &&
        !this.gaps.has('collector_error') &&
        now - this.lastAt > Math.max(6000, this.config.intervalMs * 3)
      ) {
        this.intervalGap('sampling_delay', this.lastAt, now);
        this.resetBaseline();
      }
      const sourceChanged = this.source.generation !== this.sourceGeneration;
      if (sourceChanged) {
        if (this.sourceGeneration !== undefined) {
          this.intervalGap('source_changed', this.lastAt || began, now);
          this.diagnostics.reconnects++;
        }
        this.resetBaseline();
        this.sourceGeneration = this.source.generation;
        this.nativeLost = 0;
      }
      if (snapshot.eventsLost > (this.nativeLost || 0)) this.intervalGap('native_events_lost', this.lastAt || began, now);
      this.nativeLost = snapshot.eventsLost || 0;
      if (this.gaps.has('source_unavailable') && !sourceChanged) this.diagnostics.reconnects++;
      for (const reason of [
        'initial_baseline',
        'collector_restart',
        'source_unavailable',
        'collector_error',
      ])
        this.closeGap(reason, now);
      if (!this.config.demo) {
        const observerAge = now - this.observer.at;
        const observerReady =
          this.observer.status === 'ready' &&
          this.observer.at > 0 &&
          observerAge >= 0 &&
          observerAge <= 6000;
        if (observerReady) this.closeGap('observer_unavailable', now);
        else if (now - this.startedAt >= 6000) this.openGap('observer_unavailable', now);
      }
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
        (m, t) => this.observer.classify(snapshot.incremental ? m : { ...m, native: false }, t),
        this.sessions.active,
      );
      const inserted = this.store.record(sample);
      this.latest = sample;
      this.lastAt = now;
      this.state = 'connected';
      if (inserted !== false) this.store.checkBudgets?.(now, this.budgetSettings);
      this.controllerIssue = null;
      this.error = '';
      if (inserted !== false)
        for (const event of this.detector.consume(sample, this.alertMBPerMinute))
          this.store.anomaly?.(event);
      this.recent.push(sample);
      this.recent = this.recent.filter((x) => x.at >= now - 60000);
      const bytes = this.recent.reduce((n, x) => n + x.codexUp + x.codexDown, 0);
      if (
        bytes >= this.alertMBPerMinute * 1000000 &&
        (!this.lastAlert || now - this.lastAlert >= 60000)
      ) {
        this.store.alert(
          now,
          `Codex 最近 60 秒已观测到 ${(bytes / 1000000).toFixed(1)} MB，超过 ${this.alertMBPerMinute} MB 提醒阈值。`,
        );
        this.lastAlert = now;
      }
      if (now - this.lastPrune >= 3600000) {
        this.store.prune(this.retentionDays, now);
        this.lastPrune = now;
      }
    } catch (error) {
      this.state = 'disconnected';
      this.controllerIssue =
        operation === 'source' ? this.source.issue || 'unreachable' : 'collection';
      this.error = /未连接|接口需要/.test(error.message)
        ? error.message
        : '采集暂时失败，正在自动重试；空档不计为零流量。';
      if (operation === 'source' && this.source.native?.issue === 'elevation_required' && this.source.preference !== 'mihomo')
        this.error = '原生采集需要 Windows 授权；请在设置中授权采集助手，或选择 Mihomo 接口。';
      // Reconnect starts a new baseline. Offline traffic is deliberately not invented.
      this.diagnostics.failures++;
      this.diagnostics.lastError = String(error.code || error.name || 'Error')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);
      try {
        this.openGap(
          operation === 'source' ? 'source_unavailable' : 'collector_error',
          this.lastAt || began,
        );
      } catch {
        // A failing storage device may also reject the diagnostic write. Keep retrying.
      }
      this.resetBaseline();
      console.error(`[${new Date().toISOString()}] sampling failed: ${error.code || error.name}`);
    } finally {
      this.diagnostics.lastPollMs = Math.round(performance.now() - pollBegan);
      this.diagnostics.maxPollMs = Math.max(
        this.diagnostics.maxPollMs,
        this.diagnostics.lastPollMs,
      );
      if (!this.stopping)
        this.timer = setTimeout(
          () => this.tick(),
          Math.max(50, this.config.intervalMs - (performance.now() - pollBegan)),
        );
    }
  }
  status() {
    const s = this.latest;
    const elapsed = s?.duration ? s.duration / 1000 : 1;
    const live =
      this.state === 'connected' &&
      this.now() - this.lastAt >= 0 &&
      this.now() - this.lastAt < this.config.intervalMs + 6000;
    const memory = process.memoryUsage();
    return {
      state: this.state,
      error: this.error,
      controllerIssue: this.controllerIssue || null,
      demo: this.config.demo,
      capture: this.config.demo ? { mode: 'demo', active: 'demo' } : this.source.status?.(),
      startedAt: this.startedAt,
      firstAt: this.store.firstAt(),
      lastAt: this.lastAt,
      endpoint: this.source.endpoint,
      observer: this.config.demo ? 'demo' : this.observer.status,
      sessionReader: this.config.demo ? 'demo' : this.sessions.status,
      retentionDays: this.retentionDays,
      intervalMs: this.config.intervalMs,
      alertMBPerMinute: this.alertMBPerMinute,
      upRate: live ? s.codexUp / elapsed : null,
      downRate: live ? s.codexDown / elapsed : null,
      allRate: live ? (s.allUp + s.allDown) / elapsed : null,
      connections: s?.rows.length || 0,
      codexConnections: s?.rows.filter((x) => x.scope === 'codex').length || 0,
      unknownConnections: s?.rows.filter((x) => x.scope === 'unknown').length || 0,
      processes: this.observer.processes.size,
      diagnostics: {
        ...this.diagnostics,
        uptimeMs: Math.max(0, this.now() - this.startedAt),
        memory: { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external },
        observerStaleMs: this.observer.at ? Math.max(0, this.now() - this.observer.at) : null,
      },
    };
  }
  setThreshold(value) {
    this.alertMBPerMinute = value;
    this.store.set('alertMBPerMinute', value);
  }
  setBudgetSettings(value) {
    const validated = validateBudget(value);
    this.store.set('budget', validated);
    this.budgetSettings = validated;
    this.store.checkBudgets?.(this.now(), validated);
  }
  setRetentionDays(value) {
    this.store.set('retentionDays', value);
    this.retentionDays = value;
    // Apply the new window on the next successful poll without restarting capture.
    this.lastPrune = -Infinity;
  }
  async setCapture(mode, authorize = false) {
    if (this.config.demo || !this.source.setMode) throw new Error('capture_unavailable');
    await this.source.setMode(mode, authorize);
    this.store.set('captureMode', mode);
  }
  stop() {
    this.stopping = true;
    clearTimeout(this.timer);
    this.observer.stop();
    this.source.stop?.();
    for (const reason of this.gaps.keys()) {
      try {
        this.closeGap(reason, this.now());
      } catch {
        // Shutdown must still release the observer if storage is unavailable.
      }
    }
  }
}
