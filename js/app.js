/* Tract – free parcel map. Main UI. */
(function () {
  const { SOURCES, STATE_NAMES } = window.ParcelSources;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const LINES_MIN_ZOOM = 14;
  const SAVE_COLORS = ['#e2570f', '#d6336c', '#7048e8', '#1c7ed6', '#0ca678', '#f59f00', '#495057'];

  // ---------- formatting ----------
  const fmtMoney = (n) => (n == null ? null : '$' + Math.round(n).toLocaleString('en-US'));
  const fmtNum = (n) => (n == null ? null : Math.round(n).toLocaleString('en-US'));
  const fmtAcres = (a) => {
    if (a == null) return null;
    const d = a < 10 ? 2 : a < 1000 ? 1 : 0;
    return `${a.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })} ac`;
  };
  const fmtFeet = (m) => { const ft = m * 3.28084; return ft < 1000 ? `${Math.round(ft).toLocaleString()} ft` : `${(ft / 5280).toFixed(2)} mi`; };
  const fmtArea = (sqm) => { const ac = sqm / 4046.8564224; return ac < 0.5 ? `${Math.round(sqm * 10.7639).toLocaleString()} sq ft` : `${ac.toFixed(2)} acres`; };
  const titleCase = (s) => (s && s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Lp|Ii|Iii|Iv|Usa|Po|Ste)\b/g, (m) => m.toUpperCase()) : s);
  const countyLabel = (c) => { if (!c) return null; c = titleCase(String(c)); return /(county|city|parish|borough|region|town|census area|municipality)/i.test(c) ? c : `${c} County`; };

  // ---------- toast ----------
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  async function copyText(text, label = 'Copied') {
    try { await navigator.clipboard.writeText(text); toast(label); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(label); } catch { toast('Copy failed. Select the text manually.'); }
      ta.remove();
    }
  }

  // ---------- map ----------
  const prefs = Store.prefs();
  const map = L.map('map', { zoomControl: false, minZoom: 3, maxZoom: 21, worldCopyJump: true, tap: true, attributionControl: true });
  map.attributionControl.setPrefix('');
  window.__map = map;

  const BASEMAPS = {
    satellite: {
      label: 'Satellite', dark: true,
      thumb: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/15/12603/9384',
      make: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
    },
    streets: {
      label: 'Streets', dark: false, labelsBuiltIn: true,
      thumb: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/15/12603/9384',
      make: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Map © Esri, HERE, Garmin, USGS, OpenStreetMap contributors' }),
    },
    topo: {
      label: 'USGS Topo', dark: false, labelsBuiltIn: true,
      thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/15/12603/9384',
      make: () => L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 21, attribution: 'USGS The National Map' }),
    },
    terrain: {
      label: 'Terrain', dark: false, labelsBuiltIn: true,
      thumb: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/15/12603/9384',
      make: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Map © Esri, HERE, Garmin, USGS, OpenStreetMap contributors' }),
    },
  };
  if (!BASEMAPS[prefs.basemap]) prefs.basemap = 'satellite';

  const labelLayer = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, pane: 'labels', opacity: 0.85 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, pane: 'labels' }),
  ]);
  map.createPane('lines'); map.getPane('lines').style.zIndex = 350; map.getPane('lines').style.pointerEvents = 'none';
  map.createPane('labels'); map.getPane('labels').style.zIndex = 360; map.getPane('labels').style.pointerEvents = 'none';
  const linesLayer = L.tileLayer('https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}', {
    pane: 'lines', minZoom: LINES_MIN_ZOOM, minNativeZoom: 15, maxNativeZoom: 17, maxZoom: 21, className: 'lines-layer',
    attribution: 'Parcel lines © <a href="https://regrid.com" target="_blank" rel="noopener">Regrid</a>',
  });

  let baseLayer = null;
  function setBasemap(key) {
    const b = BASEMAPS[key];
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = b.make().addTo(map);
    baseLayer.bringToBack();
    prefs.basemap = key; Store.setPrefs({ basemap: key });
    const m = $('#map');
    m.classList.toggle('bm-dark', !!b.dark); m.classList.toggle('bm-light', !b.dark);
    $$('.bm').forEach((el) => el.classList.toggle('on', el.dataset.key === key));
    syncLabels();
  }
  function syncLabels() {
    const want = prefs.labels && !BASEMAPS[prefs.basemap].labelsBuiltIn;
    if (want) labelLayer.addTo(map); else map.removeLayer(labelLayer);
    $('#tglLabels').closest('label').hidden = !!BASEMAPS[prefs.basemap].labelsBuiltIn;
  }
  $('#basemaps').innerHTML = Object.entries(BASEMAPS).map(([k, b]) => `<button class="bm" data-key="${k}"><i style="background-image:url('${b.thumb}')"></i><span>${b.label}</span></button>`).join('');
  $('#basemaps').addEventListener('click', (e) => { const b = e.target.closest('.bm'); if (b) setBasemap(b.dataset.key); });

  $('#tglLines').checked = prefs.lines !== false;
  $('#tglSaved').checked = prefs.saved !== false;
  $('#tglLabels').checked = prefs.labels !== false;
  $('#tglLines').addEventListener('change', (e) => { Store.setPrefs({ lines: e.target.checked }); prefs.lines = e.target.checked; e.target.checked ? linesLayer.addTo(map) : map.removeLayer(linesLayer); updateHint(); });
  $('#tglSaved').addEventListener('change', (e) => { Store.setPrefs({ saved: e.target.checked }); prefs.saved = e.target.checked; e.target.checked ? savedLayer.addTo(map) : map.removeLayer(savedLayer); });
  $('#tglLabels').addEventListener('change', (e) => { Store.setPrefs({ labels: e.target.checked }); prefs.labels = e.target.checked; syncLabels(); });
  if (prefs.lines !== false) linesLayer.addTo(map);

  // initial view
  function parseHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    let m = h.match(/^p=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (m) return { select: [+m[1], +m[2]] };
    m = h.match(/^@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)z?/);
    if (m) return { view: [+m[1], +m[2], +m[3]] };
    return {};
  }
  const start = parseHash();
  const sv = Store.view();
  if (start.select) map.setView(start.select, 18);
  else if (start.view) map.setView([start.view[0], start.view[1]], start.view[2]);
  else if (sv) map.setView([sv.lat, sv.lng], sv.z);
  else map.setView([39.5, -98.35], 4);
  setBasemap(prefs.basemap);

  const selLayer = L.layerGroup().addTo(map);
  const savedLayer = L.layerGroup();
  const resultsLayer = L.layerGroup().addTo(map);
  if (prefs.saved !== false) savedLayer.addTo(map);

  function updateHint() {
    const z = map.getZoom();
    $('#zoomHint').classList.toggle('off', !(prefs.lines !== false && z < LINES_MIN_ZOOM));
    $('#zoomHint').textContent = z < 11 ? 'Zoom in or search to see property lines' : 'Zoom in to see property lines';
  }
  function updateCoords() { const c = map.getCenter(); $('#coords').textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`; }
  let viewT;
  map.on('moveend zoomend', () => {
    updateHint(); updateCoords();
    clearTimeout(viewT);
    viewT = setTimeout(() => {
      const c = map.getCenter(), z = map.getZoom();
      Store.setView({ lat: c.lat, lng: c.lng, z });
      if (!/^#p=/.test(location.hash)) history.replaceState(null, '', `#@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${z}z`);
    }, 400);
  });
  updateHint(); updateCoords();

  // ---------- parcel lookup ----------
  let current = null; // the parcel shown in the sheet
  let reqSeq = 0, reqCtrl = null;

  function buildParcel(st, srcKey, hit) {
    const src = SOURCES[srcKey];
    let rec = {};
    try { rec = src.map(hit.attrs) || {}; } catch (e) { console.warn('map failed', e); }
    for (const k of Object.keys(rec)) if (rec[k] === '' || rec[k] === undefined) rec[k] = null;
    const gisAcres = Geo.areaSqm(hit.rings) / 4046.8564224;
    if (!rec.acres || rec.acres <= 0) rec.acres = gisAcres;
    rec.gisAcres = gisAcres;
    const lp = Geo.labelPoint(hit.rings);
    const oid = hit.attrs.objectid ?? hit.attrs.fid ?? `${lp[1].toFixed(5)},${lp[0].toFixed(5)}`;
    return {
      id: `${srcKey}:${rec.parcelId || rec.altId || oid}`, state: srcKey, srcKey, record: rec, rings: hit.rings,
      lat: lp[1], lng: lp[0], raw: hit.rawAttrs, exact: hit.exact !== false, limited: false,
    };
  }

  async function lookup(lat, lng, signal) {
    await Geo.loadStates();
    const { inside, near } = Geo.statesAt(lng, lat);
    const cands = [...inside, ...near].filter((s) => SOURCES[s]);
    let fallback = null;
    for (const s of cands) {
      if (!inside.includes(s) && fallback) break;
      try {
        const hit = await Geo.parcelAt(SOURCES[s], lng, lat, signal);
        if (hit && hit.exact) return buildParcel(s, s, hit);
        if (hit && !fallback) fallback = buildParcel(s, s, hit);
      } catch (e) {
        if (signal.aborted) throw e;
        console.warn('source failed', s, e);
        if (inside.includes(s)) fallback = fallback || { error: s };
      }
    }
    if (fallback && !fallback.error) return fallback;
    // No public statewide record here: return a location card with address and county from OpenStreetMap.
    const st = inside[0] || near[0] || null;
    let rg = {};
    try { rg = await Geo.reverseGeocode(lng, lat, signal); } catch (e) { if (signal.aborted) throw e; }
    const abbr = st || Object.keys(STATE_NAMES).find((k) => STATE_NAMES[k] === rg.state) || null;
    return {
      id: `pt:${lat.toFixed(5)},${lng.toFixed(5)}`, state: abbr, srcKey: null, rings: null, lat, lng, limited: true,
      serviceError: fallback && fallback.error ? fallback.error : null,
      record: { siteAddress: rg.street, siteCity: [rg.city, abbr, rg.zip].filter(Boolean).join(', '), county: rg.county, placeName: rg.name },
    };
  }

  const pinIcon = L.divIcon({ className: 'pin', html: icon('pin'), iconSize: [34, 34], iconAnchor: [17, 32] });
  function drawSelection(p, clickLatLng) {
    selLayer.clearLayers();
    if (p && p.rings) {
      const polys = Geo.groupRings(p.rings).map((poly) => poly.map((r) => r.map(([x, y]) => [y, x])));
      L.polygon(polys, { color: '#ffffff', weight: 6, opacity: 0.9, fill: false, interactive: false }).addTo(selLayer);
      L.polygon(polys, { color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e2570f', weight: 3, fillOpacity: 0.12, interactive: false }).addTo(selLayer);
    } else if (clickLatLng) {
      L.marker(clickLatLng, { icon: pinIcon, interactive: false }).addTo(selLayer);
    }
  }

  async function selectAt(latlng, { fly = false, fit = false } = {}) {
    if (map.getZoom() < 15) map.setView(latlng, 17);
    else if (fly) map.panTo(latlng);
    if (reqCtrl) reqCtrl.abort();
    const ctrl = new AbortController(); reqCtrl = ctrl;
    const seq = ++reqSeq;
    selLayer.clearLayers();
    L.marker(latlng, { icon: pinIcon, interactive: false }).addTo(selLayer);
    showSheet(loadingHTML(latlng));
    try {
      const p = await lookup(latlng.lat, latlng.lng, ctrl.signal);
      if (seq !== reqSeq) return;
      const saved = Store.getSaved(p.id);
      openParcel(saved ? { ...p, saved: true, note: saved.note, color: saved.color } : p, { clickLatLng: latlng, fit });
    } catch (e) {
      if (ctrl.signal.aborted || seq !== reqSeq) return;
      console.error(e);
      showSheet(`<div class="p-eyebrow">Lookup failed</div><h2 class="p-owner">Could not reach the parcel service</h2><p class="p-addr">Check your connection and tap the map again.</p>`);
    }
  }

  function openParcel(p, { clickLatLng = null, fit = true } = {}) {
    current = p;
    drawSelection(p, clickLatLng);
    if (fit && p.rings) {
      const [x0, y0, x1, y1] = Geo.bbox(p.rings);
      map.fitBounds([[y0, x0], [y1, x1]], { maxZoom: 19, paddingTopLeft: sheetPad().tl, paddingBottomRight: sheetPad().br });
    } else if (fit) {
      const z = Math.max(map.getZoom(), 17), pad = sheetPad();
      const pt = map.project([p.lat, p.lng], z).add([(pad.tl[0] - pad.br[0]) / -2, (pad.tl[1] - pad.br[1]) / -2]);
      map.setView(map.unproject(pt, z), z);
    }
    renderParcel(p);
    if (!p.limited || p.record.siteAddress) {
      Store.pushRecent({ id: p.id, lat: p.lat, lng: p.lng, title: parcelTitle(p), sub: parcelSub(p), state: p.state });
    }
    history.replaceState(null, '', `#p=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
  }
  function sheetPad() {
    const wide = window.innerWidth >= 820;
    return wide ? { tl: [430, 70], br: [70, 40] } : { tl: [30, 80], br: [30, Math.round(window.innerHeight * 0.48)] };
  }

  const parcelTitle = (p) => titleCase(p.record.owner) || p.record.siteAddress || p.record.placeName || (p.record.parcelId ? `Parcel ${p.record.parcelId}` : 'Dropped pin');
  const parcelSub = (p) => [p.record.owner ? p.record.siteAddress : null, p.record.siteCity || (p.state ? STATE_NAMES[p.state] : null), p.record.acres ? fmtAcres(p.record.acres) : null].filter(Boolean).join(' · ');

  // ---------- sheet ----------
  const sheet = $('#sheet');
  function showSheet(html) {
    $('#sheetBody').innerHTML = html;
    sheet.hidden = false; document.body.classList.add('has-sheet');
    $('#sheetBody').scrollTop = 0;
  }
  function closeSheet() {
    sheet.hidden = true; sheet.classList.remove('expanded'); document.body.classList.remove('has-sheet');
    selLayer.clearLayers(); current = null;
    if (reqCtrl) reqCtrl.abort();
    const c = map.getCenter();
    history.replaceState(null, '', `#@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}z`);
  }
  $('#sheetClose').addEventListener('click', closeSheet);
  const loadingHTML = (ll) => `<div class="p-eyebrow">Looking up parcel…</div><div class="p-owner mono" style="font-size:15px;font-weight:500">${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}</div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:45%"></div><div class="skeleton" style="width:60%"></div>`;

  // drag handle (phones)
  (function () {
    const grab = $('#sheetGrab');
    let y0 = null, moved = false;
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = false; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => { if (y0 !== null && Math.abs(e.clientY - y0) > 6) moved = true; });
    grab.addEventListener('pointerup', (e) => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null;
      if (!moved) { sheet.classList.toggle('expanded'); return; }
      if (dy < -30) sheet.classList.add('expanded');
      else if (dy > 50) { if (sheet.classList.contains('expanded')) sheet.classList.remove('expanded'); else closeSheet(); }
    });
    $('#sheetBody').addEventListener('scroll', (e) => { if (e.target.scrollTop > 20 && window.innerWidth < 820) sheet.classList.add('expanded'); }, { passive: true });
  })();

  function rows(pairs) {
    const r = pairs.filter(([, val]) => val !== null && val !== undefined && val !== '');
    if (!r.length) return '';
    return `<dl class="kv">${r.map(([k, val, cls]) => `<dt>${esc(k)}</dt><dd class="${cls || ''}"${cls && cls.includes('copyable') ? ` data-copy="${esc(val)}"` : ''}>${esc(val)}</dd>`).join('')}</dl>`;
  }
  const section = (title, body) => (body ? `<div class="sec"><h3>${title}</h3>${body}</div>` : '');

  function renderParcel(p) {
    const r = p.record, st = p.state, stName = st ? STATE_NAMES[st] : null, src = p.srcKey ? SOURCES[p.srcKey] : null;
    const saved = Store.getSaved(p.id);
    const place = [countyLabel(r.county) || (r.municipality ? titleCase(r.municipality) : null), stName].filter(Boolean).join(', ');
    const ownerKnown = !!r.owner;
    const title = ownerKnown ? titleCase(r.owner) : r.siteAddress || (p.limited ? 'Location details' : r.parcelId ? `Parcel ${r.parcelId}` : 'Parcel');
    const addrLine = [ownerKnown ? r.siteAddress : null, r.siteCity].filter(Boolean).join(', ');
    const acres = r.acres;
    const stats = [
      acres ? `<span class="stat"><b>${esc(fmtAcres(acres))}</b>${acres < 1 ? ` · ${fmtNum(acres * 43560)} sq ft` : ''}</span>` : '',
      r.totalValue ? `<span class="stat">Value <b>${esc(fmtMoney(r.totalValue))}</b></span>` : '',
      r.landUse ? `<span class="stat">${esc(r.landUse)}</span>` : '',
    ].join('');

    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const assessorQ = encodeURIComponent(`${countyLabel(r.county) || ''} ${stName || ''} ${st === 'FL' ? 'property appraiser' : 'assessor'} parcel search${r.parcelId ? ' ' + r.parcelId : ''}`.trim());
    const ownerNote = !ownerKnown
      ? p.limited
        ? `<div class="note">${p.serviceError ? `The ${esc(STATE_NAMES[p.serviceError])} parcel service did not respond. Try again in a moment, or use the county link below.` : st && SOURCES[st] ? 'No parcel record at this exact spot. It is probably a street, railroad or water. Tap inside a property line.' : `${stName ? esc(stName) + ' does' : 'This area does'} not publish a free statewide parcel file with owner names. The property lines are shown on the map, and the county assessor link below opens the official record.`}</div>`
        : r.note ? `<div class="note">${esc(r.note)}</div>` : src && !src.owner ? `<div class="note">${esc(stName)}’s free statewide parcel file does not include owner names. Use the county link below for the owner of record.</div>` : ''
      : r.note ? `<div class="note">${esc(r.note)}</div>` : '';

    let html = `
      <div class="p-eyebrow">${esc(place || 'Parcel')}</div>
      <h2 class="p-owner${ownerKnown ? '' : ' unknown'}">${esc(title)}</h2>
      ${addrLine ? `<p class="p-addr">${esc(addrLine)}</p>` : '<div style="height:6px"></div>'}
      ${stats ? `<div class="p-stats">${stats}</div>` : ''}
      <div class="p-actions">
        <button class="act primary${saved ? ' saved' : ''}" data-act="save">${icon('star')}${saved ? 'Saved' : 'Save'}</button>
        <a class="act" href="${gmaps}" target="_blank" rel="noopener">${icon('route')}Directions</a>
        <button class="act" data-act="share">${icon('share')}Share</button>
        <button class="act icon-only" data-act="copy" aria-label="Copy parcel details" title="Copy parcel details">${icon('copy')}</button>
      </div>
      ${ownerNote}
      ${saved ? mineHTML(saved) : ''}`;

    html += section('Owner', rows([
      ['Owner', titleCase(r.owner)], ['Additional owner', titleCase(r.owner2)], ['Taxpayer', titleCase(r.taxpayer)],
      ['Mailing address', r.mailing], ['Owner type', r.ownerType],
    ]));
    html += section('Property', rows([
      ['Parcel ID', r.parcelId, 'mono copyable'], ['Alternate ID', r.altId, 'mono'], ['State parcel ID', r.stateParcelId, 'mono'], ['Account', r.account, 'mono'],
      ['Site address', [r.siteAddress, r.siteCity].filter(Boolean).join(', ') || null], ['County', countyLabel(r.county)],
      ['Deeded / listed acres', r.acres && Math.abs(r.acres - (r.gisAcres || 0)) > 0.005 ? fmtAcres(r.acres) : null],
      ['Mapped (GIS) area', r.gisAcres ? `${fmtAcres(r.gisAcres)} · ${fmtNum(r.gisAcres * 43560)} sq ft` : null],
      ['Land use', r.landUse], ['Zoning', r.zoning], ['Subdivision', r.subdivision], ['Legal description', r.legal],
      ['Section / Twp / Range', r.plss], ['Parcel type', r.parcelType], ['Homestead', r.homestead], ['School district', r.schoolDistrict],
      ['Township', r.township], ['Utilities', r.utilities], ['Place', p.limited ? r.placeName : null],
    ]));
    html += section('Value', rows([
      ['Land value', fmtMoney(r.landValue)], ['Improvement value', fmtMoney(r.improvementValue)], ['Market value', fmtMoney(r.totalValue)],
      ['Assessed value', fmtMoney(r.assessedValue)], ['Taxable value', fmtMoney(r.taxableValue)], ['Annual tax', fmtMoney(r.annualTax)],
      ['Valuation year', r.valuationYear],
    ]));
    html += section('Building', rows([
      ['Year built', r.yearBuilt], ['Living area', r.livingArea ? `${fmtNum(r.livingArea)} sq ft` : null], ['Bedrooms', r.bedrooms], ['Bathrooms', r.baths],
      ['Units', r.units], ['Stories', r.stories], ['Buildings', r.buildings], ['Building', r.building],
    ]));
    html += section('Last sale', rows([['Sale date', r.saleDate], ['Sale price', fmtMoney(r.salePrice)], ['Deed reference', r.deed]]));
    html += section('Location', rows([['Coordinates', `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`, 'mono copyable'], ['Data source', r.source]]));

    const links = [
      r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${icon('link')}Official county record</a>` : '',
      `<a href="https://www.google.com/search?q=${assessorQ}" target="_blank" rel="noopener">${icon('search')}Find the ${st === 'FL' ? 'property appraiser' : 'county assessor'} record</a>`,
      `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat.toFixed(6)},${p.lng.toFixed(6)}" target="_blank" rel="noopener">${icon('map')}Street View</a>`,
      `<a href="https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}" target="_blank" rel="noopener">${icon('pin')}Open in Google Maps</a>`,
    ].join('');
    html += section('Links', `<div class="links">${links}</div>`);

    if (p.raw) {
      const entries = Object.entries(p.raw).filter(([k, val]) => val !== null && val !== '' && String(val).trim() !== '' && !/^(shape|st_area|st_perimeter|globalid|shape__)/i.test(k));
      html += `<details class="raw"><summary>All ${entries.length} fields from the state file</summary><div class="raw-wrap"><table class="raw-table">${entries.map(([k, val]) => `<tr><td>${esc(k)}</td><td>${esc(val)}</td></tr>`).join('')}</table></div></details>`;
    }
    html += `<div class="src">${src ? `Source: ${esc(src.name)}. ` : 'Address from OpenStreetMap. '}Lines © Regrid. Records are as published by public agencies and can be out of date; confirm with the county before you rely on them.</div>`;
    showSheet(html);
    if (saved) loadPhotos(p.id);
  }

  function mineHTML(s) {
    return `<div class="mine" id="mine">
      <textarea id="noteInput" placeholder="Add a note (gate code, contact, survey pins…)">${esc(s.note || '')}</textarea>
      <div class="swatches"><span>Color</span>${SAVE_COLORS.map((c) => `<button class="sw${(s.color || SAVE_COLORS[0]) === c ? ' on' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
      <div class="photos" id="photos"><button class="add-photo" data-act="photo">${icon('camera')}Add photo</button></div>
    </div>`;
  }

  async function loadPhotos(id) {
    const box = $('#photos'); if (!box) return;
    let list = [];
    try { list = await Store.photos.list(id); } catch { return; }
    if (!current || current.id !== id) return;
    $$('.photo', box).forEach((el) => { URL.revokeObjectURL(el.querySelector('img').src); el.remove(); });
    const add = box.querySelector('.add-photo');
    for (const ph of list) {
      const d = document.createElement('div');
      d.className = 'photo';
      d.innerHTML = `<img alt="Parcel photo" src="${URL.createObjectURL(ph.blob)}"><button data-del="${ph.id}" aria-label="Delete photo">${icon('x')}</button>`;
      box.insertBefore(d, add);
    }
  }

  function savePayload(p) {
    const round = (rings) => rings.map((r) => r.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]));
    return { id: p.id, state: p.state, srcKey: p.srcKey, record: p.record, rings: p.rings ? round(p.rings) : null, lat: p.lat, lng: p.lng, limited: p.limited };
  }

  let removeArm = 0;
  $('#sheetBody').addEventListener('click', async (e) => {
    const p = current; if (!p) return;
    const copyEl = e.target.closest('[data-copy]');
    if (copyEl) return copyText(copyEl.dataset.copy);
    const del = e.target.closest('[data-del]');
    if (del) { await Store.photos.remove(del.dataset.del); loadPhotos(p.id); return; }
    const img = e.target.closest('.photo img');
    if (img) { $('#viewerImg').src = img.src; $('#viewer').hidden = false; return; }
    const sw = e.target.closest('[data-color]');
    if (sw) {
      Store.upsertSaved({ id: p.id, color: sw.dataset.color });
      $$('.sw').forEach((b) => b.classList.toggle('on', b === sw));
      drawSaved(); return;
    }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'save') {
      if (Store.getSaved(p.id)) {
        if (Date.now() - removeArm > 3000) { removeArm = Date.now(); act.innerHTML = `${icon('trash')}Tap again to remove`; return; }
        removeArm = 0;
        Store.removeSaved(p.id);
        try { await Store.photos.removeAll(p.id); } catch {}
        toast('Removed from saved');
      } else {
        const ok = Store.upsertSaved({ ...savePayload(p), note: '', color: SAVE_COLORS[0], savedAt: Date.now() });
        toast(ok ? 'Saved to this device' : 'Storage is full or blocked in this browser');
      }
      drawSaved(); renderParcel(p); if (drawerTab === 'saved') renderDrawer();
    } else if (a === 'share') {
      const url = `${location.origin}${location.pathname}#p=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
      const text = `${parcelTitle(p)}${p.record.siteAddress && p.record.owner ? ' – ' + p.record.siteAddress : ''}`;
      if (navigator.share) { try { await navigator.share({ title: 'Parcel', text, url }); } catch {} }
      else copyText(url, 'Link copied');
    } else if (a === 'copy') {
      const r = p.record;
      const lines = [
        r.owner && `Owner: ${r.owner}`, r.owner2 && `Owner 2: ${r.owner2}`, r.mailing && `Mailing: ${r.mailing}`,
        (r.siteAddress || r.siteCity) && `Address: ${[r.siteAddress, r.siteCity].filter(Boolean).join(', ')}`,
        r.parcelId && `Parcel ID: ${r.parcelId}`, r.county && `County: ${countyLabel(r.county)}${p.state ? ', ' + p.state : ''}`,
        r.acres && `Acres: ${r.acres.toFixed(2)}`, r.totalValue && `Value: ${fmtMoney(r.totalValue)}`, `Location: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`,
      ].filter(Boolean);
      copyText(lines.join('\n'), 'Parcel details copied');
    } else if (a === 'photo') {
      $('#photoInput').click();
    }
  });
  let noteT;
  $('#sheetBody').addEventListener('input', (e) => {
    if (e.target.id !== 'noteInput' || !current) return;
    const id = current.id, val = e.target.value;
    clearTimeout(noteT); noteT = setTimeout(() => { Store.upsertSaved({ id, note: val }); if (drawerTab === 'saved') renderDrawer(); }, 400);
  });
  $('#photoInput').addEventListener('change', async (e) => {
    const p = current; const files = [...e.target.files]; e.target.value = '';
    if (!p || !files.length) return;
    try {
      for (const f of files) await Store.photos.add(p.id, await Store.compressImage(f));
      loadPhotos(p.id); toast(files.length > 1 ? `${files.length} photos added` : 'Photo added');
    } catch (err) { toast('Could not store the photo on this device'); }
  });
  $('#viewerClose').addEventListener('click', () => { $('#viewer').hidden = true; });
  $('#viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') $('#viewer').hidden = true; });

  // ---------- saved layer ----------
  function drawSaved() {
    savedLayer.clearLayers();
    for (const s of Store.saved()) {
      if (!s.rings) {
        L.circleMarker([s.lat, s.lng], { radius: 7, color: '#fff', weight: 2, fillColor: s.color || SAVE_COLORS[0], fillOpacity: 1 })
          .on('click', (ev) => { L.DomEvent.stopPropagation(ev); if (measuring) return addVertex(ev.latlng); openSaved(s.id); }).addTo(savedLayer);
        continue;
      }
      const polys = Geo.groupRings(s.rings).map((poly) => poly.map((r) => r.map(([x, y]) => [y, x])));
      L.polygon(polys, { color: s.color || SAVE_COLORS[0], weight: 2.5, fillOpacity: 0.2 })
        .on('click', (ev) => { L.DomEvent.stopPropagation(ev); if (measuring) return addVertex(ev.latlng); openSaved(s.id); })
        .addTo(savedLayer);
    }
  }
  function openSaved(id, fit = true) {
    const s = Store.getSaved(id); if (!s) return;
    closeDrawer();
    openParcel({ ...s, saved: true }, { fit });
  }
  drawSaved();

  // ---------- map interactions ----------
  map.on('click', (e) => {
    if (measuring) return addVertex(e.latlng);
    $('#layersPanel').hidden = true; hideSuggest();
    selectAt(e.latlng);
  });
  map.on('contextmenu', (e) => { if (!measuring) selectAt(e.latlng); });

  // ---------- layers panel ----------
  $('#layersBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#layersPanel').hidden = !$('#layersPanel').hidden; });
  document.addEventListener('click', (e) => {
    if (!$('#layersPanel').hidden && !e.target.closest('#layersPanel') && !e.target.closest('#layersBtn')) $('#layersPanel').hidden = true;
    if (!e.target.closest('.topbar') && !e.target.closest('#suggest')) hideSuggest();
  });

  // ---------- search ----------
  const input = $('#searchInput');
  let sgItems = [], sgActive = -1, sgT, sgCtrl;
  function hideSuggest() { $('#suggest').hidden = true; sgActive = -1; }
  function stateAtCenter() {
    const c = map.getCenter();
    const { inside } = Geo.statesAt(c.lng, c.lat);
    return inside[0] || null;
  }
  function renderSuggest(geo, pending) {
    const q = input.value.trim();
    const items = [];
    const m = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (m) items.push({ kind: 'coord', icon: 'pin', t: `Go to ${(+m[1]).toFixed(6)}, ${(+m[2]).toFixed(6)}`, s: 'Latitude, longitude', lat: +m[1], lng: +m[2] });
    const st = stateAtCenter(), src = st && SOURCES[st];
    if (q.length >= 2 && !m) {
      if (src && src.ownerField && /[a-z]/i.test(q)) items.push({ kind: 'owner', icon: 'search', t: `Owners named “${q}”`, s: map.getZoom() >= 9 ? `In the visible map area · ${STATE_NAMES[st]}` : 'Zoom in to a county first', st });
      if (src && src.idField && /\d/.test(q)) items.push({ kind: 'pid', icon: 'search', t: `Parcel ID “${q}”`, s: `Anywhere in ${STATE_NAMES[st]}`, st });
    }
    for (const g of geo) items.push({ kind: 'geo', icon: g.isAddress ? 'pin' : 'map', t: g.title, s: g.sub, g });
    sgItems = items; sgActive = -1;
    const box = $('#suggest');
    if (!items.length && !pending) { box.innerHTML = q.length >= 3 ? '<div class="sg-note">No matches. Try a full street address with city and state.</div>' : ''; box.hidden = q.length < 3; return; }
    box.innerHTML = items.map((it, i) => `<button class="sg-item" data-i="${i}" role="option">${icon(it.icon)}<div><div class="t">${esc(it.t)}</div>${it.s ? `<div class="s">${esc(it.s)}</div>` : ''}</div></button>`).join('') + (pending ? '<div class="sg-note">Searching addresses…</div>' : '');
    box.hidden = false;
  }
  input.addEventListener('input', () => {
    const q = input.value.trim();
    $('#searchClear').hidden = !q;
    clearTimeout(sgT); if (sgCtrl) sgCtrl.abort();
    if (!q) return hideSuggest();
    Geo.loadStates().then(() => { if (input.value.trim() === q) renderSuggest([], q.length >= 3); });
    if (q.length < 3) return;
    sgT = setTimeout(async () => {
      const ctrl = new AbortController(); sgCtrl = ctrl;
      const c = map.getCenter();
      try { const g = await Geo.geocode(q, [c.lng, c.lat], ctrl.signal); if (!ctrl.signal.aborted && sgCtrl === ctrl) renderSuggest(g, false); }
      catch (e) { if (!ctrl.signal.aborted && sgCtrl === ctrl) renderSuggest([], false); }
    }, 280);
  });
  input.addEventListener('focus', () => { if (input.value.trim() && sgItems.length) $('#suggest').hidden = false; });
  input.addEventListener('keydown', (e) => {
    if ($('#suggest').hidden || !sgItems.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sgActive = (sgActive + (e.key === 'ArrowDown' ? 1 : -1) + sgItems.length) % sgItems.length;
      $$('.sg-item').forEach((el, i) => el.classList.toggle('active', i === sgActive));
    } else if (e.key === 'Escape') hideSuggest();
  });
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!sgItems.length) return;
    const pick = sgActive >= 0 ? sgItems[sgActive] : sgItems.find((x) => x.kind === 'coord') || sgItems.find((x) => x.kind === 'geo') || sgItems[0];
    choose(pick);
  });
  $('#suggest').addEventListener('click', (e) => { const b = e.target.closest('.sg-item'); if (b) choose(sgItems[+b.dataset.i]); });
  $('#searchClear').addEventListener('click', () => { input.value = ''; $('#searchClear').hidden = true; hideSuggest(); resultsLayer.clearLayers(); input.focus(); });

  function choose(it) {
    clearTimeout(sgT); if (sgCtrl) sgCtrl.abort(); sgCtrl = null;
    hideSuggest(); input.blur();
    if (it.kind === 'coord') { map.setView([it.lat, it.lng], 18); selectAt(L.latLng(it.lat, it.lng), { fit: true }); }
    else if (it.kind === 'geo') {
      const g = it.g;
      if (g.isAddress) { map.setView([g.lat, g.lng], 18); selectAt(L.latLng(g.lat, g.lng), { fit: true }); }
      else if (g.extent) map.fitBounds([[g.extent[3], g.extent[0]], [g.extent[1], g.extent[2]]], { maxZoom: 17 });
      else map.setView([g.lat, g.lng], 15);
    } else if (it.kind === 'owner') runOwnerSearch(it.st, input.value.trim());
    else if (it.kind === 'pid') runPidSearch(it.st, input.value.trim());
  }

  let lastResults = { title: '', items: [] };
  async function runOwnerSearch(st, q) {
    if (map.getZoom() < 9) return toast('Zoom in to a county or town, then search owners');
    const b = map.getBounds();
    toast(`Searching owners in view…`, 8000);
    try {
      const hits = await Geo.searchOwner(SOURCES[st], q, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      showResults(`Owners matching “${q}”`, hits.map((h) => buildParcel(st, st, h)));
    } catch (e) { console.error(e); toast('Owner search failed. Zoom in further and try again.'); }
  }
  async function runPidSearch(st, q) {
    toast(`Searching ${STATE_NAMES[st]} parcel IDs…`, 12000);
    try {
      const hits = await Geo.searchParcelId(SOURCES[st], q);
      showResults(`Parcel ID “${q}”`, hits.map((h) => buildParcel(st, st, h)));
    } catch (e) { console.error(e); toast('Parcel ID search failed. Check the ID format and try again.'); }
  }
  function showResults(title, items) {
    // de-duplicate (condo stacks often repeat one polygon)
    const seen = new Set(); items = items.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
    lastResults = { title, items };
    resultsLayer.clearLayers();
    if (!items.length) { toast('No matching parcels found'); return; }
    toast(`${items.length}${items.length >= 60 ? '+' : ''} parcel${items.length === 1 ? '' : 's'} found`);
    const all = [];
    for (const p of items) {
      const polys = Geo.groupRings(p.rings).map((poly) => poly.map((r) => r.map(([x, y]) => [y, x])));
      L.polygon(polys, { color: '#1c7ed6', weight: 2, fillOpacity: 0.15 }).on('click', (ev) => { L.DomEvent.stopPropagation(ev); if (measuring) return addVertex(ev.latlng); openParcel(p, { fit: false }); }).addTo(resultsLayer);
      const [x0, y0, x1, y1] = Geo.bbox(p.rings);
      all.push([y0, x0], [y1, x1]);
    }
    if (items.length === 1) { openParcel(items[0]); return; }
    map.fitBounds(all, { maxZoom: 18, padding: [40, 40] });
    openDrawer('results');
  }

  // ---------- drawer ----------
  let drawerTab = 'saved';
  function openDrawer(tab) {
    if (tab) drawerTab = tab;
    $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false;
    renderDrawer();
  }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; }
  $('#menuBtn').addEventListener('click', () => openDrawer());
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { drawerTab = b.dataset.tab; renderDrawer(); } });

  function listItem(attrs, dotColor, title, sub) {
    return `<button class="list-item" ${attrs}>${dotColor ? `<span class="dot" style="background:${dotColor}"></span>` : `<svg class="chev" style="transform:none">${'<use href="#i-clock"/>'}</svg>`}<div><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div><svg class="chev"><use href="#i-chev"/></svg></button>`;
  }
  function renderDrawer() {
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === drawerTab));
    const body = $('#drawerBody');
    if (drawerTab === 'saved') {
      const list = Store.saved();
      body.innerHTML = list.length
        ? `<div class="bar"><button class="chip-btn" data-export="csv">${icon('down')}CSV</button><button class="chip-btn" data-export="kml">${icon('down')}KML</button><button class="chip-btn" data-export="geojson">${icon('down')}GeoJSON</button></div>` +
          list.map((s) => listItem(`data-saved="${esc(s.id)}"`, s.color || SAVE_COLORS[0], parcelTitle(s), [parcelSub(s), s.note ? `“${s.note.slice(0, 40)}”` : null].filter(Boolean).join(' · '))).join('')
        : `<div class="empty"><b>No saved parcels yet</b>Tap a parcel on the map, then Save. Saved parcels stay on this device, with notes, colors and photos.</div>`;
    } else if (drawerTab === 'recent') {
      const list = Store.recent();
      body.innerHTML = list.length
        ? `<div class="bar"><button class="chip-btn" data-clear-recent>Clear history</button></div>` + list.map((r) => listItem(`data-recent="${r.lat},${r.lng}"`, null, r.title, r.sub)).join('')
        : `<div class="empty"><b>Nothing viewed yet</b>Parcels you open show up here.</div>`;
    } else if (drawerTab === 'results') {
      body.innerHTML = lastResults.items.length
        ? `<p class="s" style="color:var(--muted);margin:10px 0 0">${esc(lastResults.title)} · ${lastResults.items.length}</p>` + lastResults.items.map((p, i) => listItem(`data-result="${i}"`, '#1c7ed6', parcelTitle(p), parcelSub(p))).join('')
        : `<div class="empty"><b>No search results</b>Search an owner name or a parcel ID from the search bar. Owner search looks inside the visible map area.</div>`;
    } else if (drawerTab === 'coverage') {
      const keys = Object.keys(SOURCES).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
      const full = keys.filter((k) => SOURCES[k].owner).length;
      body.innerHTML = `<div class="prose"><p><b>Property lines: all 50 states.</b> Boundaries for every county come from Regrid’s free nationwide parcel layer.</p>
        <p><b>Owner and parcel details: ${full} states.</b> These come straight from free statewide parcel files that state agencies publish. ${keys.length - full} more states publish parcel IDs, addresses or values without owner names.</p>
        <p class="muted">Everywhere else, tapping a parcel shows its address and county, with a link to the county assessor’s record.</p></div>
        <div class="cov-grid">${keys.map((k) => `<div class="cov"><span class="ab">${k}</span><span>${STATE_NAMES[k]}</span><span class="pill ${SOURCES[k].owner ? 'full' : 'part'}">${SOURCES[k].owner ? 'Owner + details' : 'Parcel details'}</span></div>`).join('')}</div>`;
    } else if (drawerTab === 'about') {
      body.innerHTML = `<div class="prose">
        <p><b>Tract</b> is a free property line map. Tap any parcel to see who owns it, its size, value and last sale, where the state publishes that data. There are no accounts, no ads and no paid tier.</p>
        <h4>Install it on your phone</h4>
        <p><b>iPhone:</b> open this page in Safari, tap Share, then <i>Add to Home Screen</i>.<br><b>Android:</b> open it in Chrome, tap the ⋮ menu, then <i>Install app</i>.</p>
        <h4>Your data</h4>
        <p>Saved parcels, notes and photos stay in this browser on this device. Nothing is uploaded. Export your saved parcels as CSV, KML (Google Earth) or GeoJSON from the Saved tab.</p>
        <h4>Search tips</h4>
        <ul><li>Type an address and pick it from the list.</li><li>Type an owner name to find their parcels in the area you are looking at.</li><li>Type a parcel ID to search the whole state.</li><li>Paste coordinates like <span class="mono">35.7796, -78.6382</span>.</li></ul>
        <h4>Sources</h4>
        <p class="muted">Parcel lines © Regrid. Parcel records from state GIS offices (see Coverage). Imagery © Esri and partners. Street and terrain maps © Esri and partners, including OpenStreetMap contributors. Topo from USGS. Address search by Photon and Nominatim using OpenStreetMap data.</p>
        <p class="muted">Public records can be outdated or wrong. Parcel lines are approximate and are not a survey. Do not use this map to locate property corners or settle boundary disputes.</p>
      </div>`;
    }
  }
  $('#drawerBody').addEventListener('click', (e) => {
    const s = e.target.closest('[data-saved]'); if (s) return openSaved(s.dataset.saved);
    const r = e.target.closest('[data-recent]');
    if (r) { const [lat, lng] = r.dataset.recent.split(',').map(Number); closeDrawer(); map.setView([lat, lng], 18); return selectAt(L.latLng(lat, lng), { fit: true }); }
    const rs = e.target.closest('[data-result]'); if (rs) { closeDrawer(); return openParcel(lastResults.items[+rs.dataset.result]); }
    if (e.target.closest('[data-clear-recent]')) { Store.clearRecent(); return renderDrawer(); }
    const ex = e.target.closest('[data-export]'); if (ex) exportSaved(ex.dataset.export);
  });

  // ---------- export ----------
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportSaved(kind) {
    const list = Store.saved(); const day = new Date().toISOString().slice(0, 10);
    const props = (s) => {
      const r = s.record || {};
      return {
        name: parcelTitle(s), owner: r.owner || '', owner2: r.owner2 || '', mailing: r.mailing || '', address: [r.siteAddress, r.siteCity].filter(Boolean).join(', '),
        parcel_id: r.parcelId || '', county: r.county || '', state: s.state || '', acres: r.acres ? +r.acres.toFixed(3) : '', market_value: r.totalValue || '',
        land_use: r.landUse || '', latitude: +s.lat.toFixed(6), longitude: +s.lng.toFixed(6), note: s.note || '', color: s.color || '',
        saved: s.savedAt ? new Date(s.savedAt).toISOString() : '',
      };
    };
    if (kind === 'csv') {
      const rowsArr = list.map(props); const cols = Object.keys(rowsArr[0] || props({ record: {}, lat: 0, lng: 0 }));
      const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
      download(`tract-saved-${day}.csv`, [cols.join(','), ...rowsArr.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n'), 'text/csv');
    } else if (kind === 'geojson') {
      const fc = { type: 'FeatureCollection', features: list.map((s) => ({ type: 'Feature', properties: props(s),
        geometry: s.rings ? { type: 'MultiPolygon', coordinates: Geo.groupRings(s.rings).map((poly) => poly.map((r) => (Geo.signedArea(r) < 0 ? [...r].reverse() : r))) } : { type: 'Point', coordinates: [s.lng, s.lat] } })) };
      download(`tract-saved-${day}.geojson`, JSON.stringify(fc, null, 1), 'application/geo+json');
    } else {
      const x = (t) => String(t ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const kc = (hex) => { const h = (hex || '#e2570f').slice(1); return `${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`; };
      const pm = list.map((s) => {
        const pr = props(s);
        const desc = Object.entries(pr).filter(([k, val]) => val !== '' && !['name', 'color'].includes(k)).map(([k, val]) => `${k}: ${val}`).join('\n');
        const geom = s.rings
          ? `<MultiGeometry>${Geo.groupRings(s.rings).map((poly) => `<Polygon>${poly.map((r, i) => `<${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}><LinearRing><coordinates>${r.map(([a, b]) => `${a},${b},0`).join(' ')}</coordinates></LinearRing></${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}>`).join('')}</Polygon>`).join('')}<Point><coordinates>${s.lng},${s.lat},0</coordinates></Point></MultiGeometry>`
          : `<Point><coordinates>${s.lng},${s.lat},0</coordinates></Point>`;
        return `<Placemark><name>${x(pr.name)}</name><description>${x(desc)}</description><Style><LineStyle><color>ff${kc(s.color)}</color><width>3</width></LineStyle><PolyStyle><color>40${kc(s.color)}</color></PolyStyle></Style>${geom}</Placemark>`;
      }).join('');
      download(`tract-saved-${day}.kml`, `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Tract saved parcels</name>${pm}</Document></kml>`, 'application/vnd.google-earth.kml+xml');
    }
  }

  // ---------- measure ----------
  let measuring = false, mMode = 'distance', mPts = [];
  const mLayer = L.layerGroup().addTo(map);
  const vIcon = L.divIcon({ className: '', html: '<div class="vertex"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
  function setMeasuring(on) {
    measuring = on;
    $('#measureBar').hidden = !on; $('#measureBtn').classList.toggle('on', on);
    $('#map').style.cursor = on ? 'crosshair' : '';
    if (on) { closeSheet(); toast('Tap the map to add points'); }
    else { mPts = []; mLayer.clearLayers(); }
    drawMeasure();
  }
  function addVertex(ll) { mPts.push(ll); drawMeasure(); }
  function drawMeasure() {
    mLayer.clearLayers();
    const val = $('#measureVal');
    if (!mPts.length) { val.textContent = mMode === 'area' ? 'Tap at least 3 points' : 'Tap the map to start'; return; }
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    let total = 0;
    for (let i = 1; i < mPts.length; i++) total += Geo.haversine([mPts[i - 1].lng, mPts[i - 1].lat], [mPts[i].lng, mPts[i].lat]);
    if (mMode === 'area' && mPts.length >= 3) {
      L.polygon(mPts, { color: accent, weight: 3, dashArray: '6 6', fillOpacity: 0.15, interactive: false }).addTo(mLayer);
      const ring = mPts.map((p) => [p.lng, p.lat]);
      const per = total + Geo.haversine(ring[ring.length - 1], ring[0]);
      val.textContent = `${fmtArea(Geo.ringArea(ring))} · perimeter ${fmtFeet(per)}`;
    } else {
      L.polyline(mPts, { color: accent, weight: 3, dashArray: '6 6', interactive: false }).addTo(mLayer);
      val.textContent = mPts.length < 2 ? 'Tap the next point' : mMode === 'area' ? 'Tap one more point' : fmtFeet(total);
    }
    if (mMode === 'distance') {
      for (let i = 1; i < mPts.length; i++) {
        const a = mPts[i - 1], b = mPts[i];
        L.tooltip({ permanent: true, direction: 'center', className: 'measure-label' }).setLatLng([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2])
          .setContent(fmtFeet(Geo.haversine([a.lng, a.lat], [b.lng, b.lat]))).addTo(mLayer);
      }
    }
    mPts.forEach((p, i) => {
      L.marker(p, { icon: vIcon, draggable: true, keyboard: false }).on('drag', (e) => { mPts[i] = e.target.getLatLng(); redrawSoon(); }).addTo(mLayer);
    });
  }
  let rT; const redrawSoon = () => { cancelAnimationFrame(rT); rT = requestAnimationFrame(() => { const keep = measuring; if (keep) drawMeasureShapesOnly(); }); };
  function drawMeasureShapesOnly() {
    // during a drag only refresh the readout and shapes, not the markers being dragged
    mLayer.eachLayer((l) => { if (!(l instanceof L.Marker)) mLayer.removeLayer(l); });
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    let total = 0;
    for (let i = 1; i < mPts.length; i++) total += Geo.haversine([mPts[i - 1].lng, mPts[i - 1].lat], [mPts[i].lng, mPts[i].lat]);
    if (mMode === 'area' && mPts.length >= 3) {
      L.polygon(mPts, { color: accent, weight: 3, dashArray: '6 6', fillOpacity: 0.15, interactive: false }).addTo(mLayer);
      const ring = mPts.map((p) => [p.lng, p.lat]);
      $('#measureVal').textContent = `${fmtArea(Geo.ringArea(ring))} · perimeter ${fmtFeet(total + Geo.haversine(ring[ring.length - 1], ring[0]))}`;
    } else {
      L.polyline(mPts, { color: accent, weight: 3, dashArray: '6 6', interactive: false }).addTo(mLayer);
      $('#measureVal').textContent = fmtFeet(total);
    }
  }
  $('#measureBtn').addEventListener('click', () => setMeasuring(!measuring));
  $('#measureDone').addEventListener('click', () => setMeasuring(false));
  $('#measureClear').addEventListener('click', () => { mPts = []; drawMeasure(); });
  $('#measureUndo').addEventListener('click', () => { mPts.pop(); drawMeasure(); });
  $('.mb-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    mMode = b.dataset.mode; $$('.mb-seg button').forEach((x) => x.classList.toggle('on', x === b)); drawMeasure();
  });

  // ---------- location ----------
  let watchId = null, follow = false, meMarker = null, meCircle = null, firstFix = false;
  const meIcon = L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  function setLocBtn() {
    const b = $('#locateBtn');
    b.classList.toggle('on', watchId !== null && follow);
    b.classList.toggle('follow', watchId !== null && !follow);
  }
  function stopLocate() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null; follow = false;
    if (meMarker) { map.removeLayer(meMarker); map.removeLayer(meCircle); meMarker = meCircle = null; }
    setLocBtn();
  }
  $('#locateBtn').addEventListener('click', () => {
    if (!('geolocation' in navigator)) return toast('This browser cannot share your location');
    if (watchId !== null && follow) return stopLocate();
    if (watchId !== null && !follow) { follow = true; setLocBtn(); if (meMarker) { map.setView(meMarker.getLatLng(), Math.max(map.getZoom(), 17)); selectAt(meMarker.getLatLng()); } return; }
    follow = true; firstFix = true; setLocBtn();
    toast('Finding your location…');
    watchId = navigator.geolocation.watchPosition((pos) => {
      const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      if (!meMarker) {
        meCircle = L.circle(ll, { radius: pos.coords.accuracy, color: '#2a7fff', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
        meMarker = L.marker(ll, { icon: meIcon, interactive: false, zIndexOffset: 1000 }).addTo(map);
      } else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(pos.coords.accuracy); }
      if (firstFix) { firstFix = false; map.setView(ll, 18); selectAt(ll, { fit: true }); }
      else if (follow) map.panTo(ll, { animate: true });
    }, (err) => {
      toast(err.code === 1 ? 'Location is blocked. Allow location for this site in your browser settings.' : 'Could not get your location. Try again outdoors.', 4500);
      stopLocate();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  });
  map.on('dragstart', () => { if (follow && watchId !== null) { follow = false; setLocBtn(); } });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#viewer').hidden) $('#viewer').hidden = true;
    else if ($('#drawer').classList.contains('open')) closeDrawer();
    else if (measuring) setMeasuring(false);
    else if (!sheet.hidden) closeSheet();
  });

  // ---------- boot ----------
  Geo.loadStates().catch(() => {});
  if (start.select) selectAt(L.latLng(start.select[0], start.select[1]), { fit: true });
  window.addEventListener('hashchange', () => { const h = parseHash(); if (h.select) { map.setView(h.select, 18); selectAt(L.latLng(h.select[0], h.select[1]), { fit: true }); } });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
