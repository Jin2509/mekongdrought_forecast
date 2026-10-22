// Gộp kết quả theo đơn vị hiển thị: 1 trạm (13 tỉnh cũ) hoặc trung bình các trạm (6 tỉnh mới).
import { sriLevel } from "../api/sri.js";
import { mean } from "./format.js";

export function unitDrought(unit, forecasts, h) {
  const hs = unit.members.map((id) => forecasts[id]?.horizons[h - 1]).filter(Boolean);
  if (!hs.length) return null;
  const avg = (f) => mean(hs.map(f));
  return {
    target: hs[0].target,
    q50: avg((x) => x.q50),
    q10: avg((x) => x.q10),
    q90: avg((x) => x.q90),
    probs: {
      drought: avg((x) => x.probs.drought),
      normal: avg((x) => x.probs.normal),
      wet: avg((x) => x.probs.wet),
    },
  };
}

export function unitSalinity(unit, risk, h) {
  const rs = unit.members
    .map((id) => risk.items.find((x) => x.station === id)?.horizons[h - 1])
    .filter(Boolean);
  if (!rs.length) return null;
  const parts = {};
  for (const k of Object.keys(rs[0].parts)) parts[k] = mean(rs.map((r) => r.parts[k]));
  const sri = mean(rs.map((r) => r.sri));
  return { target: rs[0].target, sri, parts, dry: rs[0].dry, level: sriLevel(sri, rs[0].dry, risk.thresholds) };
}
