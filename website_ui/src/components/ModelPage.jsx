import { api } from "../api/index.js";
import { fmtNum } from "../lib/format.js";
import useAsync from "../lib/useAsync.js";
import EChart from "./EChart.jsx";
import { accuracyOption, confusionOption } from "./charts/options.js";

export default function ModelPage() {
  const { data: m } = useAsync(() => api.getMetrics(), []);
  if (!m) return <div className="page"><div className="skeleton" /></div>;

  return (
    <div className="page">
      <section className="card">
        <header>
          <span className="num">4</span>
          <div>
            <h3>Ma trận nhầm lẫn và balanced accuracy theo horizon</h3>
            <p>Tập {m.split}. Mục tiêu: balanced accuracy ≥ {fmtNum(m.target)} (mục 1 của roadmap).</p>
          </div>
        </header>
        <div className="row3">
          {m.horizons.map((h) => (
            <EChart key={h.h} option={confusionOption(h, m.classes)} height={260} />
          ))}
        </div>
        <EChart option={accuracyOption(m)} height={280} />
        <table className="tbl">
          <thead>
            <tr><th>Horizon</th><th>Recall Hạn</th><th>Recall Bình thường</th><th>Recall Ẩm</th><th>Balanced acc.</th></tr>
          </thead>
          <tbody>
            {m.horizons.map((h) => (
              <tr key={h.h}>
                <td>h{h.h}</td>
                {h.recall.map((r, i) => <td key={i}>{fmtNum(r)}</td>)}
                <td><b>{fmtNum(h.balanced_accuracy)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
