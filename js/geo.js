/* Geometry helpers and parcel lookups against public ArcGIS services. */
(function () {
  const R = 6378137;
  const rad = (d) => (d * Math.PI) / 180;

  // Signed planar area of a [lng,lat] ring; negative = clockwise (Esri outer ring).
  function signedArea(ring) {
    let s = 0;
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    return -s / 2;
  }
  // Geodesic area in square meters (spherical approximation used by most web maps).
  function ringArea(ring) {
    let a = 0;
    const n = ring.length;
    if (n < 3) return 0;
    for (let i = 0; i < n; i++) {
      const p1 = ring[i], p2 = ring[(i + 1) % n];
      a += rad(p2[0] - p1[0]) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
    }
    return Math.abs((a * R * R) / 2);
  }
  function pointInRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Even-odd test across all rings handles holes and multipart parcels.
  function pointInRings(pt, rings) {
    let c = 0;
    for (const r of rings) if (pointInRing(pt, r)) c++;
    return c % 2 === 1;
  }
  // Group Esri rings into polygons: [[outer, hole, ...], ...]
  function groupRings(rings) {
    const outers = [], holes = [];
    for (const r of rings) (signedArea(r) < 0 ? outers : holes).push(r);
    if (!outers.length) return rings.map((r) => [r]);
    const polys = outers.map((o) => [o]);
    for (const h of holes) {
      const host = polys.find((p) => pointInRing(h[0], p[0])) || polys[0];
      host.push(h);
    }
    return polys;
  }
  function areaSqm(rings) {
    return groupRings(rings).reduce((t, p) => t + ringArea(p[0]) - p.slice(1).reduce((s, h) => s + ringArea(h), 0), 0);
  }
  function bbox(rings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  }
  // A point guaranteed inside the largest ring (for pins and directions).
  function labelPoint(rings) {
    const polys = groupRings(rings);
    let best = polys[0];
    for (const p of polys) if (ringArea(p[0]) > ringArea(best[0])) best = p;
    const outer = best[0];
    let cx = 0, cy = 0, a = 0;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const f = outer[j][0] * outer[i][1] - outer[i][0] * outer[j][1];
      cx += (outer[j][0] + outer[i][0]) * f; cy += (outer[j][1] + outer[i][1]) * f; a += f;
    }
    let c = a ? [cx / (3 * a), cy / (3 * a)] : outer[0];
    if (pointInRings(c, best)) return c;
    // Fallback: scan a horizontal line through the bbox middle.
    const [x0, y0, x1, y1] = bbox([outer]);
    const y = (y0 + y1) / 2, xs = [];
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const [xi, yi] = outer[i], [xj, yj] = outer[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((m, n) => m - n);
    return xs.length >= 2 ? [(xs[0] + xs[1]) / 2, y] : [(x0 + x1) / 2, y];
  }
  function haversine(a, b) {
    const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
  }

  // ---------- network ----------
  async function getJSON(url, { timeout = 20000, signal } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    if (signal) signal.addEventListener('abort', () => ctrl.abort());
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j && j.error) throw new Error(j.error.message || 'Service error');
      return j;
    } finally { clearTimeout(t); }
  }
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const lowerKeys = (o) => { const r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; return r; };

  const projReady = {};
  function toSourceXY(src, lng, lat) {
    if (!src.proj) return [lng, lat];
    if (!projReady[src.proj.code]) { proj4.defs(src.proj.code, src.proj.def); projReady[src.proj.code] = true; }
    return proj4('EPSG:4326', src.proj.code, [lng, lat]);
  }
  function envelope(src, w, s, e, n) {
    if (!src.proj) return { geometry: `${w},${s},${e},${n}`, inSR: 4326 };
    const a = toSourceXY(src, w, s), b = toSourceXY(src, e, n), c = toSourceXY(src, w, n), d = toSourceXY(src, e, s);
    const xs = [a[0], b[0], c[0], d[0]], ys = [a[1], b[1], c[1], d[1]];
    return { geometry: `${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}` };
  }

  async function addGeometry(src, feats, signal) {
    const ids = feats.map((f) => f.attributes.objectid ?? f.attributes.OBJECTID).filter((x) => x !== undefined);
    if (!ids.length) return feats;
    const g = await getJSON(`${src.url}/query?${qs({ f: 'json', objectIds: ids.join(','), outFields: 'OBJECTID', returnGeometry: true, outSR: 4326 })}`, { signal });
    const byId = new Map((g.features || []).map((f) => [f.attributes.OBJECTID ?? f.attributes.objectid, f.geometry]));
    for (const f of feats) f.geometry = byId.get(f.attributes.OBJECTID ?? f.attributes.objectid) || null;
    return feats;
  }

  async function queryEnvelope(src, w, s, e, n, { where = '1=1', limit = 10, signal } = {}) {
    const env = envelope(src, w, s, e, n);
    const p = {
      f: 'json', where, geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
      outFields: '*', returnGeometry: !src.splitGeometry, outSR: 4326, resultRecordCount: limit, ...env,
    };
    const feats = (await limitedQuery(limit ? src : { ...src, noLimit: true }, p, { signal })).slice(0, limit || undefined);
    if (src.splitGeometry && feats.length) await addGeometry(src, feats, signal);
    return feats;
  }
  // Some hosted services reject resultRecordCount on spatial queries; retry without it.
  async function limitedQuery(src, p, opts) {
    if (!src.noLimit) {
      try { return (await getJSON(`${src.url}/query?${qs(p)}`, opts)).features || []; }
      catch (e) { if (opts.signal && opts.signal.aborted) throw e; if (!/invalid query|parameters/i.test(e.message)) throw e; src.noLimit = true; }
    }
    const q = { ...p }; delete q.resultRecordCount;
    return (await getJSON(`${src.url}/query?${qs(q)}`, opts)).features || [];
  }

  async function identifyAt(src, lng, lat, signal) {
    const d = 0.0005;
    const p = {
      f: 'json', geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', sr: 4326, layers: 'all:0', tolerance: 1,
      mapExtent: `${lng - d},${lat - d},${lng + d},${lat + d}`, imageDisplay: '400,400,96', returnGeometry: true,
    };
    const j = await getJSON(`${src.url}/identify?${qs(p)}`, { signal });
    return (j.results || []).map((r) => ({ attributes: r.attributes, geometry: r.geometry }));
  }

  // Find the parcel polygon under a point. Returns { attrs, rings } or null.
  async function parcelAt(src, lng, lat, signal) {
    let feats;
    if (src.identify) feats = await identifyAt(src, lng, lat, signal);
    else {
      const d = 0.00003;
      feats = await queryEnvelope(src, lng - d, lat - d, lng + d, lat + d, { limit: 0, signal }); // tiny box: no limit needed, and limits slow some services
    }
    feats = feats.filter((f) => f.geometry && f.geometry.rings && f.geometry.rings.length);
    if (!feats.length) return null;
    const pt = [lng, lat];
    const inside = feats.filter((f) => pointInRings(pt, f.geometry.rings));
    const pool = inside.length ? inside : feats;
    // Prefer the smallest containing polygon (stacked condo/ROW layers sit over large lots).
    pool.sort((a, b) => areaSqm(a.geometry.rings) - areaSqm(b.geometry.rings));
    const f = pool[0];
    return { attrs: lowerKeys(f.attributes), rawAttrs: f.attributes, rings: f.geometry.rings, exact: inside.length > 0 };
  }

  function sqlEscape(s) { return String(s).replace(/'/g, "''").toUpperCase(); }

  async function searchOwner(src, term, bounds, signal) {
    const where = `UPPER(${src.ownerField}) LIKE '%${sqlEscape(term)}%'`;
    const feats = await queryEnvelope(src, bounds[0], bounds[1], bounds[2], bounds[3], { where, limit: 60, signal });
    return feats.filter((f) => f.geometry && f.geometry.rings).map((f) => ({ attrs: lowerKeys(f.attributes), rawAttrs: f.attributes, rings: f.geometry.rings }));
  }
  async function searchParcelId(src, term, signal) {
    const t = sqlEscape(term.trim());
    const where = `UPPER(${src.idField}) = '${t}' OR UPPER(${src.idField}) LIKE '${t}%'`;
    const p = { f: 'json', where, outFields: '*', returnGeometry: !src.splitGeometry, outSR: 4326, resultRecordCount: 25 };
    const feats = (await limitedQuery(src, p, { signal, timeout: 30000 })).slice(0, 25);
    if (src.splitGeometry && feats.length) await addGeometry(src, feats, signal);
    return feats.filter((f) => f.geometry && f.geometry.rings).map((f) => ({ attrs: lowerKeys(f.attributes), rawAttrs: f.attributes, rings: f.geometry.rings }));
  }

  // ---------- states ----------
  let states = null;
  async function loadStates() {
    if (states) return states;
    const j = await getJSON('data/states.json');
    states = j.features.map((f) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const rings = polys.flat();
      return { abbr: f.properties.abbr, name: f.properties.name, rings, bbox: bbox(rings) };
    });
    return states;
  }
  // States containing the point first, then neighbors whose outline is near (state outlines are generalized).
  function statesAt(lng, lat) {
    if (!states) return { inside: [], near: [] };
    const pt = [lng, lat], pad = 0.08;
    const hit = states.filter((s) => pointInRings(pt, s.rings)).map((s) => s.abbr);
    const near = states.filter((s) => !hit.includes(s.abbr) && lng >= s.bbox[0] - pad && lng <= s.bbox[2] + pad && lat >= s.bbox[1] - pad && lat <= s.bbox[3] + pad)
      .map((s) => s.abbr);
    return { inside: hit, near };
  }

  // ---------- geocoding (OpenStreetMap data) ----------
  async function geocode(q, near, signal) {
    const p = { q, limit: 7, lang: 'en', bbox: '-179.9,17.5,-64.5,71.5' };
    if (near) { p.lat = near[1].toFixed(4); p.lon = near[0].toFixed(4); }
    const j = await getJSON(`https://photon.komoot.io/api/?${qs(p)}`, { signal, timeout: 10000 });
    return (j.features || []).filter((f) => !f.properties.countrycode || ['US', 'PR'].includes(f.properties.countrycode)).map((f) => {
      const pr = f.properties;
      const street = [pr.housenumber, pr.street].filter(Boolean).join(' ');
      const title = pr.name && pr.name !== street ? pr.name : street || pr.name || pr.city || pr.county || pr.state;
      const sub = [pr.name && street && pr.name !== street ? street : null, pr.city || pr.town || pr.village, pr.county, pr.state].filter(Boolean).filter((x) => x !== title).join(', ');
      return { title, sub, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], extent: pr.extent, isAddress: !!pr.housenumber };
    });
  }
  async function reverseGeocode(lng, lat, signal) {
    const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?${qs({ lat, lon: lng, format: 'jsonv2', zoom: 18, addressdetails: 1 })}`, { signal, timeout: 10000 });
    const a = j.address || {};
    return {
      street: [a.house_number, a.road].filter(Boolean).join(' ') || null,
      city: a.city || a.town || a.village || a.hamlet || a.township || null,
      county: a.county ? a.county.replace(/ County$/, '') : null,
      state: a.state || null, zip: a.postcode || null, name: j.name || null,
    };
  }

  window.Geo = {
    signedArea, ringArea, areaSqm, pointInRings, groupRings, bbox, labelPoint, haversine,
    parcelAt, searchOwner, searchParcelId, loadStates, statesAt, geocode, reverseGeocode, getJSON,
  };
})();
