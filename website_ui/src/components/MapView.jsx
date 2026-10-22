import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import geo13 from "../data/geo_13.json";
import geo6 from "../data/geo_6.json";
import { unitDrought, unitSalinity } from "../lib/aggregate.js";
import {
  LEVEL_COLORS, LEVEL_NAMES, SPEI_BINS, fmtMonth, fmtNum, fmtPct, speiBin,
} from "../lib/format.js";
import { unitsFor } from "../lib/stations.js";

const BOUNDS = [[8.4, 104.3], [11.2, 107.0]];

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

      <MapContainer bounds={BOUNDS} className="map" scrollWheelZoom zoomSnap={0.25}>
        <TileLayer
          attribution="Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
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
      </MapContainer>

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
