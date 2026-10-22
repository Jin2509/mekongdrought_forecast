// Option ECharts cho 6 đồ thị (roadmap E3).
import { CLASS_COLORS, CLASS_NAMES, LEVEL_COLORS, fmtMonth, fmtNum } from "../../lib/format.js";

const AXIS = { axisLine: { lineStyle: { color: "#94a3b8" } }, axisLabel: { color: "#475569" } };
const GRID = { left: 48, right: 16, top: 36, bottom: 40 };
const num2 = (v) => (v === null || v === undefined ? "—" : fmtNum(v));

// 1. Chuỗi SPEI-3 lịch sử nối với dự báo h1–h3 và dải q0,1–q0,9
export function speiOption({ months, spei3, fc }) {
  const hz = fc.horizons;
  const x = [...months, ...hz.map((h) => h.target)];
  const n = months.length;
  const pad = (arr, at) => x.map((_, i) => (i >= at && i - at < arr.length ? arr[i - at] : null));
  const last = spei3[n - 1];
  const fcLine = pad([last, ...hz.map((h) => h.q50)], n - 1);
  const lower = pad([last, ...hz.map((h) => h.q10)], n - 1);
  const width = pad([0, ...hz.map((h) => h.q90 - h.q10)], n - 1);
  const observed = pad(hz.map((h) => h.observed), n);
  const hasObs = hz.some((h) => h.observed !== null);

  return {
    tooltip: { trigger: "axis", valueFormatter: num2 },
    legend: { top: 0, data: ["SPEI-3 lịch sử", "Dự báo (trung vị)", "Khoảng q0,1–q0,9", ...(hasObs ? ["Thực đo"] : [])] },
    grid: GRID,
    xAxis: { type: "category", data: x.map(fmtMonth), boundaryGap: false, ...AXIS },
    yAxis: { type: "value", min: -3, max: 3, ...AXIS, splitLine: { lineStyle: { color: "#eef2f7" } } },
    dataZoom: [{ type: "inside", startValue: Math.max(0, n - 36) }],
    series: [
      { name: "SPEI-3 lịch sử", type: "line", data: [...spei3, null, null, null], showSymbol: false,
        lineStyle: { width: 2, color: "#334155" }, itemStyle: { color: "#334155" },
        markLine: { symbol: "none", silent: true, label: { formatter: "{b}", position: "insideEndTop" },
          data: [{ yAxis: -1, name: "Hạn ≤ −1", lineStyle: { color: CLASS_COLORS[0], type: "dashed" } },
                 { yAxis: 1, name: "Ẩm ≥ 1", lineStyle: { color: CLASS_COLORS[2], type: "dashed" } }] } },
      // dải = cận dưới (ẩn) + độ rộng xếp chồng; stackStrategy "all" để cộng cả khi cận dưới âm
      { name: "band-lo", type: "line", data: lower, stack: "band", stackStrategy: "all", symbol: "none",
        lineStyle: { opacity: 0 }, tooltip: { show: false } },
      { name: "Khoảng q0,1–q0,9", type: "line", data: width, stack: "band", stackStrategy: "all", symbol: "none",
        lineStyle: { opacity: 0 }, areaStyle: { color: "rgba(234,88,12,0.18)" }, itemStyle: { color: "rgba(234,88,12,0.4)" },
        tooltip: { show: false } },
      { name: "Dự báo (trung vị)", type: "line", data: fcLine, symbolSize: 7,
        lineStyle: { type: "dashed", width: 2, color: "#ea580c" }, itemStyle: { color: "#ea580c" } },
      ...(hasObs ? [{ name: "Thực đo", type: "scatter", data: observed, symbol: "diamond", symbolSize: 10,
                      itemStyle: { color: "#0f766e" } }] : []),
    ],
  };
}

