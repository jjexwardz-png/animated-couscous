/* Nationwide public records for a parcel, from free federal services.
 * Each loader takes the parcel ({lat, lng, rings}) and returns rows [[label, value], ...] or null.
 */
(function () {
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  async function req(url, { body, json, timeout = 25000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const opt = { signal: ctrl.signal };
      if (json) { opt.method = 'POST'; opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(json); }
      else if (body) { opt.method = 'POST'; opt.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; opt.body = qs(body); }
      const r = await fetch(url, opt);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j && j.error) throw new Error(j.error.message || 'service error');
      return j;
    } finally { clearTimeout(t); }
  }

  // Parcel outline as one simplified ring (largest polygon), so requests stay small.
  function aoiRing(p) {
    if (!p.rings) {
      const d = 0.00015; // ~15 m box around a dropped pin
      return [[p.lng - d, p.lat - d], [p.lng + d, p.lat - d], [p.lng + d, p.lat + d], [p.lng - d, p.lat + d], [p.lng - d, p.lat - d]];
    }
    const polys = Geo.groupRings(p.rings);
    let best = polys[0][0];
    for (const poly of polys) if (Geo.ringArea(poly[0]) > Geo.ringArea(best)) best = poly[0];
    let ring = best;
    if (ring.length > 250) { const step = Math.ceil(ring.length / 250); ring = ring.filter((_, i) => i % step === 0); }
    ring = ring.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);
    const f = ring[0], l = ring[ring.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f);
    return ring;
  }
  const esriPoly = (ring) => JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } });
  // GET when the URL stays short (some servers send CORS headers only on GET), POST otherwise.
  async function polyQuery(url, ring, outFields) {
    if (ring.length > 120) { const step = Math.ceil(ring.length / 120); ring = ring.filter((_, i) => i % step === 0).concat([ring[0]]); }
    const params = { f: 'json', geometry: esriPoly(ring), geometryType: 'esriGeometryPolygon', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: false };
    const getUrl = `${url}/query?${qs(params)}`;
    const j = getUrl.length < 7500 ? await req(getUrl) : await req(`${url}/query`, { body: params });
    return (j.features || []).map((f) => f.attributes);
  }
  async function pointQuery(url, p, outFields) {
    const j = await req(`${url}/query?${qs({ f: 'json', geometry: `${p.lng},${p.lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: false })}`);
    return (j.features || []).map((f) => f.attributes);
  }
  const money = (n) => (n == null || n < 0 ? null : '$' + Math.round(n).toLocaleString('en-US'));
  const num = (n) => (n == null || n < 0 ? null : Math.round(n).toLocaleString('en-US'));
  const pct = (n) => (n == null || n < 0 ? null : `${(+n).toFixed(n < 10 ? 1 : 0)}%`);
  const date = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

  const FLOOD_ZONE_TEXT = {
    A: '100-year floodplain (no base elevation)', AE: '100-year floodplain', AH: '100-year floodplain, ponding', AO: '100-year floodplain, sheet flow',
    AR: 'Temporarily increased flood risk', A99: '100-year floodplain, levee under construction', V: 'Coastal high hazard', VE: 'Coastal high hazard (wave action)',
    X: 'Outside the 100-year floodplain', D: 'Undetermined risk', 'OPEN WATER': 'Open water', 'AREA NOT INCLUDED': 'Not mapped by FEMA',
  };

  const LOADERS = [
    {
      key: 'flood', title: 'Flood (FEMA)',
      async run(p, ring) {
        const NFHL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
        const [zones, panels, here] = await Promise.all([
          polyQuery(`${NFHL}/28`, ring, 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DEPTH'),
          pointQuery(`${NFHL}/3`, p, 'FIRM_PAN,EFF_DATE,PANEL_TYP'),
          pointQuery(`${NFHL}/28`, p, 'FLD_ZONE,ZONE_SUBTY'),
        ]);
        if (!zones.length && !panels.length) return [['Flood map', 'No digital FEMA flood map for this area']];
        const seen = new Map();
        for (const z of zones) {
          const k = `${z.FLD_ZONE}|${z.ZONE_SUBTY || ''}`;
          if (!seen.has(k)) seen.set(k, z);
        }
        const list = [...seen.values()];
        const sfha = list.some((z) => z.SFHA_TF === 'T');
        const bfe = list.map((z) => z.STATIC_BFE).filter((b) => b && b > -9000);
        const zoneText = (z) => `Zone ${z.FLD_ZONE}${FLOOD_ZONE_TEXT[z.FLD_ZONE] ? ' – ' + FLOOD_ZONE_TEXT[z.FLD_ZONE] : ''}${z.ZONE_SUBTY && !/MINIMAL FLOOD HAZARD/i.test(z.ZONE_SUBTY) ? ` (${z.ZONE_SUBTY.toLowerCase()})` : ''}`;
        return [
          ['In 100-year floodplain', sfha ? 'Yes – part or all of the parcel (flood insurance usually required with a federal mortgage)' : 'No'],
          ['Zone at center', here[0] ? zoneText(here[0]) : null],
          ['Zones on parcel', list.length ? list.map(zoneText).join('; ') : null],
          ['Base flood elevation', bfe.length ? `${Math.min(...bfe)}${Math.max(...bfe) !== Math.min(...bfe) ? '–' + Math.max(...bfe) : ''} ft` : null],
          ['FIRM panel', panels[0] ? `${panels[0].FIRM_PAN}${panels[0].EFF_DATE ? ', effective ' + date(panels[0].EFF_DATE) : ''}` : null],
          ['__link', `https://msc.fema.gov/portal/search?AddressQuery=${p.lat.toFixed(6)}%2C${p.lng.toFixed(6)}`, 'FEMA Flood Map Service Center'],
        ];
      },
    },
    {
      key: 'wetlands', title: 'Wetlands (US Fish & Wildlife)',
      async run(p, ring) {
        const w = await polyQuery('https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0', ring, 'WETLAND_TYPE,ATTRIBUTE');
        if (!w.length) return [['Mapped wetlands', 'None mapped on this parcel']];
        const types = [...new Set(w.map((x) => x.WETLAND_TYPE).filter(Boolean))];
        const codes = [...new Set(w.map((x) => x.ATTRIBUTE).filter(Boolean))];
        return [['Mapped wetlands', `Yes – ${types.join(', ')}`], ['NWI codes', codes.slice(0, 8).join(', ')],
          ['Note', 'Mapped from aerial photos. Building in wetlands can need a permit; a field delineation is the official answer.']];
      },
    },
    {
      key: 'soils', title: 'Soils (USDA NRCS)',
      async run(p, ring) {
        const wkt = `POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(', ')}))`;
        const query = `~DeclareGeometry(@aoi)~
select @aoi = geometry::STPolyFromText('${wkt}', 4326)
~DeclareIdGeomTable(@g)~
~GetClippedMapunits(@aoi,polygon,geo,@g)~
~DeclareIdGeogTable(@gg)~
~GetGeogFromGeomWgs84(@g,@gg)~
select a.area_m2, mu.musym, mu.muname, mu.farmlndcl, ma.drclassdcd, ma.hydgrpdcd, ma.flodfreqdcd, ma.slopegradwta, ma.brockdepmin, ma.wtdepannmin, ma.engdwbll, ma.engstafdcd
from (select id mukey, sum(geog.STArea()) area_m2 from @gg group by id) a join mapunit mu on mu.mukey=a.mukey left join muaggatt ma on ma.mukey=a.mukey order by a.area_m2 desc`;
        const j = await req('https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest', { json: { format: 'JSON+COLUMNNAME', query }, timeout: 40000 });
        const t = j.Table || [];
        if (t.length < 2) return [['Soil survey', 'No soil survey data here']];
        const cols = t[0], rowsArr = t.slice(1).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
        const total = rowsArr.reduce((s, r) => s + (+r.area_m2 || 0), 0) || 1;
        const out = [];
        for (const r of rowsArr.slice(0, 6)) {
          const share = (+r.area_m2 / total) * 100;
          if (share < 1 && out.length) continue;
          const bits = [r.drclassdcd, r.slopegradwta ? `${(+r.slopegradwta).toFixed(0)}% avg slope` : null, r.hydgrpdcd ? `hydrologic group ${r.hydgrpdcd}` : null,
            r.wtdepannmin ? `water table ${Math.round(r.wtdepannmin / 2.54)} in` : null, r.brockdepmin ? `bedrock ${Math.round(r.brockdepmin / 2.54)} in` : null].filter(Boolean);
          out.push([`${share.toFixed(0)}% · ${r.musym}`, `${r.muname}${bits.length ? ' — ' + bits.join(', ') : ''}`]);
        }
        const top = rowsArr[0];
        out.push(['Farmland class (main soil)', top.farmlndcl]);
        out.push(['Homes with basements', top.engdwbll]);
        out.push(['Septic absorption fields', top.engstafdcd ? top.engstafdcd : null]);
        out.push(['Flooding frequency', top.flodfreqdcd]);
        out.push(['__link', 'https://websoilsurvey.nrcs.usda.gov/app/WebSoilSurvey.aspx', 'USDA Web Soil Survey']);
        return out;
      },
    },
    {
      key: 'elevation', title: 'Elevation (USGS)',
      async run(p, ring) {
        const pts = [[p.lng, p.lat]];
        if (p.rings) {
          const step = Math.max(1, Math.floor(ring.length / 6));
          for (let i = 0; i < ring.length - 1 && pts.length < 7; i += step) pts.push(ring[i]);
        }
        const vals = await Promise.all(pts.map(([x, y]) => req(`https://epqs.nationalmap.gov/v1/json?${qs({ x, y, units: 'Feet', wkid: 4326 })}`, { timeout: 15000 }).then((j) => +j.value).catch(() => null)));
        const ok = vals.filter((v) => v != null && isFinite(v) && v > -1000);
        if (!ok.length) return null;
        const lo = Math.min(...ok), hi = Math.max(...ok);
        return [['Elevation at center', vals[0] != null ? `${Math.round(vals[0]).toLocaleString()} ft` : null],
          ['Range across parcel', p.rings ? `${Math.round(lo).toLocaleString()}–${Math.round(hi).toLocaleString()} ft (${Math.round(hi - lo)} ft of relief)` : null]];
      },
    },
    {
      key: 'districts', title: 'Districts & census areas',
      async run(p) {
        const d = 0.001;
        const j = await req(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/identify?${qs({
          f: 'json', geometry: `${p.lng},${p.lat}`, geometryType: 'esriGeometryPoint', sr: 4326, layers: 'all:2,8,10,14,16,18,22,28,30,54,56,58,88', tolerance: 0,
          mapExtent: `${p.lng - d},${p.lat - d},${p.lng + d},${p.lat + d}`, imageDisplay: '400,400,96', returnGeometry: false })}`);
        const by = {};
        for (const r of j.results || []) by[r.layerId] = r.attributes;
        const nm = (id) => (by[id] ? by[id].NAME : null);
        p.__tract = by[8] ? by[8].GEOID : null;
        return [
          ['City / town', nm(28) || nm(30)], ['Township / county subdivision', nm(22) && nm(22) !== nm(28) ? nm(22) : null],
          ['ZIP code area', nm(2) ? nm(2).replace('ZCTA5 ', '') : null], ['School district', nm(14) || [nm(18), nm(16)].filter(Boolean).join(' / ') || null],
          ['Congressional district', nm(54)], ['State senate', nm(56)], ['State house / assembly', nm(58)],
          ['Census tract', by[8] ? `${by[8].NAME} (${by[8].GEOID})` : null], ['Block group', by[10] ? by[10].GEOID : null],
          ['Urban area', nm(88) || 'Rural (outside census urban areas)'],
        ];
      },
    },
    {
      key: 'neighborhood', title: 'Neighborhood (Census ACS, tract)',
      async run(p) {
        const a = (await pointQuery('https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/ACS_Population_and_Housing_Basics_View_Boundaries/FeatureServer/2', p, '*'))[0];
        if (!a) return null;
        return [
          ['Area', a.NAME], ['Population', num(a.B01001_001E)], ['Median age', a.B01002_001E], ['Median household income', money(a.B19049_001E)],
          ['Median home value', money(a.B25077_001E)], ['Median rent', a.B25058_001E ? `${money(a.B25058_001E)}/mo` : null],
          ['Homeownership rate', pct(a.B25003_calc_pctOwnE)], ['Housing units', num(a.B25002_001E)],
          ['Vacant units', a.B25002_001E ? `${num(a.B25002_003E)} (${pct((a.B25002_003E / a.B25002_001E) * 100)})` : null],
          ['Under 18 / 65 and over', `${pct(a.B01001_calc_pctLT18E)} / ${pct(a.B01001_calc_pctGE65E)}`],
        ];
      },
    },
    {
      key: 'plss', title: 'Public Land Survey (BLM)',
      async run(p) {
        const a = (await pointQuery('https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/3', p, 'PLSSID,FRSTDIVID,SECDIVLAB,SECDIVTXT,GOVLOT,RECRDAREATX'))[0];
        if (!a || !a.PLSSID) return [['Survey system', 'Not in the Public Land Survey System (metes and bounds area)']];
        const id = a.PLSSID; // e.g. ND051390N0800W0
        const twp = `T${parseInt(id.slice(4, 7), 10)}${id[8]}`, rng = `R${parseInt(id.slice(9, 12), 10)}${id[13]}`;
        const sec = a.FRSTDIVID ? parseInt(a.FRSTDIVID.slice(id.length + 2, id.length + 4), 10) : null;
        return [
          ['Township / range', `${twp} ${rng}`], ['Section', sec || null], ['Aliquot / lot', a.SECDIVLAB || a.GOVLOT || null],
          ['Principal meridian code', id.slice(2, 4)], ['Recorded area', a.RECRDAREATX], ['Legal shorthand', [a.SECDIVLAB, sec ? `S${sec}` : null, twp, rng].filter(Boolean).join(' ')],
        ];
      },
    },
    {
      key: 'watershed', title: 'Watershed (USGS)',
      async run(p) {
        const [h12, h8] = await Promise.all([
          pointQuery('https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/6', p, 'huc12,name'),
          pointQuery('https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/4', p, 'huc8,name'),
        ]);
        if (!h12[0] && !h8[0]) return null;
        return [['Subwatershed (HUC-12)', h12[0] ? `${h12[0].name} (${h12[0].huc12})` : null], ['Subbasin (HUC-8)', h8[0] ? `${h8[0].name} (${h8[0].huc8})` : null]];
      },
    },
  ];

  const cache = new Map();
  // Calls onSection(key, title, rows|null, error) as each source answers.
  function load(p, onSection) {
    const ring = aoiRing(p);
    const id = p.id;
    if (!cache.has(id)) cache.set(id, {});
    const c = cache.get(id);
    return Promise.all(LOADERS.map(async (L) => {
      if (c[L.key]) return onSection(L.key, L.title, c[L.key]);
      try {
        const rows = await L.run(p, ring);
        if (rows) c[L.key] = rows;
        onSection(L.key, L.title, rows);
      } catch (e) {
        console.warn('public data', L.key, e);
        onSection(L.key, L.title, null, e);
      }
    }));
  }
  window.PublicData = { load, LOADERS, cached: (id) => cache.get(id) || null };
})();
