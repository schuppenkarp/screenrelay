// A view releases its claim, not the resource. Feed updates decide what can be closed.
export function createRetainedResources({ create, attach, park, destroy }) {
  const entries = new Map();
  const signature = (item) => JSON.stringify([item.url, item.stream_kind]);
  return {
    mount(target, item, options) {
      let entry = entries.get(item.id);
      if (entry && entry.signature !== signature(item)) {
        destroy(entry.resource);
        entries.delete(item.id);
        entry = null;
      }
      if (!entry) {
        entry = { resource: create(item, options), signature: signature(item) };
        entries.set(item.id, entry);
      }
      const claim = Symbol();
      entry.claim = claim;
      attach(entry.resource, target, item, options);
      return () => {
        // A delayed transition cleanup must not steal a resource from its newer view.
        if (entries.get(item.id) === entry && entry.claim === claim) {
          entry.claim = null;
          park(entry.resource);
        }
      };
    },
    sync(items) {
      const allowed = new Map(
        items
          .filter((item) => item.type === 'stream' && item.visible !== false)
          .map((item) => [item.id, signature(item)]),
      );
      for (const [id, entry] of entries) {
        if (allowed.get(id) !== entry.signature) {
          destroy(entry.resource);
          entries.delete(id);
        }
      }
    },
    clear() {
      for (const entry of entries.values()) destroy(entry.resource);
      entries.clear();
    },
  };
}
