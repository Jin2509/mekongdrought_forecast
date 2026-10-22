import { useMemo } from "react";
import { addMonths, api } from "../api/index.js";
import { unitDrought, unitSalinity } from "../lib/aggregate.js";
import { CLASS_COLORS, LEVEL_COLORS, LEVEL_NAMES, fmtMonth, fmtNum, fmtPct, mean, speiBin } from "../lib/format.js";
import { STATION_BY_ID } from "../lib/stations.js";
import useAsync from "../lib/useAsync.js";
import EChart from "./EChart.jsx";
import {
  flowOption, probOption, shapOption, speiOption, sriGaugeOption, sriPartsOption,
} from "./charts/options.js";

const HIST_MONTHS = 60;

function Card({ n, title, sub, children }) {
  return (
    <section className="card">
      <header>
        <span className="num">{n}</span>
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
      </header>
      {children}
    </section>
  );
}

export default function DetailPanel({ unit, issued, horizon, mode, forecasts, risk, onAdvice, onClose }) {
  const members = unit.members;
  const from = addMonths(issued, -HIST_MONTHS + 1);

  const hist = useAsync(
    () => Promise.all(members.map((id) => api.getHistory({ station: id, from, to: issued }))),
    [members.join(), issued],
  );
  const explain = useAsync(
    () => Promise.all(members.map((id) => api.getExplain({ station: id, h: horizon, month: issued }))),
    [members.join(), issued, horizon],
  );

  // Dự báo của đơn vị = trung bình các trạm thành viên
  const fc = useMemo(() => ({
    horizons: [1, 2, 3].map((h) => ({
      h, ...unitDrought(unit, forecasts, h),
      observed: mean(members.map((id) => forecasts[id].horizons[h - 1].observed)),
    })),
  }), [unit, forecasts, members]);

  const sal = unitSalinity(unit, risk, horizon);
  const d = fc.horizons[horizon - 1];

  const spei = useMemo(() => {
    if (!hist.data) return null;
    const h0 = hist.data[0];
    return { months: h0.months, spei3: h0.months.map((_, i) => mean(hist.data.map((h) => h.spei3[i]))) };
  }, [hist.data]);

  const shap = useMemo(() => {
    if (!explain.data) return null;
    const e0 = explain.data[0];
    const values = e0.values.map((v) => ({
      ...v,
      shap: mean(explain.data.map((e) => e.values.find((x) => x.feature === v.feature).shap)),
      raw: members.length > 1 ? null : v.raw,
    })).sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
    return { base: e0.base, prediction: mean(explain.data.map((e) => e.prediction)), values };
  }, [explain.data, members.length]);

  const stationNames = members.map((id) => STATION_BY_ID[id].name).join(", ");
  const coastal = members.some((id) => STATION_BY_ID[id].coastal);

  const drought = (
    <>
      <Card n="1" title="SPEI-3: lịch sử và dự báo h1–h3"
            sub="Đường nét đứt: trung vị dự báo; vùng cam: khoảng q0,1–q0,9; ◆ thực đo (khi đã có số liệu).">
        {spei ? <EChart option={speiOption({ ...spei, fc })} height={280} /> : <div className="skeleton" />}
      </Card>
      <Card n="2" title="Xác suất 3 lớp hạn">
        <EChart option={probOption(fc)} height={230} />
      </Card>
      <Card n="3" title={`SHAP — h${horizon}`} sub="Đóng góp vào SPEI-3 dự báo. Đỏ: kéo về phía hạn; xanh: kéo về phía ẩm.">
        {shap ? <EChart option={shapOption(shap)} height={290} /> : <div className="skeleton" />}
      </Card>
    </>
  );

  const salinity = (
    <>
      <div className="row2">
        <Card n="6" title={`Chỉ số rủi ro mặn (SRI) — h${horizon}`}
              sub={`Ngưỡng: p60 = ${fmtNum(risk.thresholds.p60)}, p85 = ${fmtNum(risk.thresholds.p85)} (mùa khô, train)`}>
          <EChart option={sriGaugeOption(sal, risk.thresholds)} height={200} />
          <EChart option={sriPartsOption(sal, risk.labels)} height={150} />
        </Card>
        <Card n="5" title="Dị thường lưu lượng Tân Châu / Kratie" sub={`Dị thường chuẩn hóa theo tháng, ${HIST_MONTHS} tháng đến ${fmtMonth(issued)}`}>
          {hist.data ? <EChart option={flowOption(hist.data[0])} height={350} /> : <div className="skeleton" />}
        </Card>
      </div>
    </>
  );

  return (
    <aside className="panel">
      <div className="panel-head">
        <div>
          <h2>{unit.name}</h2>
          <p className="muted">
            {unit.id === members[0] ? `Trạm ${unit.id}` : `Gồm trạm: ${stationNames}`} · {coastal ? "có vùng ven biển" : "nội đồng"}
            {" "}· phát hành {fmtMonth(issued)}
          </p>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Đóng">✕</button>
      </div>

      <div className="chips">
        <span className="chip" style={{ borderColor: speiBin(d.q50).color }}>
          SPEI-3 {fmtMonth(d.target)}: <b>{fmtNum(d.q50)}</b> ({speiBin(d.q50).label})
        </span>
        <span className="chip" style={{ borderColor: CLASS_COLORS[0] }}>P(Hạn) <b>{fmtPct(d.probs.drought)}</b></span>
        <span className="chip" style={{ borderColor: sal.dry ? LEVEL_COLORS[sal.level] : LEVEL_COLORS.off }}>
          Mặn: <b>{sal.dry ? LEVEL_NAMES[sal.level] : "ngoài mùa khô"}</b>
        </span>
        <button className="primary" onClick={() => onAdvice(members[0])}>Xem khuyến nghị →</button>
      </div>

      {mode === "drought" ? <>{drought}{salinity}</> : <>{salinity}{drought}</>}
    </aside>
  );
}
