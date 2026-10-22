// Chỉ số rủi ro mặn theo luật (roadmap C3). Dùng chung cho script dựng ngưỡng và lớp mock API.
//
// SRI = hệ_số_vùng × [0,4·(−z(q_TC_anom)) + 0,3·(−SPEI3) + 0,2·z(easterly_wind) + 0,1·z(tide_amp_max)]
// hệ_số_vùng = 1 (ven biển) | 0,5 (nội đồng); SRI = 0 ngoài mùa khô (tháng 6–11).
export const SRI_WEIGHTS = { flow: 0.4, drought: 0.3, wind: 0.2, tide: 0.1 };

export const SRI_LABELS = {
  flow: "Lưu lượng Tân Châu thấp",
  drought: "Hạn tại chỗ (SPEI-3)",
  wind: "Gió chướng",
  tide: "Triều cường",
};

export const isWetSeason = (month) => month >= 6 && month <= 11;

export function sriComponents({ qTC, spei3, windZ, tideZ, coastal, month }) {
  const factor = coastal ? 1 : 0.5;
  const dry = !isWetSeason(month);
  const k = dry ? factor : 0;
  const parts = {
    flow: k * SRI_WEIGHTS.flow * -(qTC ?? 0),
    drought: k * SRI_WEIGHTS.drought * -(spei3 ?? 0),
    wind: k * SRI_WEIGHTS.wind * (windZ ?? 0),
    tide: k * SRI_WEIGHTS.tide * (tideZ ?? 0),
  };
  const total = parts.flow + parts.drought + parts.wind + parts.tide;
  return { parts, total, factor, dry };
}

export function sriLevel(total, dry, thresholds) {
  if (!dry) return "low";
  if (total > thresholds.p85) return "high";
  if (total >= thresholds.p60) return "medium";
  return "low";
}
