/** Per-project async lanes prevent autosaves and explicit saves from committing out of order. */
export function createSaveQueue() {
  const lanes = new Map<string, Promise<void>>();

  return function run<T>(key: string, operation: () => Promise<T> | T): Promise<T> {
    const previous = lanes.get(key) || Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(() => undefined, () => undefined);
    lanes.set(key, tail);
    void tail.then(() => {
      if (lanes.get(key) === tail) lanes.delete(key);
    });
    return result;
  };
}

export const runSaveSerial = createSaveQueue();
