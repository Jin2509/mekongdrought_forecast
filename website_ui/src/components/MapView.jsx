import { Fragment, useEffect } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Polygon, Rectangle, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import geo13 from "../data/geo_13.json";
import geo6 from "../data/geo_6.json";
import { unitDrought, unitSalinity } from "../lib/aggregate.js";
import {
  LEVEL_COLORS, LEVEL_NAMES, SPEI_BINS, fmtMonth, fmtNum, fmtPct, speiBin,
} from "../lib/format.js";
import { unitsFor } from "../lib/stations.js";

const BOUNDS = [[8.4, 104.3], [11.2, 107.0]];
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const VN_BOUNDS = [[7.0, 102.1], [23.4, 117.3]];

// Quần đảo Hoàng Sa và Trường Sa của Việt Nam: vùng bao (hình elip); nhãn đặt ngay trên mép bắc của vùng bao.
function ellipse([lat, lng], rLat, rLng, n = 36) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [lat + rLat * Math.sin(a), lng + rLng * Math.cos(a)];
  });
}
const ISLANDS = [
  { id: "hs", name: "Quần đảo Hoàng Sa", short: "QĐ. Hoàng Sa", center: [17.3, 111.95], ring: ellipse([16.45, 111.95], 0.85, 1.15) },
  { id: "ts", name: "Quần đảo Trường Sa", short: "QĐ. Trường Sa", center: [11.9, 114.2], ring: ellipse([9.6, 114.2], 2.3, 2.9) },
];
const islandIcon = (isl, small) => L.divIcon({
  className: `island-label${small ? " small" : ""}`,
  html: `<span>${small ? isl.short : isl.name}<br/><em>(Việt Nam)</em></span>`,
  iconSize: [0, 0],
});
const ISLAND_ICONS = { big: ISLANDS.map((i) => islandIcon(i)), small: ISLANDS.map((i) => islandIcon(i, true)) };
const ISLAND_STYLE = { color: "#0f4c5c", weight: 1.2, dashArray: "4 3", fillColor: "#0f4c5c", fillOpacity: 0.06 };

function Islands({ small }) {
  return ISLANDS.map((isl, k) => (
    <Fragment key={isl.id}>
      <Polygon positions={isl.ring} pathOptions={ISLAND_STYLE} interactive={false} />
      <Marker position={isl.center} icon={ISLAND_ICONS[small ? "small" : "big"][k]} interactive={false} keyboard={false} />
    </Fragment>
  ));
}

// Khung bản đồ phụ có kích thước sau lần render đầu -> căn lại để luôn thấy đủ hai quần đảo.
function FitVN() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(VN_BOUNDS, { padding: [2, 2] });
    }, 0);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// Bản đồ phụ: toàn lãnh thổ Việt Nam kèm hai quần đảo, khung cam là vùng ĐBSCL của bản đồ chính.
function Inset() {
  return (
    <div className="inset" aria-label="Bản đồ Việt Nam và các quần đảo Hoàng Sa, Trường Sa">
      <MapContainer bounds={VN_BOUNDS} zoomControl={false} attributionControl={false} dragging={false}
                    scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false}
                    keyboard={false} zoomSnap={0.1} className="inset-map">
        <FitVN />
        <TileLayer url={TILE_URL} maxZoom={16} />
        <Islands small />
        <Rectangle bounds={BOUNDS} pathOptions={{ color: "#ea580c", weight: 1.5, fillOpacity: 0.1 }} interactive={false} />
      </MapContainer>
      <span className="inset-title">Việt Nam</span>
    </div>
  );
}

// Tâm diện tích của vòng ngoài lớn nhất, dùng để đặt nhãn tên tỉnh.
function labelPoint(geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best = null;
  for (const [ring] of polys) {
    let a = 0, x = 0, y = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f;
    }
    if (!best || Math.abs(a) > best.a) best = { a: Math.abs(a), lat: y / (3 * a), lng: x / (3 * a) };
  }
  return [best.lat, best.lng];
}

const LABELS = Object.fromEntries([["13", geo13], ["6", geo6]].map(([lv, g]) => [
  lv,
  g.features.map((f) => ({
    id: f.properties.id,
    pos: labelPoint(f.geometry),
    icon: L.divIcon({ className: "prov-label", html: `<span>${f.properties.name}</span>`, iconSize: [0, 0] }),
  })),
]));

function unitStyle(mode, d, s, selected) {
  let fill = LEVEL_COLORS.off;
  if (mode === "drought" && d) fill = speiBin(d.q50).color;
  if (mode === "salinity" && s) fill = s.dry ? LEVEL_COLORS[s.level] : LEVEL_COLORS.off;
  return {
    fillColor: fill,
    fillOpacity: 0.78,
    color: selected ? "#0f172a" : "#ffffff",
    weight: selected ? 3 : 1.2,
  };
}

