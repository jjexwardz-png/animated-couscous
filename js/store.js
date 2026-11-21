/* On-device storage: saved parcels, history and settings in localStorage; photos in IndexedDB. */
(function () {
  const K = { saved: 'tract.saved.v1', recent: 'tract.recent.v1', prefs: 'tract.prefs.v1', view: 'tract.view.v1' };
  const read = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  const Store = {
    saved: () => read(K.saved, []),
    setSaved: (list) => write(K.saved, list),
    getSaved(id) { return this.saved().find((p) => p.id === id) || null; },
    upsertSaved(p) {
      const list = this.saved();
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = { ...list[i], ...p }; else list.unshift(p);
      return write(K.saved, list);
    },
    removeSaved(id) { this.setSaved(this.saved().filter((p) => p.id !== id)); },

    recent: () => read(K.recent, []),
    pushRecent(item) {
      const list = this.recent().filter((r) => r.id !== item.id);
      list.unshift({ ...item, at: Date.now() });
      write(K.recent, list.slice(0, 40));
    },
    clearRecent: () => write(K.recent, []),

    prefs: () => read(K.prefs, { basemap: 'hybrid', lines: true, saved: true, labels: true }),
    setPrefs(p) { write(K.prefs, { ...this.prefs(), ...p }); },
    view: () => read(K.view, null),
    setView: (v) => write(K.view, v),
  };

  // ---------- photos ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('Photo storage is not available in this browser.'));
      const r = indexedDB.open('tract', 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('parcel', 'parcel');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('photos', mode);
      const out = fn(t.objectStore('photos'));
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  };
  Store.photos = {
    async add(parcel, blob) {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      await tx('readwrite', (s) => s.put({ id, parcel, blob, at: Date.now() }));
      return id;
    },
    async list(parcel) {
      const d = await db();
      return new Promise((resolve, reject) => {
        const r = d.transaction('photos').objectStore('photos').index('parcel').getAll(parcel);
        r.onsuccess = () => resolve((r.result || []).sort((a, b) => a.at - b.at));
        r.onerror = () => reject(r.error);
      });
    },
    remove: (id) => tx('readwrite', (s) => s.delete(id)),
    async removeAll(parcel) { for (const p of await this.list(parcel)) await this.remove(p.id); },
  };

  // Shrink a photo before storing it so phones do not fill their quota.
  Store.compressImage = async function (file, max = 1600) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.82));
    } catch { return file; }
  };

  window.Store = Store;
})();
