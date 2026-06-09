// ======================== DEFAULT RANCHI WARD DATA (UTM EPSG:32645) ========================
// *Placeholder* – replace with your actual 12+ features if needed.
// The original code had an empty features array. No data has been added.
const rawRanchiWardUTM = {
  "type": "FeatureCollection",
  "features": []   // <-- Add your actual GeoJSON features here
};

// Proj4 definition
proj4.defs("EPSG:32645", "+proj=utm +zone=45 +ellps=WGS84 +datum=WGS84 +units=m +no_defs");

let map, basemapLayers = {}, activeBasemap = 'streets';
let mainGeoJSON = null;
let wardBoundaryLayer = null;
let wardLabelsLayerGroup = null;
let currentFeatureCollection = null;

// Helper: convert any GeoJSON from unknown CRS to WGS84
function convertToWGS84(geojson) {
  const sourceCrs = geojson.crs?.properties?.name || "";
  let isUTM = sourceCrs.includes("32645");
  if (!isUTM && geojson.features?.length) {
    const firstCoord = geojson.features[0]?.geometry?.coordinates?.[0]?.[0]?.[0];
    if (firstCoord && (firstCoord > 180 || firstCoord < -180)) isUTM = true;
  }
  if (!isUTM) return geojson;

  const converted = JSON.parse(JSON.stringify(geojson));
  const convertCoords = (coords, type) => {
    if (type === "MultiPolygon") {
      return coords.map(poly => poly.map(ring => ring.map(pair => proj4("EPSG:32645", "EPSG:4326", pair))));
    } else if (type === "Polygon") {
      return coords.map(ring => ring.map(pair => proj4("EPSG:32645", "EPSG:4326", pair)));
    }
    return coords;
  };
  for (let feat of converted.features) {
    feat.geometry.coordinates = convertCoords(feat.geometry.coordinates, feat.geometry.type);
  }
  converted.crs = { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } };
  return converted;
}

function loadGeoJSONToMap(geojson, replace = true) {
  if (!geojson || !geojson.features) return;
  const wgs84 = convertToWGS84(geojson);
  currentFeatureCollection = wgs84;
  document.getElementById('geojsonExportBox').value = JSON.stringify(wgs84, null, 2);
  document.getElementById('featureCount').innerText = wgs84.features.length;

  const selector = document.getElementById('wardSelector');
  selector.innerHTML = '<option value="">-- Choose a Ward --</option>';
  wgs84.features.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.properties.WARD_NO || f.properties.ward_no || f.properties.id || Math.random();
    opt.innerText = `Ward ${opt.value} (Area: ${(f.properties.Area || f.properties.area || 0).toFixed(2)} km²)`;
    selector.appendChild(opt);
  });

  if (replace) {
    if (wardBoundaryLayer) map.removeLayer(wardBoundaryLayer);
    if (wardLabelsLayerGroup) map.removeLayer(wardLabelsLayerGroup);
    wardLabelsLayerGroup = L.layerGroup();
    renderWardLayer(wgs84);
    if (document.getElementById('toggleWards').checked) wardBoundaryLayer.addTo(map);
    if (document.getElementById('toggleLabels').checked) wardLabelsLayerGroup.addTo(map);
    setTimeout(() => zoomToAllWards(), 300);
  }
}

function renderWardLayer(data) {
  if (!data) data = currentFeatureCollection;
  if (!data) return;
  const fillOpacity = parseInt(document.getElementById('wardOpacitySlider').value) / 100;
  const colorMode = document.getElementById('mapColorMode').value;

  wardBoundaryLayer = L.geoJSON(data, {
    style: (feature) => {
      const id = feature.properties.WARD_NO || feature.properties.ward_no || 0;
      const color = colorMode === 'distinct' ? getThematicColor(id) : '#10b981';
      return { color, weight: 2, opacity: 0.85, fillColor: color, fillOpacity };
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const wardName = p.WARD_NO || p.ward_no || p.name || "Unknown";
      const areaVal = p.Area || p.area || 0;
      layer.bindPopup(`<b>Ward ${wardName}</b><br>Area: ${areaVal.toFixed(3)} km²`);
      const center = layer.getBounds().getCenter();
      const label = L.marker(center, {
        icon: L.divIcon({ className: 'bg-slate-950/80 border border-slate-700 text-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded shadow', html: `W-${wardName}`, iconSize: [35,18], iconAnchor: [17.5,9] })
      });
      label.addTo(wardLabelsLayerGroup);
      layer.on({
        mouseover: e => e.target.setStyle({ weight: 4, fillOpacity: fillOpacity + 0.2 }),
        mouseout: e => wardBoundaryLayer.resetStyle(e.target),
        click: e => {
          map.fitBounds(e.target.getBounds(), { padding: [40,40] });
          document.getElementById('wardDetailsCard').classList.remove('hidden');
          document.getElementById('detailWardNo').innerText = `Ward: ${wardName}`;
          document.getElementById('detailCity').innerText = p.City || p.city || "Uploaded";
          document.getElementById('detailArea').innerText = `${areaVal.toFixed(3)} km²`;
          document.getElementById('wardSelector').value = wardName;
        }
      });
    }
  });
}

