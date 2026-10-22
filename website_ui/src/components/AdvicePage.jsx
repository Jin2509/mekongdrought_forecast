import { useEffect, useRef, useState } from "react";
import { api } from "../api/index.js";
import agri from "../data/agri.json";
import { fmtMonth } from "../lib/format.js";
import { STATIONS, STATION_BY_ID } from "../lib/stations.js";
import useAsync from "../lib/useAsync.js";

const PRIORITY = { 1: "Ưu tiên 1 · Khẩn", 2: "Ưu tiên 2 · Nên làm", 3: "Ưu tiên 3 · Theo dõi" };
const cropName = (c) => agri.salinity_tolerance[c]?.name ?? c;

function ActionCard({ a }) {
  return (
    <article className={`action p${a.priority}`}>
      <div className="action-top">
        <span className="badge">{PRIORITY[a.priority]}</span>
        {a.crop && <span className="tag">{a.cropName}</span>}
      </div>
      <h4>{a.title}</h4>
      <p className="why"><b>Lý do kích hoạt:</b> {a.why}</p>
      <p className="explain">
        {a.explanation ?? <i>Phần giải thích có trích dẫn sẽ do RAG (D3–D4) sinh ra.</i>}
      </p>
      {a.sources.length > 0 && (
        <ol className="sources">
          {a.sources.map((s, i) => (
            <li key={i}>
              <b>{s.title}</b> — <code>{s.source}</code>{s.note && <span className="muted"> ({s.note})</span>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function Chat({ station, issued }) {
  const [msgs, setMsgs] = useState([
    { role: "bot", text: "Xin chào! Hãy hỏi về hạn, mặn hoặc cách ứng phó cho tỉnh đang chọn." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function send(e) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await api.chat({ message: q, station, month: issued });
      setMsgs((m) => [...m, { role: "bot", text: r.answer, sources: r.sources }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: "bot", text: `Lỗi: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card chat">
      <header><div><h3>Hỏi đáp (RAG)</h3><p>Ngữ cảnh: {STATION_BY_ID[station].name}, {fmtMonth(issued)}</p></div></header>
      <div className="msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <p>{m.text}</p>
            {m.sources?.length > 0 && (
              <ul className="sources">
                {m.sources.map((s, k) => <li key={k}><code>{s.source}</code> — {s.title}</li>)}
              </ul>
            )}
          </div>
        ))}
        {busy && <div className="msg bot"><p className="muted">Đang trả lời…</p></div>}
        <div ref={end} />
      </div>
      <form onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)}
               placeholder="Ví dụ: Có nên xuống giống Đông Xuân sớm không?" />
        <button className="primary" disabled={busy}>Gửi</button>
      </form>
    </section>
  );
}

export default function AdvicePage({ station, setStation, issued }) {
  const [crop, setCrop] = useState(null);
  useEffect(() => setCrop(null), [station]);
  const { data, loading } = useAsync(
    () => api.getRecommendations({ station, month: issued, crop }),
    [station, issued, crop],
  );
  const crops = agri.provinces[station] ?? [];

  return (
    <div className="page advice">
      <div className="advice-main">
        <section className="card">
          <div className="advice-filters">
            <label>
              Tỉnh
              <select value={station} onChange={(e) => setStation(e.target.value)}>
                {STATIONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="seg">
              <button className={!crop ? "on" : ""} onClick={() => setCrop(null)}>Tất cả</button>
              {crops.map((c) => (
                <button key={c} className={crop === c ? "on" : ""} onClick={() => setCrop(c)}>{cropName(c)}</button>
              ))}
            </div>
          </div>
          <p className="muted">
            Khuyến nghị cho 3 tháng sau {fmtMonth(issued)}, sắp theo mức ưu tiên. Luật lấy từ dự báo hạn (B), mức SRI (C)
            và hồ sơ cây/con của tỉnh.
          </p>
        </section>
        {loading && !data ? <div className="skeleton" /> : (
          <div className="actions">
            {data.actions.map((a) => <ActionCard key={`${a.id}-${a.title}`} a={a} />)}
          </div>
        )}
      </div>
      <Chat station={station} issued={issued} />
    </div>
  );
}
