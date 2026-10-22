// Mock API — cùng chữ ký với các endpoint FastAPI ở roadmap E2.
//
// Dữ liệu LỊCH SỬ là thật (xuất từ dataset_monthly_full.csv bằng scripts/build-mock.mjs).
// DỰ BÁO, SHAP, chỉ số mô hình, khuyến nghị, chat là MẪU: một mô hình tuyến tính giả lập
// để UI có số liệu hợp lý; sẽ được thay bằng kết quả giai đoạn B, C, D.
import history from "../data/history.json";
import statsFile from "../data/stats.json";
import agri from "../data/agri.json";
import { STATIONS, STATION_BY_ID } from "../lib/stations.js";
import { SRI_LABELS, sriComponents, sriLevel } from "./sri.js";

const { months, stations: series, regional } = history;
const Z = statsFile.z;
export const SRI_THRESHOLDS = statsFile.sriThresholds;

// ------------------------------------------------------------------ tiện ích
const monthIndex = (m) => months.indexOf(m);
export const addMonths = (m, k) => {
  const [y, mo] = m.split("-").map(Number);
  const t = y * 12 + (mo - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const calMonth = (m) => Number(m.slice(5));

function zOf(id, v, i) {
  const x = series[id][v][i];
  if (x === null || x === undefined) return 0;
  const m = calMonth(months[i]) - 1;
  return (x - Z[id][v].mean[m]) / Z[id][v].std[m];
}

// CDF chuẩn (Abramowitz–Stegun 7.1.26)
function phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// ------------------------------------------------------------------ mô hình giả lập (tuyến tính)
// mu_h = base + Σ coef[f][h] · x_f ; SHAP của f = coef[f][h] · x_f (đúng với mô hình tuyến tính).
const BASE = 0.06;
const SIGMA = { 1: 0.55, 2: 0.75, 3: 0.85 };
const MODEL = [
  { f: "spei3", label: "SPEI-3 tháng t", kind: "z", coef: [0.62, 0.38, 0.2] },
  { f: "spei6", label: "SPEI-6 tháng t", kind: "z", coef: [0.1, 0.15, 0.15] },
  { f: "spei1", label: "SPEI-1 tháng t", kind: "z", coef: [0.12, 0.05, 0.02] },
  { f: "oni_lag2", label: "ONI (trễ 2 tháng)", kind: "regional", coef: [-0.1, -0.18, -0.25] },
  { f: "dmi_lag1", label: "DMI (trễ 1 tháng)", kind: "regional", coef: [-0.05, -0.08, -0.1] },
  { f: "q_TC_anom", label: "Dị thường lưu lượng Tân Châu", kind: "regional", coef: [0.08, 0.1, 0.1] },
  { f: "D", label: "Cân bằng nước P − ET0", kind: "z", coef: [0.06, 0.05, 0.03] },
  { f: "sm_0_7", label: "Dị thường ẩm đất 0–7 cm", kind: "z", coef: [0.05, 0.04, 0.03] },
  { f: "tmax_mean", label: "Tmax trung bình", kind: "z", coef: [-0.04, -0.04, -0.03] },
  { f: "easterly_wind", label: "Gió chướng", kind: "z", coef: [-0.02, -0.03, -0.03] },
];

function inputs(id, i) {
  return MODEL.map((m) => {
    const raw = m.kind === "regional" ? regional[m.f][i] : series[id][m.f][i];
    const x = m.kind === "regional" ? raw ?? 0 : zOf(id, m.f, i);
    return { ...m, raw, x };
  });
}

function predictOne(id, i, h) {
  const xs = inputs(id, i);
  const contrib = xs.map((m) => ({ feature: m.f, label: m.label, raw: m.raw, shap: m.coef[h - 1] * m.x }));
  const mu = BASE + contrib.reduce((s, c) => s + c.shap, 0);
  const sd = SIGMA[h];
  const pD = phi((-1 - mu) / sd);
  const pW = 1 - phi((1 - mu) / sd);
  return { mu, sd, contrib, probs: { drought: pD, normal: 1 - pD - pW, wet: pW } };
}

const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120));

// ------------------------------------------------------------------ endpoint
export const latestMonth = months[months.length - 1];
export const availableMonths = months.filter((m) => m >= "1997-04");

export async function getStations() {
  return delay(STATIONS.map((s) => ({ ...s, crops: agri.provinces[s.id] ?? [] })));
}

/** GET /forecast?station=&month= */
export async function getForecast({ station, month = latestMonth }) {
  const i = monthIndex(month);
  const horizons = [1, 2, 3].map((h) => {
    const { mu, sd, probs } = predictOne(station, i, h);
    const target = addMonths(month, h);
    const j = monthIndex(target);
    return {
      h, target, q50: mu, q10: mu - 1.2816 * sd, q90: mu + 1.2816 * sd, probs,
      cls: probs.drought >= Math.max(probs.normal, probs.wet) ? 0 : probs.wet > probs.normal ? 2 : 1,
      observed: j >= 0 ? series[station].spei3[j] : null,
    };
  });
  return delay({ station, issued: month, horizons, mock: true });
}

