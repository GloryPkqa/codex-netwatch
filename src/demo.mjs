// Synthetic data only; always uses its own database and a conspicuous UI badge.
export class DemoSource {
  constructor() {
    this.tick = 0;
    this.endpoint = '演示数据（非实测）';
    this.up = 0;
    this.down = 0;
    this.start = new Date().toISOString();
  }
  async snapshot() {
    this.tick++;
    const wave = Math.max(0.2, 1 + Math.sin(this.tick / 9));
    this.up += Math.floor(130000 * wave);
    this.down += Math.floor(37000 * wave);
    return {
      uploadTotal: this.up + this.tick * 20000,
      downloadTotal: this.down + this.tick * 45000,
      connections: [
        {
          id: 'demo-codex',
          start: this.start,
          upload: this.up,
          download: this.down,
          rule: 'DomainSuffix',
          metadata: { process: 'codex.exe', network: 'tcp', host: 'chatgpt.com' },
        },
        {
          id: 'demo-other',
          start: this.start,
          upload: this.tick * 20000,
          download: this.tick * 45000,
          rule: 'Match',
          metadata: { process: 'browser.exe', network: 'tcp', host: 'example.org' },
        },
      ],
    };
  }
}
