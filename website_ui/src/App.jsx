import { useState } from "react";
import { api, availableMonths, latestMonth } from "./api/index.js";
import AdvicePage from "./components/AdvicePage.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import MapView from "./components/MapView.jsx";
import ModelPage from "./components/ModelPage.jsx";
import { EVENTS } from "./lib/format.js";
import { STATIONS, unitsFor } from "./lib/stations.js";
import useAsync from "./lib/useAsync.js";

const TABS = [
  { id: "map", label: "Bản đồ", title: "Bản đồ & dự báo", icon: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" },
  { id: "advice", label: "Khuyến nghị", title: "Khuyến nghị canh tác", icon: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" },
  { id: "model", label: "Mô hình", title: "Đánh giá mô hình", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
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
      <div className="issue-date" title="Tháng phát hành dự báo">
        <Icon d="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" />
        <select value={m} onChange={(e) => set(y, e.target.value)} aria-label="Tháng phát hành">
          {monthsOfYear.map((mm) => <option key={mm} value={mm}>Th {Number(mm)}</option>)}
        </select>
        <select value={y} onChange={(e) => set(e.target.value, m)} aria-label="Năm phát hành">
          {YEARS.map((yy) => <option key={yy}>{yy}</option>)}
        </select>
      </div>
      <div className="quick">
        <button className={issued === latestMonth ? "on" : ""} onClick={() => setIssued(latestMonth)}>Mới nhất</button>
        <select
          className={EVENTS.some((e) => e.month === issued) ? "on" : ""}
          value={EVENTS.some((e) => e.month === issued) ? issued : ""}
          onChange={(e) => e.target.value && setIssued(e.target.value)}
          aria-label="Sự kiện hạn mặn"
        >
          <option value="">Sự kiện…</option>
          {EVENTS.map((e) => <option key={e.month} value={e.month}>{e.label}</option>)}
        </select>
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
          <img src="/logo.svg" alt="" width="36" height="36" />
          <div>
            <h1>Meko<span>Drought</span></h1>
            <p>Dự báo hạn &amp; cảnh báo mặn ĐBSCL</p>
          </div>
        </div>
        <nav aria-label="Trang">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} title={t.title}>
              <Icon d={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <IssuePicker issued={issued} setIssued={setIssued} />
      </header>

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
