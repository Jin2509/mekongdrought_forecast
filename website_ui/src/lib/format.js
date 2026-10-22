// Nhãn, màu và định dạng dùng chung.
export const CLASS_NAMES = ["Hạn", "Bình thường", "Ẩm"];
export const CLASS_COLORS = ["#c2410c", "#a3a3a3", "#2563eb"];

export const LEVEL_NAMES = { low: "Thấp", medium: "Trung bình", high: "Cao" };
export const LEVEL_COLORS = { low: "#16a34a", medium: "#f59e0b", high: "#dc2626", off: "#cbd5e1" };

// Thang SPEI (McKee): ≤ −2 cực hạn, ≤ −1,5 hạn nặng, ≤ −1 hạn vừa, < 1 bình thường, ≥ 1 ẩm.
export const SPEI_BINS = [
  { max: -2, label: "Cực hạn (≤ −2)", color: "#7f1d1d" },
  { max: -1.5, label: "Hạn nặng (≤ −1,5)", color: "#c2410c" },
  { max: -1, label: "Hạn vừa (≤ −1)", color: "#f59e0b" },
  { max: 1, label: "Bình thường", color: "#e5e7eb" },
  { max: Infinity, label: "Ẩm (≥ 1)", color: "#60a5fa" },
];
export const speiBin = (v) => SPEI_BINS.find((b) => (b.max === 1 ? v < 1 : v <= b.max));

export const fmtMonth = (m) => (m ? `${m.slice(5)}/${m.slice(0, 4)}` : "");
export const fmtNum = (v, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(d).replace(".", ",").replace("-", "−");
export const fmtPct = (v) => `${Math.round(v * 100)}%`;

export const mean = (arr) => {
  const xs = arr.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
};

// Các đợt hạn mặn tham chiếu (roadmap mục hiện trạng) để chọn nhanh tháng phát hành.
export const EVENTS = [
  { month: "2016-01", label: "Hạn mặn 2016" },
  { month: "2020-01", label: "Hạn mặn 2020" },
  { month: "2024-02", label: "Hạn mặn 2024" },
];
