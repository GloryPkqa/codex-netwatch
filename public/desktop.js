// The regular browser has no native channel. The desktop host accepts only
// startup get/set messages from its own loopback origin, with no general host API.
export function createStartupBridge(channel, timeoutMs = 4000) {
  if (typeof channel?.postMessage !== 'function' || typeof channel?.addEventListener !== 'function')
    return null;
  let sequence = 0;
  const pending = new Map();
  channel.addEventListener('message', ({ data }) => {
    if (data?.type !== 'netwatch:startup:result' || typeof data.id !== 'string') return;
    const request = pending.get(data.id);
    if (!request) return;
    if (data.ok === true && typeof data.enabled !== 'boolean') return;
    if (typeof data.ok !== 'boolean') return;
    pending.delete(data.id);
    clearTimeout(request.timer);
    if (data.ok) request.resolve(data.enabled);
    else request.reject(new Error('startup_failed'));
  });
  function request(action, enabled) {
    return new Promise((resolve, reject) => {
      const id = `startup-${++sequence}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('startup_timeout'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        channel.postMessage({
          type: 'netwatch:startup',
          id,
          action,
          ...(action === 'set' ? { enabled } : {}),
        });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }
  return {
    get: () => request('get'),
    set: (enabled) => {
      if (typeof enabled !== 'boolean') return Promise.reject(new TypeError('Expected a boolean'));
      return request('set', enabled);
    },
  };
}