function getThematicColor(id) {
  const palette = ['#22c55e','#3b82f6','#f43f5e','#eab308','#a855f7','#06b6d4','#f97316','#ec4899','#14b8a6','#8b5cf6'];
  return palette[Math.abs(id) % palette.length];
}

function zoomToAllWards() { if (wardBoundaryLayer) map.fitBounds(wardBoundaryLayer.getBounds(), { padding: [30,30] }); }
function changeWardOpacity(val) { document.getElementById('transparencyVal').innerText = val+"%"; if(wardBoundaryLayer) renderWardLayer(currentFeatureCollection); }
function changeColorMode() { if(wardBoundaryLayer) renderWardLayer(currentFeatureCollection); }
function toggleWardLayer(checked) { checked ? map.addLayer(wardBoundaryLayer) : map.removeLayer(wardBoundaryLayer); }
function toggleLabelLayer(checked) { checked ? map.addLayer(wardLabelsLayerGroup) : map.removeLayer(wardLabelsLayerGroup); }

function setBasemap(style) {
  Object.keys(basemapLayers).forEach(k => map.removeLayer(basemapLayers[k]));
  basemapLayers[style].addTo(map);
  ['streets','dark','satellite'].forEach(k => {
    document.getElementById(`btn-bm-${k}`).className = (k===style) ? "w-full text-left px-2 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 text-xs" : "w-full text-left px-2 py-1.5 rounded-lg text-slate-400 hover:bg-slate-900 text-xs";
  });
}

function focusSelectWard(wardNo) {
  if (!wardNo) return;
  wardBoundaryLayer.eachLayer(layer => {
    let w = layer.feature.properties.WARD_NO || layer.feature.properties.ward_no;
    if (w == wardNo) { map.fitBounds(layer.getBounds()); layer.openPopup(); }
  });
}

function copyConvertedGeoJSON() { navigator.clipboard.writeText(document.getElementById('geojsonExportBox').value); showToast("GeoJSON copied"); }
function downloadConvertedGeoJSON() { const blob = new Blob([document.getElementById('geojsonExportBox').value], {type:"application/json"}); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="uploaded_wards.geojson"; a.click(); URL.revokeObjectURL(a.href); }

function copyEmbedCode() {
  navigator.clipboard.writeText(document.documentElement.outerHTML);
  showToast("Embed code copied");
  openModal('embed-guide');
}

function showToast(msg) {
  const t=document.getElementById('toast');
  t.innerText=msg;
  t.classList.remove('translate-y-20','opacity-0');
  t.classList.add('translate-y-0','opacity-100');
  setTimeout(()=>{
    t.classList.add('translate-y-20','opacity-0');
    t.classList.remove('translate-y-0','opacity-100');
  },3000);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// File upload handling
function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'geojson' || ext === 'json') {
    const reader = new FileReader();
    reader.onload = e => { try { const geojson = JSON.parse(e.target.result); loadGeoJSONToMap(geojson, true); showToast("GeoJSON loaded"); } catch(err){ alert("Invalid GeoJSON"); } };
    reader.readAsText(file);
  } else if (ext === 'zip' || ext === 'shp') {
    const reader = new FileReader();
    reader.onload = async function(evt) {
      const arrayBuffer = evt.target.result;
      try {
        let geojson;
        if (ext === 'zip') {
          const shp = await shapefile.read(arrayBuffer);
          geojson = shp;
        } else {
          alert("Please upload a .zip containing .shp, .shx, .dbf");
          return;
        }
        loadGeoJSONToMap(geojson, true);
        showToast("Shapefile loaded & converted");
      } catch(err) { console.error(err); alert("Failed to parse shapefile. Ensure it's a valid zip with .shp, .shx, .dbf"); }
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert("Unsupported file type. Use .geojson, .json, or .zip (containing shapefile).");
  }
}

function clearUploadedLayer() {
  loadGeoJSONToMap(convertToWGS84(rawRanchiWardUTM), true);
  document.getElementById('clearUploadBtn').classList.add('hidden');
}

function setupUpload() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', (e) => { if(e.target.files[0]) handleFile(e.target.files[0]); });
}

// Initialize map and default data
window.onload = async () => {
  lucide.createIcons();

  basemapLayers.streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' });
  basemapLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CARTO' });
  basemapLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });

  map = L.map('map', { center: [23.36, 85.33], zoom: 12, layers: [basemapLayers.streets] });
  L.control.zoom({ position: 'topleft' }).addTo(map);
  map.on('mousemove', e => { document.getElementById('coordLat').innerText = e.latlng.lat.toFixed(5); document.getElementById('coordLng').innerText = e.latlng.lng.toFixed(5); });

  const defaultWgs84 = convertToWGS84(rawRanchiWardUTM);
  loadGeoJSONToMap(defaultWgs84, true);
  setupUpload();
};