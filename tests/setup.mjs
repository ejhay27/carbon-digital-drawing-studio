// Install browser shims before loading the bundled test module. A bundler banner in
// an ESM file runs after its static dependencies have initialized, so it is too late
// for Zustand's localStorage persistence adapter.
const storage = new Map();
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: (key) => { storage.delete(key); },
    clear: () => { storage.clear(); },
    key: (index) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; },
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = { localStorage: globalThis.localStorage };
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node', onLine: true };
if (typeof globalThis.document === 'undefined') {
  const noopCtx = () => new Proxy({}, {
    get: (_target, key) => {
      if (key === 'getImageData') return (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set: () => true,
  });
  globalThis.document = {
    createElement: (tag) => ({
      width: 300, height: 150, style: {},
      getContext: () => (tag === 'canvas' ? noopCtx() : null),
      toDataURL: () => 'data:image/png;base64,',
    }),
    createElementNS: (_namespace, tag) => globalThis.document.createElement(tag),
    addEventListener() {},
    removeEventListener() {},
  };
}