/** GET /history?station=&from=&to= */
export async function getHistory({ station, from = "1991-01", to = latestMonth }) {
  const a = Math.max(0, monthIndex(from)), b = monthIndex(to);
  const pick = (arr) => arr.slice(a, b + 1);
  const out = { station, months: months.slice(a, b + 1) };
  for (const [k, v] of Object.entries(series[station])) out[k] = pick(v);
  for (const [k, v] of Object.entries(regional)) out[k] = pick(v);
  return delay(out);
}

/** GET /salinity-risk?month= — SRI của 13 tỉnh cho h1–h3. */
export async function getSalinityRisk({ month = latestMonth }) {
  const i = monthIndex(month);
  const items = STATIONS.map((s) => ({
    station: s.id,
    horizons: [1, 2, 3].map((h) => {
      const target = addMonths(month, h);
      const { mu } = predictOne(s.id, i, h);
      const c = sriComponents({
        qTC: regional.q_TC_anom[i], spei3: mu, windZ: zOf(s.id, "easterly_wind", i),
        tideZ: zOf(s.id, "tide_amp_max", i), coastal: s.coastal, month: calMonth(target),
      });
      return { h, target, sri: c.total, parts: c.parts, factor: c.factor, dry: c.dry,
               level: sriLevel(c.total, c.dry, SRI_THRESHOLDS) };
    }),
  }));
  return delay({ month, thresholds: SRI_THRESHOLDS, labels: SRI_LABELS, items, mock: true });
}

/** GET /explain?station=&h= */
export async function getExplain({ station, h = 1, month = latestMonth }) {
  const { mu, contrib } = predictOne(station, monthIndex(month), h);
  const sorted = [...contrib].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
  return delay({ station, h, month, base: BASE, prediction: mu, values: sorted, mock: true });
}

/** GET /metrics — số liệu MẪU trên tập test 2022–2025 (số mẫu theo lớp khớp roadmap A4). */
export async function getMetrics() {
  const cm = {
    1: [[31, 10, 1], [28, 290, 57], [2, 40, 126]],
    2: [[26, 14, 2], [40, 259, 72], [4, 58, 110]],
    3: [[20, 19, 3], [52, 238, 86], [8, 70, 89]],
  };
  const horizons = [1, 2, 3].map((h) => {
    const m = cm[h];
    const recall = m.map((row, k) => row[k] / row.reduce((s, x) => s + x, 0));
    return { h, confusion: m, recall, balanced_accuracy: recall.reduce((s, x) => s + x, 0) / 3 };
  });
  const baselines = [
    { model: "Climatology", ba: [0.36, 0.36, 0.36] },
    { model: "Persistence", ba: [0.62, 0.48, 0.4] },
  ];
  return delay({ split: "test 2022-01 → 2025-09", classes: ["Hạn", "Bình thường", "Ẩm"],
                 target: 0.6, horizons, baselines, mock: true });
}

// ------------------------------------------------------------------ khuyến nghị (luật D5, bản mẫu)
const tol = agri.salinity_tolerance;
const cropName = (c) => tol[c]?.name ?? c;
const SRC = {
  tol: (c) => ({ title: `Ngưỡng chịu mặn — ${cropName(c)}`, source: "data/external/agri_profile.yaml",
                 note: "giá trị tham khảo, cần đối chiếu khuyến cáo Bộ NN&MT" }),
  season: { title: "Lịch thời vụ lúa ĐBSCL", source: "data/external/agri_profile.yaml · rice_seasons",
            note: "giá trị tham khảo" },
  qcvn: { title: "Nước sinh hoạt: clorua ≤ 250 mg/l", source: "QCVN 01-1:2018/BYT (ghi trong agri_profile.yaml)",
          note: "" },
};
const LEVEL_RANK = { low: 0, medium: 1, high: 2 };

