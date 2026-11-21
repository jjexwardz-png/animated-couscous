/* Parcel data sources.
 * Each entry is a free, public statewide parcel service published by a state GIS office.
 * map(a) receives the feature's attributes with lower-cased keys and returns a normalized record.
 * Nationwide boundary lines come from Regrid's free tile layer (see app.js); these sources add details.
 */
(function () {
  const v = (x) => {
    if (x === undefined || x === null) return null;
    if (typeof x === 'string') {
      const t = x.trim();
      if (!t || /^(null|none|n\/a|unknown|0\.0)$/i.test(t)) return null;
      return t;
    }
    return x;
  };
  const num = (x) => {
    x = v(x);
    if (x === null) return null;
    const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/[$,]/g, ''));
    return isFinite(n) ? n : null;
  };
  const pos = (x) => { const n = num(x); return n && n > 0 ? n : null; };
  const join = (sep, ...parts) => { const p = parts.map(v).filter(Boolean); return p.length ? p.join(sep) : null; };
  const cityLine = (city, st, zip) => {
    const c = v(city), s = v(st), z = v(zip);
    const left = join(', ', c, s);
    return join(' ', left, z ? String(z).replace(/\.0$/, '').padStart(5, '0') : null);
  };
  const epoch = (x) => { const n = num(x); if (!n) return null; const d = new Date(n); return isNaN(d) ? null : d.toISOString().slice(0, 10); };
  const ymd = (x) => { x = v(x); if (!x) return null; x = String(x); return /^\d{8}$/.test(x) ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : x; };
  const year = (x) => { const n = num(x); return n && n > 1600 && n < 2100 ? Math.round(n) : null; };

  const FL_COUNTIES = ['Alachua','Baker','Bay','Bradford','Brevard','Broward','Calhoun','Charlotte','Citrus','Clay','Collier','Columbia','Miami-Dade','DeSoto','Dixie','Duval','Escambia','Flagler','Franklin','Gadsden','Gilchrist','Glades','Gulf','Hamilton','Hardee','Hendry','Hernando','Highlands','Hillsborough','Holmes','Indian River','Jackson','Jefferson','Lafayette','Lake','Lee','Leon','Levy','Liberty','Madison','Manatee','Marion','Martin','Monroe','Nassau','Okaloosa','Okeechobee','Orange','Osceola','Palm Beach','Pasco','Pinellas','Polk','Putnam','St. Johns','St. Lucie','Santa Rosa','Sarasota','Seminole','Sumter','Suwannee','Taylor','Union','Volusia','Wakulla','Walton','Washington'];
  const FL_USE = {0:'Vacant residential',1:'Single family',2:'Mobile home',3:'Multi-family (10+ units)',4:'Condominium',5:'Cooperative',6:'Retirement home',7:'Misc. residential',8:'Multi-family (2–9 units)',9:'Residential common area',10:'Vacant commercial',11:'Store',12:'Store/office mixed use',13:'Department store',14:'Supermarket',15:'Regional shopping center',16:'Community shopping center',17:'Office, one story',18:'Office, multi-story',19:'Professional services',20:'Airport / marina / terminal',21:'Restaurant',22:'Drive-in restaurant',23:'Bank / financial',24:'Insurance office',25:'Repair service',26:'Service station',27:'Auto sales / repair',28:'Parking lot / mobile home park',29:'Wholesale / distribution',30:'Florist / greenhouse',31:'Drive-in theater',32:'Theater / auditorium',33:'Nightclub / bar',34:'Bowling / arena',35:'Tourist attraction',36:'Camp',37:'Race track',38:'Golf course',39:'Hotel / motel',40:'Vacant industrial',41:'Light manufacturing',42:'Heavy industrial',43:'Lumber yard',44:'Packing plant',45:'Cannery / brewery',46:'Food processing',47:'Mineral processing',48:'Warehouse',49:'Open storage',50:'Improved agricultural',51:'Cropland',52:'Cropland',53:'Cropland',54:'Timberland',55:'Timberland',56:'Timberland',57:'Timberland',58:'Timberland',59:'Timberland',60:'Grazing land',61:'Grazing land',62:'Grazing land',63:'Grazing land',64:'Grazing land',65:'Grazing land',66:'Orchard / grove',67:'Poultry, bees, fish',68:'Dairy / feed lot',69:'Ornamentals',70:'Vacant institutional',71:'Church',72:'Private school',73:'Private hospital',74:'Home for the aged',75:'Non-profit service',76:'Mortuary / cemetery',77:'Club / lodge',78:'Sanitarium',79:'Cultural organization',80:'Vacant governmental',81:'Military',82:'Forest / park / recreation',83:'Public school',84:'College',85:'Hospital',86:'County owned',87:'State owned',88:'Federal owned',89:'Municipal owned',90:'Leasehold interest',91:'Utility',92:'Mining / petroleum',93:'Subsurface rights',94:'Right-of-way',95:'Rivers / lakes',96:'Sewage / waste land',97:'Outdoor recreation',98:'Centrally assessed',99:'Non-agricultural acreage'};
  const MD_JURS = {ALLE:'Allegany',ANNE:'Anne Arundel',BACI:'Baltimore City',BACO:'Baltimore County',CALV:'Calvert',CARO:'Caroline',CARR:'Carroll',CECI:'Cecil',CHAR:'Charles',DORC:'Dorchester',FRED:'Frederick',GARR:'Garrett',HARF:'Harford',HOWA:'Howard',KENT:'Kent',MONT:'Montgomery',PRIN:"Prince George's",QUEE:"Queen Anne's",STMA:"St. Mary's",SOME:'Somerset',TALB:'Talbot',WASH:'Washington',WICO:'Wicomico',WORC:'Worcester'};
  const WA_COUNTIES = {1:'Adams',3:'Asotin',5:'Benton',7:'Chelan',9:'Clallam',11:'Clark',13:'Columbia',15:'Cowlitz',17:'Douglas',19:'Ferry',21:'Franklin',23:'Garfield',25:'Grant',27:'Grays Harbor',29:'Island',31:'Jefferson',33:'King',35:'Kitsap',37:'Kittitas',39:'Klickitat',41:'Lewis',43:'Lincoln',45:'Mason',47:'Okanogan',49:'Pacific',51:'Pend Oreille',53:'Pierce',55:'San Juan',57:'Skagit',59:'Skamania',61:'Snohomish',63:'Spokane',65:'Stevens',67:'Thurston',69:'Wahkiakum',71:'Walla Walla',73:'Whatcom',75:'Whitman',77:'Yakima'};
  const NJ_CLASS = {'1':'Vacant land','2':'Residential','3A':'Farm (regular)','3B':'Farm (qualified)','4A':'Commercial','4B':'Industrial','4C':'Apartment','5A':'Railroad (class I)','5B':'Railroad (class II)','6A':'Telephone','15A':'Public school','15B':'Other school','15C':'Public property','15D':'Church / charitable','15E':'Cemetery','15F':'Other exempt'};
  const WI_CLASS = {'1':'Residential','2':'Commercial','3':'Manufacturing','4':'Agricultural','5':'Undeveloped','5M':'Agricultural forest','6':'Productive forest','7':'Other','X1':'Exempt (federal)','X2':'Exempt (state)','X3':'Exempt (county)','X4':'Exempt (other)'};

  const SOURCES = {
    AR: {
      name: 'Arkansas GIS Office – Assessor Mapping Program', owner: true,
      url: 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6',
      ownerField: 'ownername', idField: 'parcelid',
      map: (a) => ({
        owner: v(a.ownername), siteAddress: v(a.adrlabel), siteCity: cityLine(a.adrcity, 'AR', a.adrzip5),
        county: v(a.county), parcelId: v(a.parcelid), legal: v(a.parcellgl), subdivision: v(a.subdivision),
        landValue: num(a.landvalue), improvementValue: num(a.impvalue), totalValue: num(a.totalvalue), assessedValue: num(a.assessvalue),
        plss: v(a.str), parcelType: v(a.parceltype),
      }),
    },
    CO: {
      name: 'Colorado Public Parcels (OIT)', owner: true,
      url: 'https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0',
      ownerField: 'owner', idField: 'parcel_id',
      map: (a) => ({
        owner: v(a.owner), owner2: v(a.owner2), mailing: join(', ', a.owneradd, cityLine(a.ownaddcty, a.ownaddstt, a.ownaddzip)),
        siteAddress: v(a.situsadd), siteCity: cityLine(a.sitaddcty, 'CO', a.sitaddzip), county: v(a.countyname),
        parcelId: v(a.parcel_id), account: v(a.account), legal: v(a.legaldesc), acres: pos(a.landacres) || (pos(a.landsqft) ? a.landsqft / 43560 : null),
        landUse: v(a.landusedsc), zoning: join(' – ', a.zoningcode, a.zoningdesc), subdivision: v(a.subname),
        saleDate: v(a.saledate) && !/^12:00/.test(a.saledate) ? v(a.saledate) : null, salePrice: pos(a.saleprice),
        totalValue: pos(a.apprvaltot), assessedValue: pos(a.asedvaltot), link: v(a.url),
      }),
    },
    CT: {
      name: 'Connecticut CAMA & Parcel Layer (OPM)', owner: true,
      url: 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0',
      ownerField: 'Owner', idField: 'Parcel_ID',
      map: (a) => ({
        owner: v(a.owner), owner2: v(a.co_owner), mailing: join(', ', a.mailing_address, cityLine(a.mailing_city, a.mailing_state, a.mailing_zip)),
        siteAddress: v(a.location_1) || v(a.location), siteCity: cityLine(a.property_city || a.town_name, 'CT', a.property_zip || a.zip_code),
        municipality: v(a.town_name), parcelId: v(a.parcel_id),
        assessedValue: pos(a.assessed_total), landValue: pos(a.appraised_land), improvementValue: pos(a.appraised_building),
        totalValue: (pos(a.appraised_land) || 0) + (pos(a.appraised_building) || 0) + (pos(a.appraised_outbuilding) || 0) || null,
        acres: pos(a.land_acres), zoning: v(a.zone), landUse: v(a.state_use_description), yearBuilt: year(a.ayb),
        livingArea: pos(a.living_area), bedrooms: pos(a.number_of_bedroom), baths: pos(a.number_of_baths),
        salePrice: pos(a.sale_price), saleDate: v(a.sale_date), valuationYear: v(a.valuation_year),
      }),
    },
    DE: {
      name: 'Delaware FirstMap State Parcels', owner: false,
      url: 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer/0',
      idField: 'PIN',
      map: (a) => ({ parcelId: v(a.pin), acres: pos(a.acres), county: v(a.county) }),
    },
    FL: {
      name: 'Florida Statewide Cadastral (Dept. of Revenue)', owner: true,
      url: 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0',
      ownerField: 'OWN_NAME', idField: 'PARCEL_ID',
      // This service cannot reproject inputs and fails when asked for attributes and geometry together,
      // so the app sends native coordinates and fetches geometry in a second request.
      proj: { code: 'EPSG:6439', def: '+proj=aea +lat_0=24 +lon_0=-84 +lat_1=24 +lat_2=31.5 +x_0=400000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
      splitGeometry: true, noLimit: true,
      map: (a) => {
        const use = num(a.dor_uc);
        const saleYr = num(a.sale_yr1), saleMo = v(a.sale_mo1);
        return {
          owner: v(a.own_name), mailing: join(', ', a.own_addr1, a.own_addr2, cityLine(a.own_city, a.own_state_ || a.own_state, a.own_zipcd)),
          siteAddress: v(a.phy_addr1), siteCity: cityLine(a.phy_city, 'FL', a.phy_zipcd), county: FL_COUNTIES[(num(a.co_no) || 0) - 11] || null,
          parcelId: v(a.parcel_id), legal: v(a.s_legal), landUse: use !== null ? (FL_USE[use] || `DOR code ${a.dor_uc}`) : null,
          totalValue: pos(a.jv), assessedValue: pos(a.av_sd), taxableValue: pos(a.tv_sd), landValue: pos(a.lnd_val),
          acres: pos(a.lnd_sqfoot) ? a.lnd_sqfoot / 43560 : null, yearBuilt: year(a.act_yr_blt), livingArea: pos(a.tot_lvg_ar),
          buildings: pos(a.no_buldng), salePrice: pos(a.sale_prc1), saleDate: saleYr ? (saleMo && saleMo.trim() ? `${saleYr}-${String(saleMo).trim().padStart(2, '0')}` : String(saleYr)) : null,
          deed: v(a.or_book1) && v(a.or_book1) !== '' ? `OR ${a.or_book1.trim()}/${String(a.or_page1 || '').trim()}` : null,
          plss: v(a.twn) ? `S${a.sec} T${a.twn} R${a.rng}` : null, valuationYear: v(a.asmnt_yr),
        };
      },
    },
    HI: {
      name: 'Hawaii Statewide GIS – Tax Map Keys', owner: false,
      url: 'https://geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer/25',
      idField: 'tmk_txt',
      map: (a) => ({ parcelId: v(a.tmk_txt) ? `TMK ${a.tmk_txt}` : null, county: v(a.county), acres: pos(a.gisacres), link: v(a.qpub_link) }),
    },
    IN: {
      name: 'IndianaMap Parcel Boundaries', owner: false,
      url: 'https://gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0',
      idField: 'parcel_id',
      map: (a) => ({
        siteAddress: v(a.prop_add), siteCity: cityLine(a.prop_city, 'IN', a.prop_zip), county: v(a.tax_county) ? String(a.tax_county).replace(/ COUNTY$/, '') : null,
        parcelId: v(a.parcel_id), stateParcelId: v(a.state_parcel_id), landUse: v(a.dlgf_prop_class_code) ? `Class ${a.dlgf_prop_class_code}` : null,
        township: v(a.tax_township), schoolDistrict: v(a.tax_school),
      }),
    },
    MA: {
      name: 'MassGIS Property Tax Parcels', owner: true,
      url: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0',
      ownerField: 'OWNER1', idField: 'MAP_PAR_ID',
      map: (a) => ({
        owner: v(a.owner1), mailing: join(', ', a.own_addr, cityLine(a.own_city, a.own_state, a.own_zip)),
        siteAddress: v(a.site_addr), siteCity: cityLine(a.city, 'MA', a.zip), parcelId: v(a.map_par_id) || v(a.loc_id),
        landValue: pos(a.land_val), improvementValue: pos(a.bldg_val), totalValue: pos(a.total_val), valuationYear: v(a.fy),
        acres: pos(a.lot_size) ? (/sq/i.test(a.lot_units || '') ? a.lot_size / 43560 : a.lot_size) : null,
        landUse: join(' – ', a.use_code, a.use_desc), zoning: v(a.zoning), yearBuilt: year(a.year_built), livingArea: pos(a.res_area),
        units: pos(a.units), stories: v(a.stories), salePrice: pos(a.ls_price), saleDate: ymd(a.ls_date),
        deed: v(a.ls_book) && a.ls_book !== '99999' ? `Book ${a.ls_book} / Page ${a.ls_page}` : null,
      }),
    },
    MD: {
      name: 'Maryland Dept. of Planning – Parcel Boundaries (SDAT)', owner: false,
      url: 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0',
      idField: 'ACCTID',
      map: (a) => ({
        mailing: join(', ', a.ownadd1, a.ownadd2, cityLine(a.owncity, a.ownstate, a.ownerzip)),
        siteAddress: v(a.address), siteCity: cityLine(a.city, 'MD', a.zipcode), county: MD_JURS[a.jurscode] || v(a.jurscode),
        parcelId: v(a.acctid), legal: join(' ', a.legal1, a.legal2, a.legal3), subdivision: v(a.descsubd),
        landValue: pos(a.nfmlndvl), improvementValue: pos(a.nfmimpvl), totalValue: pos(a.nfmttlvl), acres: pos(a.acres),
        landUse: v(a.desclu), zoning: v(a.zoning), yearBuilt: year(a.yearblt), livingArea: pos(a.sqftstrc),
        salePrice: pos(a.considr1), saleDate: v(a.tradate) ? ymd(a.tradate) : null,
        deed: v(a.dr1liber) ? `Liber ${a.dr1liber} / Folio ${a.dr1folio}` : null, link: v(a.sdatwebadr),
        note: 'Maryland removed owner names from its public parcel data. Open the SDAT record for owner details.',
      }),
    },
    ME: {
      name: 'Maine GeoLibrary – Organized Town Parcels', owner: false,
      url: 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/10',
      idField: 'MAP_BK_LOT',
      map: (a) => ({ siteAddress: join(' ', a.proplocnum, a.prop_loc), siteCity: cityLine(a.town, 'ME'), county: v(a.county), parcelId: v(a.map_bk_lot) }),
    },
    MN: {
      name: 'MnGeo Open Parcels (opt-in counties)', owner: true,
      url: 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/FeatureServer/0',
      ownerField: 'owner_name', idField: 'county_pin',
      map: (a) => ({
        owner: v(a.owner_name), owner2: v(a.owner_more), taxpayer: v(a.tax_name) !== v(a.owner_name) ? v(a.tax_name) : null,
        mailing: join(', ', a.own_add_l1, a.own_add_l2, a.own_add_l3) || join(', ', a.tax_add_l1, a.tax_add_l2, a.tax_add_l3),
        siteAddress: join(' ', a.anumber, a.st_pre_dir, a.st_name, a.st_pos_typ, a.st_pos_dir), siteCity: cityLine(a.ctu_name, 'MN', a.zip),
        county: v(a.co_name), parcelId: v(a.county_pin), legal: v(a.abb_legal), subdivision: v(a.plat_name),
        acres: pos(a.acres_deed) || pos(a.acres_poly), landValue: pos(a.emv_land), improvementValue: pos(a.emv_bldg), totalValue: pos(a.emv_total),
        annualTax: pos(a.total_tax), landUse: v(a.useclass1), yearBuilt: year(a.year_built), livingArea: pos(a.fin_sq_ft),
        salePrice: pos(a.sale_value), saleDate: v(a.sale_date), homestead: v(a.homestead), schoolDistrict: v(a.school_dst),
        plss: v(a.section) ? `S${a.section} T${a.township} R${a.range}${a.range_dir || ''}` : null,
      }),
    },
    MT: {
      name: 'Montana Cadastral (Montana State Library)', owner: true,
      url: 'https://services.arcgis.com/qnjIrwR8z5Izc0ij/arcgis/rest/services/Cadastral_Application_Support/FeatureServer/5',
      ownerField: 'OwnerName', idField: 'PARCELID',
      map: (a) => ({
        owner: v(a.ownername), owner2: v(a.careoftaxpayer) || v(a.dbaname),
        mailing: join(', ', a.owneraddress1, a.owneraddress2, cityLine(a.ownercity, a.ownerstate, a.ownerzipcode)),
        siteAddress: v(a.addressline1), siteCity: v(a.citystatezip), county: v(a.countyname), parcelId: v(a.parcelid),
        legal: v(a.legaldescriptionshort), subdivision: v(a.subdivision), acres: pos(a.totalacres) || pos(a.gisacres),
        landValue: pos(a.totallandvalue), improvementValue: pos(a.totalbuildingvalue), totalValue: pos(a.totalvalue),
        landUse: v(a.proptype), valuationYear: v(a.taxyear), plss: v(a.section) ? `S${a.section} T${a.township} R${a.range}` : null,
        link: v(a.parcelid) ? `https://svc.mt.gov/msl/cadastral/?parcel=${encodeURIComponent(a.parcelid)}` : null,
      }),
    },
    NC: {
      name: 'NC OneMap Statewide Parcels', owner: true,
      url: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1',
      ownerField: 'ownname', idField: 'parno',
      map: (a) => ({
        owner: v(a.ownname), owner2: v(a.ownname2), mailing: join(', ', a.mailadd, cityLine(a.mcity, a.mstate, a.mzip)),
        siteAddress: v(a.siteadd), siteCity: cityLine(a.scity, 'NC', a.szip), county: v(a.cntyname), parcelId: v(a.parno), altId: v(a.altparno),
        landValue: pos(a.landval), improvementValue: pos(a.improvval), totalValue: pos(a.parval), acres: pos(a.gisacres) || pos(a.recareano),
        legal: v(a.legdecfull), subdivision: v(a.subdivisio), landUse: v(a.parusedsc2) || v(a.parusedesc), yearBuilt: year(a.structyear),
        saleDate: epoch(a.saledate), deed: v(a.sourceref),
      }),
    },
    ND: {
      name: 'North Dakota GIS Hub Parcels', owner: false,
      url: 'https://services1.arcgis.com/GOcSXpzwBHyk2nog/arcgis/rest/services/NDGISHUB_Parcels/FeatureServer/0',
      idField: 'GISID',
      map: (a) => ({
        parcelId: v(a.gisid), county: v(a.countyname), acres: pos(a.calculatedacres), subdivision: v(a.subdivisionplat),
        legal: join(', ', v(a.lot) ? `Lot ${a.lot}` : null, v(a.block) ? `Block ${a.block}` : null),
        plss: v(a.section) ? `S${a.section} T${a.township} R${a.range}` : null,
      }),
    },
    NH: {
      name: 'NH GRANIT Parcel Mosaic', owner: false,
      url: 'https://nhgeodata.unh.edu/hosting/rest/services/Hosted/CAD_ParcelMosaic/FeatureServer/1',
      idField: 'displayid',
      map: (a) => ({ siteAddress: v(a.streetaddress), siteCity: cityLine(a.town, 'NH'), parcelId: v(a.displayid) || v(a.nh_gis_id) }),
    },
    NJ: {
      name: 'NJOGIS Parcels & MOD-IV Composite', owner: true,
      url: 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0',
      ownerField: 'OWNER_NAME', idField: 'PAMS_PIN',
      map: (a) => ({
        owner: v(a.owner_name), mailing: join(', ', a.st_address, join(' ', a.city_state, a.zip_code)),
        siteAddress: v(a.prop_loc), siteCity: v(a.mun_name), county: v(a.county),
        parcelId: v(a.pclblock) ? `Block ${a.pclblock}, Lot ${a.pcllot}${v(a.pclqcode) ? ' ' + a.pclqcode : ''}` : v(a.pams_pin), altId: v(a.pams_pin),
        landValue: pos(a.land_val), improvementValue: pos(a.imprvt_val), totalValue: pos(a.net_value), annualTax: pos(a.last_yr_tx),
        acres: pos(a.calc_acre), landUse: v(a.prop_class) ? (NJ_CLASS[a.prop_class] || `Class ${a.prop_class}`) : null,
        building: v(a.bldg_desc), yearBuilt: year(a.yr_constr), salePrice: pos(a.sale_price), saleDate: epoch(a.deed_date),
        deed: v(a.deed_book) ? `Book ${a.deed_book} / Page ${a.deed_page}` : null,
        note: v(a.owner_name) ? null : 'Owner name withheld from the public file (NJ Daniel’s Law or source data).',
      }),
    },
    NY: {
      name: 'NYS GIS Program Office – Tax Parcels (public counties)', owner: true,
      url: 'https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1',
      ownerField: 'PRIMARY_OWNER', idField: 'PRINT_KEY',
      map: (a) => ({
        owner: v(a.primary_owner), owner2: v(a.add_owner), mailing: join(', ', a.mail_addr || a.po_box, cityLine(a.mail_city, a.mail_state, a.mail_zip)),
        siteAddress: v(a.parcel_addr), siteCity: cityLine(a.citytown_name, 'NY', a.loc_zip), county: v(a.county_name),
        parcelId: v(a.print_key), altId: v(a.swis_sbl_id), landValue: pos(a.land_av), assessedValue: pos(a.total_av), totalValue: pos(a.full_market_val),
        acres: pos(a.acres) || pos(a.calc_acres), landUse: join(' – ', a.prop_class, a.used_as_desc), yearBuilt: year(a.yr_blt),
        livingArea: pos(a.sqft_living), bedrooms: pos(a.nbr_bedrooms), baths: pos(a.nbr_full_baths), building: v(a.bldg_style_desc),
        schoolDistrict: v(a.school_name), utilities: join(', ', a.water_desc, a.sewer_desc), deed: v(a.book) ? `Book ${a.book} / Page ${a.page}` : null,
        valuationYear: v(a.roll_yr),
      }),
    },
    OH: {
      name: 'Ohio Statewide Parcels (OGRIP)', owner: false,
      url: 'https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0',
      noLimit: true, idField: 'LocalParcelID',
      map: (a) => ({
        mailing: v(a.mailaddressall) && a.mailaddressall.trim() ? join(', ', a.mailaddressall, cityLine(a.mailcity, a.mailstate, a.mailzip)) : null,
        siteAddress: v(a.situsaddressall) ? a.situsaddressall.replace(/\s+/g, ' ').trim() : null, county: v(a.county),
        parcelId: v(a.localparcelid), stateParcelId: v(a.stateparcelid), landUse: v(a.stateluc), acres: pos(a.landarea), link: v(a.camadatasite),
        note: 'Ohio’s statewide file has no owner names. The county auditor link has full owner and value details.',
      }),
    },
    TN: {
      name: 'Tennessee Comptroller – Property Boundaries', owner: true,
      url: 'https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Property_Boundaries_Public_Use/FeatureServer/0',
      noLimit: true,
      ownerField: 'OWNER', idField: 'PARCELID',
      map: (a) => {
        let addr = v(a.address);
        const m = addr && addr.match(/^(.*\D)\s+(\d+[A-Z]?)$/); // stored as "MAIN ST 447"
        if (m) addr = `${m[2]} ${m[1]}`;
        return {
          owner: v(a.owner), owner2: v(a.owner2), siteAddress: addr, county: v(a.county_name), parcelId: v(a.parcelid),
          acres: pos(a.deedac), subdivision: v(a.subdiv), legal: v(a.lot) ? `Lot ${a.lot}` : null, link: v(a.link_tpad) || v(a.link_tpv),
        };
      },
    },
    TX: {
      name: 'TxGIO StratMap Land Parcels', owner: true,
      url: 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer',
      identify: true, // this map service supports identify but not query
      map: (a) => ({
        owner: v(a.owner_name), owner2: v(a.name_care) !== v(a.owner_name) ? v(a.name_care) : null,
        mailing: v(a.mail_addr), siteAddress: v(a.situs_addr) ? a.situs_addr.replace(/(,\s*)+/g, ', ').replace(/^,\s*|,\s*$/g, '').replace(/\s+,/g, ',').trim() : null,
        county: v(a.county) ? a.county.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : null, parcelId: v(a.prop_id), altId: v(a.geo_id),
        legal: v(a.legal_desc), acres: pos(a.legal_area) || pos(a.gis_area), landValue: pos(a.land_value), improvementValue: pos(a.imp_value),
        totalValue: pos(a.mkt_value), yearBuilt: year(a.year_built), valuationYear: v(a.tax_year), landUse: v(a.stat_land_use) || v(a.loc_land_use),
        source: v(a.source),
      }),
    },
    UT: {
      name: 'UGRC Statewide Parcels', owner: false,
      url: 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahStatewideParcels/FeatureServer/0',
      idField: 'PARCEL_ID',
      map: (a) => ({
        siteAddress: v(a.parcel_add), siteCity: cityLine(a.parcel_city, 'UT', a.parcel_zip), county: v(a.county) ? a.county.replace(/([a-z])([A-Z])/g, '$1 $2') : null,
        parcelId: v(a.parcel_id), ownerType: v(a.own_type), link: v(a.coparcel_url),
      }),
    },
    VA: {
      name: 'VGIN Virginia Parcels', owner: false,
      url: 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0',
      idField: 'PARCELID',
      map: (a) => ({ county: v(a.locality), parcelId: v(a.ptm_id) || v(a.parcelid), altId: v(a.parcelid) }),
    },
    VT: {
      name: 'VCGI Standardized Parcels (Grand List)', owner: true,
      url: 'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0',
      ownerField: 'OWNER1', idField: 'SPAN',
      map: (a) => ({
        owner: v(a.owner1), owner2: v(a.owner2), mailing: join(', ', a.addrgl1, a.addrgl2, cityLine(a.citygl, a.stgl, a.zipgl)),
        siteAddress: v(a.e911addr) || v(a.locaprop), siteCity: cityLine(a.town, 'VT'), parcelId: v(a.span) || v(a.parcid), altId: v(a.mapid),
        acres: pos(a.acresgl), totalValue: pos(a.real_flv), landValue: pos(a.land_lv), improvementValue: pos(a.imprv_lv),
        landUse: v(a.cat) || v(a.proptype), legal: v(a.descprop), valuationYear: v(a.glyear) || v(a.year),
      }),
    },
    WA: {
      name: 'WA Geospatial Open Data – Current Parcels', owner: false,
      url: 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0',
      idField: 'ORIG_PARCEL_ID',
      map: (a) => ({
        siteAddress: join(' ', a.situs_address, a.sub_address), siteCity: cityLine(a.situs_city_nm, 'WA', a.situs_zip_nr),
        county: WA_COUNTIES[num(a.fips_nr)] || null, parcelId: v(a.orig_parcel_id) || v(a.parcel_id_nr),
        landValue: pos(a.value_land), improvementValue: pos(a.value_bldg),
        totalValue: (pos(a.value_land) || 0) + (pos(a.value_bldg) || 0) || null, link: v(a.data_link),
      }),
    },
    WI: {
      name: 'Wisconsin Statewide Parcels (V12)', owner: true,
      url: 'https://services3.arcgis.com/n6uYoouQZW75n5WI/ArcGIS/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0',
      ownerField: 'OWNERNME1', idField: 'PARCELID',
      map: (a) => ({
        owner: v(a.ownernme1), owner2: v(a.ownernme2), mailing: v(a.pstladress),
        siteAddress: v(a.siteadress), siteCity: cityLine(a.placename, 'WI', a.zipcode), county: v(a.coname) ? a.coname.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : null,
        parcelId: v(a.parcelid), altId: v(a.stateid), landValue: pos(a.lndvalue), improvementValue: pos(a.impvalue),
        assessedValue: pos(a.cntassdvalue), totalValue: pos(a.estfmkvalue), annualTax: pos(a.netprpta),
        acres: pos(a.assdacres) || pos(a.deedacres) || pos(a.gisacres), landUse: v(a.propclass) ? String(a.propclass).split(',').map((c) => WI_CLASS[c.trim()] || c).join(', ') : null,
        schoolDistrict: v(a.schooldist), valuationYear: v(a.taxrollyear),
      }),
    },
  };

  const STATE_NAMES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',PR:'Puerto Rico',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};

  window.ParcelSources = { SOURCES, STATE_NAMES, helpers: { v, num, join, cityLine } };
})();
