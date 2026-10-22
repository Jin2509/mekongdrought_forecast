// Dựng GeoJSON 13 tỉnh (địa giới cũ) và 6 tỉnh/thành sau sáp nhập 2025 cho bản đồ.
//
// Chạy: node scripts/build-geo.mjs <geoBoundaries-VNM-ADM1_simplified.geojson>
// Nguồn: geoBoundaries gbOpen VNM ADM1 (địa giới 2008, 63 tỉnh).
// Đầu ra: src/data/geo_13.json, src/data/geo_6.json
import { readFileSync, writeFileSync } from "node:fs";
import { featureCollection } from "@turf/helpers";
import { union } from "@turf/union";
import { STATIONS } from "../src/lib/stations.js";

const src = process.argv[2];
if (!src) {
  console.error("thiếu đường dẫn GeoJSON geoBoundaries ADM1");
  process.exit(1);
}

const norm = (s) => s.normalize("NFC").trim();
const round = (coords) =>
  Array.isArray(coords[0]) ? coords.map(round) : coords.map((v) => Math.round(v * 1e4) / 1e4);

const all = JSON.parse(readFileSync(src, "utf-8")).features;
const byName = new Map(all.map((f) => [norm(f.properties.shapeName), f]));

const old = STATIONS.map((s) => {
  const f = byName.get(norm(s.name));
  if (!f) throw new Error(`không thấy tỉnh ${s.name} trong GeoJSON`);
  return {
    type: "Feature",
    properties: { id: s.id, name: s.name, unit: s.id },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  };
});

const groups = [...new Set(STATIONS.map((s) => s.province2025))];
const merged = groups.map((g) => {
  const members = old.filter((f) => STATIONS.find((s) => s.id === f.properties.id).province2025 === g);
  const geom = members.length > 1 ? union(featureCollection(members)).geometry : members[0].geometry;
  return {
    type: "Feature",
    properties: { id: g, name: g, unit: g, members: members.map((f) => f.properties.id) },
    geometry: { type: geom.type, coordinates: round(geom.coordinates) },
  };
});

const out = new URL("../src/data/", import.meta.url);
writeFileSync(new URL("geo_13.json", out), JSON.stringify(featureCollection(old)));
writeFileSync(new URL("geo_6.json", out), JSON.stringify(featureCollection(merged)));
console.log(`đã ghi geo_13.json (${old.length} tỉnh), geo_6.json (${merged.length} tỉnh/thành)`);
