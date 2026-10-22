import { useState } from "react";
import { USING_MOCK, api, availableMonths, latestMonth } from "./api/index.js";
import AdvicePage from "./components/AdvicePage.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import MapView from "./components/MapView.jsx";
import ModelPage from "./components/ModelPage.jsx";
import { EVENTS, fmtMonth } from "./lib/format.js";
import { STATIONS, unitsFor } from "./lib/stations.js";
import useAsync from "./lib/useAsync.js";

const TABS = [
  { id: "map", label: "Bản đồ & dự báo" },
  { id: "advice", label: "Khuyến nghị" },
  { id: "model", label: "Đánh giá mô hình" },
];
const YEARS = [...new Set(availableMonths.map((m) => m.slice(0, 4)))];

function IssuePicker({ issued, setIssued }) {
  const [y, m] = issued.split("-");
  const monthsOfYear = availableMonths.filter((x) => x.startsWith(y)).map((x) => x.slice(5));
  const set = (yy, mm) => {
    const cand = `${yy}-${mm}`;
    const ok = availableMonths.includes(cand) ? cand : availableMonths.filter((x) => x.startsWith(yy)).at(-1);
    setIssued(ok);
  };
  return (
    <div className="issue">
      <span className="muted">Tháng phát hành</span>
      <select value={m} onChange={(e) => set(y, e.target.value)}>
        {monthsOfYear.map((mm) => <option key={mm} value={mm}>Th {Number(mm)}</option>)}
      </select>
      <select value={y} onChange={(e) => set(e.target.value, m)}>
        {YEARS.map((yy) => <option key={yy}>{yy}</option>)}
      </select>
      <div className="quick">
        <button className={issued === latestMonth ? "on" : ""} onClick={() => setIssued(latestMonth)}>Mới nhất</button>
        {EVENTS.map((e) => (
          <button key={e.month} className={issued === e.month ? "on" : ""} onClick={() => setIssued(e.month)}>
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("map");
  const [issued, setIssued] = useState(latestMonth);
  const [horizon, setHorizon] = useState(1);
  const [mode, setMode] = useState("drought");
  const [level, setLevel] = useState("13");
  const [selected, setSelected] = useState(null);
  const [adviceStation, setAdviceStation] = useState("BT");

  const { data } = useAsync(async () => {
    const [fcs, risk] = await Promise.all([
      Promise.all(STATIONS.map((s) => api.getForecast({ station: s.id, month: issued }))),
      api.getSalinityRisk({ month: issued }),
    ]);
    return { forecasts: Object.fromEntries(fcs.map((f) => [f.station, f])), risk };
  }, [issued]);

  const changeLevel = (l) => {
    setLevel(l);
    setSelected(null);
  };
  const unit = selected && unitsFor(level).find((u) => u.id === selected);
  const openAdvice = (id) => {
    setAdviceStation(id);
    setTab("advice");
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Hạn &amp; mặn ĐBSCL</h1>
          <p>Dự báo SPEI-3 · cảnh báo nguy cơ mặn · khuyến nghị RAG</p>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <IssuePicker issued={issued} setIssued={setIssued} />
      </header>

      {USING_MOCK && (
        <div className="banner">
          <b>Bản xem trước giao diện.</b> Lịch sử SPEI, lưu lượng, ONI/DMI là dữ liệu thật của project; dự báo, SHAP,
          SRI dự báo, ma trận nhầm lẫn và khuyến nghị là <b>số liệu mẫu</b> (chưa có mô hình giai đoạn B–D).
          Dữ liệu đến {fmtMonth(latestMonth)}.
        </div>
      )}

      {tab === "map" && (
        <div className={`map-page ${unit ? "with-panel" : ""}`}>
          <MapView
            level={level} setLevel={changeLevel} mode={mode} setMode={setMode}
            horizon={horizon} setHorizon={setHorizon} issued={issued}
            forecasts={data?.forecasts} risk={data?.risk} selected={selected} onSelect={setSelected}
          />
          {unit && data ? (
            <DetailPanel
              key={unit.id} unit={unit} issued={issued} horizon={horizon} mode={mode}
              forecasts={data.forecasts} risk={data.risk}
              onAdvice={openAdvice} onClose={() => setSelected(null)}
            />
          ) : (
            <aside className="panel empty">
              <p>Bấm vào một tỉnh trên bản đồ để xem chi tiết.</p>
            </aside>
          )}
        </div>
      )}
      {tab === "advice" && <AdvicePage station={adviceStation} setStation={setAdviceStation} issued={issued} />}
      {tab === "model" && <ModelPage />}
    </div>
  );
}
