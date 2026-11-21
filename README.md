# Tract

A free, web-only property line map: tap any parcel to see the owner, acreage, value, last sale and more, wherever states publish that data. There are no accounts, ads or paid tier, and no server. It is a static site that runs entirely in the browser and installs on phones as an app (PWA).

## Features

- Parcel boundary lines for the whole US (Regrid's free nationwide tile layer)
- Tap a parcel: owner, mailing address, site address, parcel ID, acres (deeded and mapped), land use, zoning, legal description, land/improvement/market/assessed values, annual tax, year built, living area, last sale and deed reference, plus every raw field from the state file
- Search by address, owner name (in the visible area), parcel ID (statewide) or coordinates
- GPS "where am I": shows your position and opens the parcel you are standing on
- Save parcels with notes, color tags and photos (stored on the device), plus recent history
- Export saved parcels to CSV, KML (Google Earth) or GeoJSON
- Measure distance and area
- Share links to a parcel, directions, Street View, and links to the official county record
- Satellite, street, USGS topo and terrain base maps
- Works offline for the app shell; installable on iPhone and Android

## Data coverage

| | States |
|---|---|
| Owner names plus details | AR, CO, CT, FL, MA, MN (opt-in counties), MT, NC, NJ (some owners withheld by law), NY (public counties), TN (most counties), TX, VT, WI |
| Parcel details without owner names | DE, HI, IN, MD, ME, ND, NH, OH, UT, VA, WA |
| Everywhere else | Property lines, plus address and county from OpenStreetMap and a link to the county assessor |

All records come from free public services run by state GIS offices. The full list with URLs is in `js/sources.js`. To add a state or county, add an entry there with its ArcGIS REST layer URL and a `map()` function that turns its fields into the common record.

## Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Deploy

It is plain static files, so any static host works:

- **GitHub Pages:** push this folder to a repository, then Settings → Pages → Deploy from branch → `main` / root.
- **Netlify / Cloudflare Pages:** drag the folder onto the dashboard, or connect the repository with no build command and `/` as the output directory.

HTTPS is required for GPS and offline support, which these hosts provide.

## Files

```
index.html            page shell and icons
css/app.css           styles (light and dark)
js/sources.js         statewide parcel services and field mappings
js/geo.js             geometry, parcel queries, geocoding
js/store.js           saved parcels, history, photos (IndexedDB)
js/app.js             map and UI
data/states.json      state outlines for picking the right source
vendor/               Leaflet 1.9.4, proj4 2.11.0
sw.js                 offline cache for the app shell
```

## Credits

Parcel lines © Regrid. Parcel records from state GIS agencies. Imagery, street and terrain maps © Esri and partners. Topo maps from USGS. Address search by Photon and Nominatim with OpenStreetMap data.

Parcel lines are approximate and are not a survey. Public records can be out of date.