// 2. Xác suất 3 lớp hạn theo horizon
export function probOption(fc) {
  const keys = ["drought", "normal", "wet"];
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${Math.round(v)}%` },
    legend: { top: 0 },
    grid: { ...GRID, left: 40 },
    xAxis: { type: "category", data: fc.horizons.map((h) => `h${h.h} · ${fmtMonth(h.target)}`), ...AXIS },
    yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", color: "#475569" } },
    series: keys.map((k, i) => ({
      name: CLASS_NAMES[i], type: "bar", stack: "p", barWidth: "45%",
      itemStyle: { color: CLASS_COLORS[i] },
      label: { show: true, formatter: (p) => (p.value >= 8 ? `${Math.round(p.value)}%` : ""), color: i === 1 ? "#1f2937" : "#fff" },
      data: fc.horizons.map((h) => h.probs[k] * 100),
    })),
  };
}

// 3. SHAP: đóng góp của từng đặc trưng vào SPEI-3 dự báo
export function shapOption(ex) {
  const vals = [...ex.values].slice(0, 10).reverse();
  const lim = Math.max(0.05, ...vals.map((v) => Math.abs(v.shap))) * 1.45;
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps) => {
        const v = vals[ps[0].dataIndex];
        return `${v.label}<br/>giá trị: ${num2(v.raw)}<br/>SHAP: <b>${num2(v.shap)}</b>`;
      } },
    grid: { left: 8, right: 12, top: 30, bottom: 24, containLabel: true },
    title: { text: `gốc ${fmtNum(ex.base)} → dự báo ${fmtNum(ex.prediction)}`, right: 8, top: 0,
             textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" } },
    xAxis: { type: "value", min: -lim, max: lim, splitNumber: 4, ...AXIS,
             axisLabel: { color: "#475569", formatter: (v) => fmtNum(v, 1) },
             splitLine: { lineStyle: { color: "#eef2f7" } } },
    yAxis: { type: "category", data: vals.map((v) => v.label), ...AXIS },
    series: [{
      type: "bar", barWidth: "60%",
      data: vals.map((v) => ({
        value: v.shap,
        itemStyle: { color: v.shap < 0 ? CLASS_COLORS[0] : CLASS_COLORS[2] },
        label: { position: v.shap < 0 ? "left" : "right" },
      })),
      label: { show: true, formatter: (p) => fmtNum(p.value), fontSize: 11 },
    }],
  };
}

// 4a. Ma trận nhầm lẫn (1 horizon)
export function confusionOption(hm, classes) {
  const data = [];
  const rowSum = hm.confusion.map((r) => r.reduce((s, x) => s + x, 0));
  hm.confusion.forEach((row, i) => row.forEach((v, j) => data.push([j, i, v, v / rowSum[i]])));
  return {
    title: { text: `h${hm.h} · balanced acc. ${fmtNum(hm.balanced_accuracy)}`, left: "center", top: 0,
             textStyle: { fontSize: 13 } },
    tooltip: { formatter: (p) => `Thật: ${classes[p.value[1]]}<br/>Dự đoán: ${classes[p.value[0]]}<br/>`
      + `${p.value[2]} mẫu (${Math.round(p.value[3] * 100)}% của hàng)` },
    grid: { left: 92, right: 10, top: 30, bottom: 52 },
    xAxis: { type: "category", data: classes, name: "Dự đoán", nameLocation: "middle", nameGap: 32, ...AXIS },
    yAxis: { type: "category", data: classes, name: "Thật", nameLocation: "middle", nameGap: 78, inverse: true, ...AXIS },
    visualMap: { show: false, min: 0, max: 1, dimension: 3, inRange: { color: ["#f8fafc", "#1e40af"] } },
    series: [{ type: "heatmap", data,
               label: { show: true, formatter: (p) => p.value[2], color: "#0f172a", fontSize: 13 } }],
  };
}

// 4b. Balanced accuracy theo horizon so với baseline và mốc mục tiêu
export function accuracyOption(metrics) {
  const x = metrics.horizons.map((h) => `h${h.h}`);
  return {
    tooltip: { trigger: "axis", valueFormatter: num2 },
    legend: { top: 0 },
    grid: GRID,
    xAxis: { type: "category", data: x, ...AXIS },
    yAxis: { type: "value", min: 0, max: 1, ...AXIS, splitLine: { lineStyle: { color: "#eef2f7" } } },
    series: [
      { name: "Mô hình chọn", type: "bar", barWidth: "22%", itemStyle: { color: "#1e40af" },
        data: metrics.horizons.map((h) => h.balanced_accuracy),
        label: { show: true, position: "top", formatter: (p) => fmtNum(p.value) },
        markLine: { symbol: "none", data: [{ yAxis: metrics.target, name: "Mục tiêu" }],
                    lineStyle: { color: "#dc2626", type: "dashed" },
                    label: { formatter: `mục tiêu ${fmtNum(metrics.target)}`, position: "insideEndTop" } } },
      ...metrics.baselines.map((b, i) => ({
        name: b.model, type: "bar", barWidth: "22%", data: b.ba,
        itemStyle: { color: ["#94a3b8", "#cbd5e1"][i] },
      })),
    ],
  };
}

// 5. Dị thường lưu lượng Tân Châu / Kratie
export function flowOption(h) {
  return {
    tooltip: { trigger: "axis", valueFormatter: num2 },
    legend: { top: 0 },
    grid: GRID,
    xAxis: { type: "category", data: h.months.map(fmtMonth), boundaryGap: false, ...AXIS },
    yAxis: { type: "value", ...AXIS, splitLine: { lineStyle: { color: "#eef2f7" } } },
    dataZoom: [{ type: "inside" }],
    series: [
      { name: "Tân Châu", type: "line", showSymbol: false, data: h.q_TC_anom, itemStyle: { color: "#0891b2" },
        areaStyle: { opacity: 0.08 },
        markLine: { symbol: "none", silent: true, label: { show: false },
                    data: [{ yAxis: 0 }], lineStyle: { color: "#64748b" } } },
      { name: "Kratie", type: "line", showSymbol: false, data: h.q_KR_anom, itemStyle: { color: "#7c3aed" } },
    ],
  };
}

// 6a. Đồng hồ SRI
export function sriGaugeOption(s, th) {
  const min = -1.5, max = 2.5;
  const frac = (v) => Math.min(1, Math.max(0, (v - min) / (max - min)));
  return {
    series: [{
      type: "gauge", min, max, splitNumber: 4, startAngle: 200, endAngle: -20, radius: "95%", center: ["50%", "62%"],
      axisLine: { lineStyle: { width: 16, color: [
        [frac(th.p60), LEVEL_COLORS.low], [frac(th.p85), LEVEL_COLORS.medium], [1, LEVEL_COLORS.high],
      ] } },
      pointer: { width: 5, itemStyle: { color: "#0f172a" } },
      axisTick: { show: false }, splitLine: { length: 10, lineStyle: { color: "#fff", width: 2 } },
      axisLabel: { distance: 20, color: "#64748b", fontSize: 10, formatter: (v) => fmtNum(v, 1) },
      detail: { valueAnimation: true, offsetCenter: [0, "38%"], fontSize: 22,
                formatter: (v) => (s.dry ? fmtNum(v) : "ngoài mùa khô"), color: "#0f172a" },
      title: { offsetCenter: [0, "64%"], fontSize: 12, color: "#475569" },
      data: [{ value: s.dry ? s.sri : 0, name: `SRI ${fmtMonth(s.target)}` }],
    }],
  };
}

// 6b. Thành phần đóng góp vào SRI
export function sriPartsOption(s, labels) {
  const keys = Object.keys(s.parts);
  const lim = Math.max(0.1, ...keys.map((k) => Math.abs(s.parts[k]))) * 1.5;
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: num2 },
    grid: { left: 8, right: 12, top: 10, bottom: 24, containLabel: true },
    xAxis: { type: "value", min: -lim, max: lim, splitNumber: 2, ...AXIS,
             axisLabel: { color: "#475569", formatter: (v) => fmtNum(v, 1) },
             splitLine: { lineStyle: { color: "#eef2f7" } } },
    yAxis: { type: "category", data: keys.map((k) => labels[k]), inverse: true, ...AXIS },
    series: [{ type: "bar", barWidth: "55%",
      data: keys.map((k) => ({ value: s.parts[k], itemStyle: { color: s.parts[k] >= 0 ? "#dc2626" : "#16a34a" },
                              label: { position: s.parts[k] < 0 ? "left" : "right" } })),
      label: { show: true, formatter: (p) => fmtNum(p.value) } }],
  };
}