function tooltip(name, mode, d, s) {
  if (mode === "drought" && d)
    return `<b>${name}</b><br/>SPEI-3 dự báo ${fmtMonth(d.target)}: <b>${fmtNum(d.q50)}</b>`
      + `<br/>P(Hạn) ${fmtPct(d.probs.drought)} · P(Ẩm) ${fmtPct(d.probs.wet)}`;
  if (mode === "salinity" && s)
    return `<b>${name}</b><br/>Nguy cơ mặn ${fmtMonth(s.target)}: `
      + `<b>${s.dry ? LEVEL_NAMES[s.level] : "ngoài mùa khô"}</b><br/>SRI ${fmtNum(s.sri)}`;
  return `<b>${name}</b>`;
}

export default function MapView({
  level, setLevel, mode, setMode, horizon, setHorizon, forecasts, risk, selected, onSelect, issued,
}) {
  const geo = level === "13" ? geo13 : geo6;
  const units = Object.fromEntries(unitsFor(level).map((u) => [u.id, u]));
  const ready = forecasts && risk;
  const values = {};
  if (ready)
    for (const u of Object.values(units))
      values[u.id] = { d: unitDrought(u, forecasts, horizon), s: unitSalinity(u, risk, horizon) };

  const target = ready ? values[Object.keys(values)[0]]?.d?.target : null;

  return (
    <div className="map-wrap">
      <div className="map-controls">
        <div className="seg">
          <button className={mode === "drought" ? "on" : ""} onClick={() => setMode("drought")}>Mức hạn</button>
          <button className={mode === "salinity" ? "on" : ""} onClick={() => setMode("salinity")}>Nguy cơ mặn</button>
        </div>
        <div className="seg">
          <button className={level === "13" ? "on" : ""} onClick={() => setLevel("13")}>13 tỉnh (cũ)</button>
          <button className={level === "6" ? "on" : ""} onClick={() => setLevel("6")}>6 tỉnh/thành (2025)</button>
        </div>
        <label className="slider">
          <span>Dự báo trước <b>{horizon}</b> tháng {target && <>→ {fmtMonth(target)}</>}</span>
          <input type="range" min="1" max="3" step="1" value={horizon}
                 onChange={(e) => setHorizon(Number(e.target.value))} />
          <span className="ticks"><i>h1</i><i>h2</i><i>h3</i></span>
        </label>
      </div>

      <div className="map-area">
      <MapContainer bounds={BOUNDS} className="map" scrollWheelZoom zoomSnap={0.25}>
        <TileLayer
          attribution="Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          url={TILE_URL}
          maxZoom={16}
        />
        {ready && (
          <GeoJSON
            key={`${level}-${mode}-${horizon}-${issued}-${selected}`}
            data={geo}
            style={(f) => unitStyle(mode, values[f.properties.id]?.d, values[f.properties.id]?.s,
                                   f.properties.id === selected)}
            onEachFeature={(f, layer) => {
              const v = values[f.properties.id] ?? {};
              layer.bindTooltip(tooltip(f.properties.name, mode, v.d, v.s), { sticky: true });
              layer.on({
                click: () => onSelect(f.properties.id),
                mouseover: () => layer.setStyle({ weight: 3, color: "#334155" }),
                mouseout: () => layer.setStyle(unitStyle(mode, v.d, v.s, f.properties.id === selected)),
              });
            }}
          />
        )}
        <Islands />
        {LABELS[level].map((l) => (
          <Marker key={`${level}-${l.id}`} position={l.pos} icon={l.icon} interactive={false} keyboard={false} />
        ))}
      </MapContainer>
      <Inset />
      </div>

      <div className="legend">
        {mode === "drought"
          ? SPEI_BINS.map((b) => (
              <span key={b.label}><i style={{ background: b.color }} />{b.label}</span>
            ))
          : ["low", "medium", "high"].map((k) => (
              <span key={k}><i style={{ background: LEVEL_COLORS[k] }} />{LEVEL_NAMES[k]}</span>
            )).concat(<span key="off"><i style={{ background: LEVEL_COLORS.off }} />Ngoài mùa khô</span>)}
      </div>
      {level === "6" && (
        <p className="note">Giá trị 6 tỉnh/thành = trung bình các trạm cùng <code>province_2025</code>.
          Tây Ninh mới chỉ có trạm Long An cũ.</p>
      )}
    </div>
  );
}