function rules({ station, month, fc, risk }) {
  const crops = agri.provinces[station] ?? [];
  const maxLevel = risk.horizons.reduce((a, r) => (LEVEL_RANK[r.level] > LEVEL_RANK[a] ? r.level : a), "low");
  const pDrought = Math.max(...fc.horizons.map((x) => x.probs.drought));
  const pD2 = fc.horizons[1].probs.drought;
  const pWet = Math.max(...fc.horizons.map((x) => x.probs.wet));
  const m = calMonth(month);
  const lvl = { low: "Thấp", medium: "Trung bình", high: "Cao" }[maxLevel];
  const out = [];
  const add = (a) => out.push(a);

  if (maxLevel === "high" && crops.includes("durian"))
    add({ priority: 1, crop: "durian", title: "Trữ nước ngọt, dừng tưới khi độ mặn > 0,5‰",
          why: `Nguy cơ mặn ${lvl} trong 3 tháng tới; sầu riêng bắt đầu bị hại ở ${tol.durian.damage}‰.`,
          sources: [SRC.tol("durian")] });
  if (LEVEL_RANK[maxLevel] >= 1 && crops.includes("rice"))
    add({ priority: maxLevel === "high" ? 1 : 2, crop: "rice",
          title: `Vận hành cống ngăn mặn, chỉ lấy nước khi độ mặn < ${tol.rice.min_safe}‰`,
          why: `Nguy cơ mặn ${lvl}; lúa an toàn dưới ${tol.rice.min_safe}‰, bị hại từ ${tol.rice.damage}‰.`,
          sources: [SRC.tol("rice")] });
  if (maxLevel === "high" && STATION_BY_ID[station].coastal)
    add({ priority: 1, crop: "domestic", title: "Trữ nước sinh hoạt cho hộ dân vùng ven biển",
          why: "Nguy cơ mặn Cao tại tỉnh ven biển; nước sinh hoạt yêu cầu clorua ≤ 250 mg/l.",
          sources: [SRC.qcvn] });
  if (pD2 >= 0.5 && (m === 10 || m === 11) && crops.includes("rice"))
    add({ priority: 2, crop: "rice", title: "Xuống giống Đông Xuân sớm để né mặn cuối vụ",
          why: `P(Hạn) ở h2 = ${(pD2 * 100).toFixed(0)}% ≥ 50% và đang tháng ${m}.`,
          sources: [SRC.season] });
  if (pDrought >= 0.4)
    add({ priority: 2, crop: crops[0], title: "Tưới tiết kiệm (ướt khô xen kẽ), nạo vét kênh nội đồng trữ nước",
          why: `Xác suất hạn cao nhất trong 3 tháng tới là ${(pDrought * 100).toFixed(0)}%.`,
          sources: [SRC.season] });
  if (LEVEL_RANK[maxLevel] >= 1 && crops.includes("coconut"))
    add({ priority: 2, crop: "coconut", title: `Không tưới dừa bằng nước mặn > ${tol.coconut.damage}‰`,
          why: `Nguy cơ mặn ${lvl}; dừa an toàn dưới ${tol.coconut.min_safe}‰.`,
          sources: [SRC.tol("coconut")] });
  if (crops.includes("shrimp"))
    add({ priority: 3, crop: "shrimp",
          title: `Theo dõi độ mặn ao nuôi, duy trì ${tol.shrimp.optimal_low}–${tol.shrimp.optimal_high}‰`,
          why: pWet >= 0.4 ? "Khả năng mưa nhiều (ẩm) có thể làm độ mặn ao giảm đột ngột."
                            : "Theo dõi định kỳ cho tôm nước lợ.",
          sources: [SRC.tol("shrimp")] });
  if (!out.length)
    add({ priority: 3, crop: crops[0], title: "Chưa có rủi ro đáng kể — theo dõi bản tin tháng tới",
          why: `Nguy cơ mặn ${lvl}, xác suất hạn ≤ ${(pDrought * 100).toFixed(0)}%.`, sources: [] });

  return out
    .sort((a, b) => a.priority - b.priority)
    .map((a, k) => ({ id: k + 1, ...a, cropName: cropName(a.crop),
                      explanation: null /* sẽ do RAG (D3–D4) sinh, kèm trích dẫn */ }));
}

/** GET /recommendations?station=&crop= */
export async function getRecommendations({ station, month = latestMonth, crop = null }) {
  const [fc, risk] = await Promise.all([getForecast({ station, month }), getSalinityRisk({ month })]);
  let actions = rules({ station, month, fc, risk: risk.items.find((x) => x.station === station) });
  if (crop) actions = actions.filter((a) => a.crop === crop || a.crop === "domestic");
  return { station, month, crops: agri.provinces[station] ?? [], actions, mock: true };
}

/** POST /chat — trả lời mẫu, chưa nối RAG. */
export async function chat({ message, station, month = latestMonth }) {
  const fc = await getForecast({ station, month });
  const name = STATION_BY_ID[station]?.name ?? station;
  const h1 = fc.horizons[0];
  const text =
    `[Trả lời mẫu — RAG chưa kết nối] Bạn hỏi: “${message}”.\n` +
    `Tại ${name}, dự báo SPEI-3 tháng ${h1.target} khoảng ${h1.q50.toFixed(2).replace(".", ",")} ` +
    `(xác suất hạn ${(h1.probs.drought * 100).toFixed(0)}%). ` +
    "Khi có kho tài liệu (D1–D4), câu trả lời sẽ được sinh từ đoạn văn truy hồi và kèm trích dẫn.";
  return new Promise((r) => setTimeout(() => r({
    answer: text,
    sources: [{ title: "Hồ sơ nông nghiệp tỉnh", source: "data/external/agri_profile.yaml", note: "giá trị tham khảo" }],
    mock: true,
  }), 500));
}
