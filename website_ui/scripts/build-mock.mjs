// Xuất dữ liệu THẬT của project sang JSON cho UI (chỉ đọc, không sửa file nào ngoài website_ui).
//
// Chạy: node scripts/build-mock.mjs
// Đọc:  ../data/processed/dataset_monthly_full.csv, ../data/external/agri_profile.yaml
// Ghi:  src/data/history.json  chuỗi tháng theo trạm + chuỗi chung (lưu lượng, ONI, DMI)
//       src/data/stats.json    mean/std theo (trạm, tháng) trên train, ngưỡng SRI p60/p85
//       src/data/agri.json     ngưỡng chịu mặn, lịch thời vụ, cây/con theo tỉnh
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { sriComponents } from "../src/api/sri.js";

const ROOT = new URL("../../", import.meta.url);
const OUT = new URL("../src/data/", import.meta.url);
const TRAIN_END = "2018-09";

const STATION_VARS = ["spei1", "spei3", "spei6", "spei12", "precip_sum", "et0_sum", "D",
                      "sm_0_7", "tmax_mean", "easterly_wind", "tide_amp_max"];
const REGIONAL_VARS = ["q_TC_anom", "q_KR_anom", "oni_lag2", "dmi_lag1"];
const Z_VARS = ["spei1", "spei3", "spei6", "precip_sum", "et0_sum", "D", "sm_0_7",
                "tmax_mean", "easterly_wind", "tide_amp_max"];

// ------------------------------------------------------------------ đọc CSV
const text = readFileSync(new URL("data/processed/dataset_monthly_full.csv", ROOT), "utf-8");
const [header, ...lines] = text.trim().split("\n");
const cols = header.split(",");
const rows = lines.map((l) => {
  const v = l.split(",");
  return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
});
const num = (x) => (x === "" || x === undefined ? null : Number(x));
const r3 = (x) => (x === null || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000);

const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
const idx = Object.fromEntries(months.map((m, i) => [m, i]));
const stationIds = [...new Set(rows.map((r) => r.station))].sort();

const stations = {};
for (const id of stationIds) {
  stations[id] = Object.fromEntries(STATION_VARS.map((v) => [v, Array(months.length).fill(null)]));
}
const regional = Object.fromEntries(REGIONAL_VARS.map((v) => [v, Array(months.length).fill(null)]));
for (const r of rows) {
  const i = idx[r.date.slice(0, 7)];
  for (const v of STATION_VARS) stations[r.station][v][i] = r3(num(r[v]));
  for (const v of REGIONAL_VARS) if (regional[v][i] === null) regional[v][i] = r3(num(r[v]));
}

// ------------------------------------------------------------------ thống kê (trạm, tháng) trên train
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const stats = {};
for (const id of stationIds) {
  stats[id] = {};
  for (const v of Z_VARS) {
    const mu = [], sd = [];
    for (let m = 1; m <= 12; m++) {
      const vals = months
        .map((mo, i) => [mo, stations[id][v][i]])
        .filter(([mo, x]) => mo <= TRAIN_END && Number(mo.slice(5)) === m && x !== null)
        .map(([, x]) => x);
      mu.push(r3(mean(vals)));
      sd.push(r3(std(vals) || 1));
    }
    stats[id][v] = { mean: mu, std: sd };
  }
}
const z = (id, v, i) => {
  const x = stations[id][v][i];
  if (x === null) return null;
  const m = Number(months[i].slice(5)) - 1;
  return (x - stats[id][v].mean[m]) / stats[id][v].std[m];
};

// ------------------------------------------------------------------ ngưỡng SRI (mùa khô, train)
const coastal = Object.fromEntries(rows.map((r) => [r.station, Number(r.coastal)]));
const sriTrain = [];
months.forEach((mo, i) => {
  const month = Number(mo.slice(5));
  if (mo > TRAIN_END || (month >= 6 && month <= 11)) return;
  for (const id of stationIds) {
    const spei3 = stations[id].spei3[i];
    if (spei3 === null || regional.q_TC_anom[i] === null) continue;
    const { total } = sriComponents({
      qTC: regional.q_TC_anom[i], spei3, windZ: z(id, "easterly_wind", i),
      tideZ: z(id, "tide_amp_max", i), coastal: coastal[id], month,
    });
    sriTrain.push(total);
  }
});
sriTrain.sort((a, b) => a - b);
const q = (p) => r3(sriTrain[Math.floor(p * (sriTrain.length - 1))]);
const sriThresholds = { p60: q(0.6), p85: q(0.85), n: sriTrain.length };

// ------------------------------------------------------------------ hồ sơ nông nghiệp
const agri = YAML.parse(readFileSync(new URL("data/external/agri_profile.yaml", ROOT), "utf-8"));

writeFileSync(new URL("history.json", OUT), JSON.stringify({ months, stations, regional }));
writeFileSync(new URL("stats.json", OUT), JSON.stringify({ trainEnd: TRAIN_END, z: stats, sriThresholds }));
writeFileSync(new URL("agri.json", OUT), JSON.stringify({
  salinity_tolerance: agri.salinity_tolerance,
  rice_seasons: agri.rice_seasons,
  provinces: agri.provinces,
}));
console.log(`đã ghi history.json (${months.length} tháng × ${stationIds.length} trạm), stats.json `
  + `(SRI p60=${sriThresholds.p60}, p85=${sriThresholds.p85}, n=${sriThresholds.n}), agri.json`);
