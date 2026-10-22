// These are findings about measured Codex deltas, never inferred session bytes.
// Keep only a bounded recent window and a few largest contributors per sample.
export class AnomalyDetector {
  constructor() {
    this.reset();
  }
  reset() {
    this.recent = [];
    this.triggered = new Map();
    this.lastAt = 0;
  }
  consume(sample, mbPerMinute) {
    if (sample.baseline || !sample.duration || sample.at <= this.lastAt) {
      if (sample.baseline || sample.at < this.lastAt) this.reset();
      return [];
    }
    this.lastAt = sample.at;
    const threshold = mbPerMinute * 1000000;
    const candidates = sample.rows.filter((x) => x.scope === 'codex' && x.up + x.down > 0);
    // Retain both directions so large uploads cannot hide the download finding's
    // actual contributor (and vice versa). The union is bounded to 20 rows.
    const retained = new Map(
      [
        ...candidates
          .filter((x) => x.up > 0)
          .sort((a, b) => b.up - a.up)
          .slice(0, 10),
        ...candidates
          .filter((x) => x.down > 0)
          .sort((a, b) => b.down - a.down)
          .slice(0, 10),
      ].map((row) => [row.key, row]),
    );
    const rows = [...retained.values()].map(({ key, process, pid, host, evidence, up, down }) => ({
      key,
      process,
      pid,
      host,
      evidence,
      up,
      down,
    }));
    this.recent.push({
      at: sample.at,
      duration: sample.duration,
      up: sample.codexUp,
      down: sample.codexDown,
      rows,
    });
    this.recent = this.recent.filter((x) => x.at > sample.at - 300000).slice(-600);
    const minute = this.recent.filter((x) => x.at > sample.at - 60000);
    const sustained = this.recent.filter((x) => x.at > sample.at - 120000);
    const findings = [];
    const check = (kind, direction, window, active, recovered) => {
      const prior = this.triggered.get(kind);
      if (recovered && prior) prior.armed = true;
      if (!active || (prior && (!prior.armed || sample.at - prior.at < 300000))) return;
      this.triggered.set(kind, { at: sample.at, armed: false });
      const up = window.reduce((n, x) => n + x.up, 0);
      const down = window.reduce((n, x) => n + x.down, 0);
      const duration = window.reduce((n, x) => n + x.duration, 0);
      const contributors = new Map();
      for (const x of window)
        for (const row of x.rows) {
          const key = `${row.process}\0${row.pid}\0${row.host}`;
          const old = contributors.get(key) || { ...row, up: 0, down: 0 };
          old.up += row.up;
          old.down += row.down;
          contributors.set(key, old);
        }
      const context = [...contributors.values()]
        .filter((row) => row[direction] > 0)
        .sort((a, b) => b[direction] - a[direction])[0];
      findings.push({
        kind,
        scope: 'codex',
        from: window[0].at - window[0].duration,
        to: sample.at,
        up,
        down,
        bytes: direction === 'up' ? up : down,
        rate: (direction === 'up' ? up : down) / Math.max(0.001, duration / 1000),
        thresholdBytes: threshold,
        process: context?.process || '',
        pid: context?.pid ?? null,
        host: context?.host || '',
        evidence: context?.evidence || 'none',
        contextMode: 'largest_observed_contributor',
        contextUp: context?.up || 0,
        contextDown: context?.down || 0,
        connections: new Set(window.flatMap((x) => x.rows.map((r) => r.key))).size,
      });
    };
    const minuteUp = minute.reduce((n, x) => n + x.up, 0);
    const minuteDown = minute.reduce((n, x) => n + x.down, 0);
    check('upload_burst', 'up', minute, minuteUp >= threshold, minuteUp < threshold / 2);
    check('download_burst', 'down', minute, minuteDown >= threshold, minuteDown < threshold / 2);
    const duration = sustained.reduce((n, x) => n + x.duration, 0);
    const sustainedUp = sustained.reduce((n, x) => n + x.up, 0);
    const activeDuration = sustained.reduce(
      (n, x) => n + (x.up / x.duration >= threshold / 60000 / 4 ? x.duration : 0),
      0,
    );
    const high = duration >= 120000 && sustainedUp / duration >= threshold / 60000 / 2;
    check(
      'sustained_upload',
      'up',
      sustained,
      high && activeDuration / Math.max(1, duration) >= 0.75,
      sustainedUp / Math.max(1, duration) < threshold / 60000 / 4,
    );
    return findings;
  }
}
