// Lớp truy cập dữ liệu của UI.
// Không đặt VITE_API_URL -> dùng mock (src/api/mock.js).
// Đặt VITE_API_URL=http://localhost:8000 trong .env.local -> gọi FastAPI (roadmap E2).
import * as mock from "./mock.js";

const API = import.meta.env.VITE_API_URL;
export const USING_MOCK = !API;

async function get(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await fetch(`${API}${path}?${qs}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const api = USING_MOCK
  ? mock
  : {
      getStations: () => get("/stations"),
      getForecast: (p) => get("/forecast", p),
      getHistory: (p) => get("/history", p),
      getSalinityRisk: (p) => get("/salinity-risk", p),
      getExplain: (p) => get("/explain", p),
      getMetrics: () => get("/metrics"),
      getRecommendations: (p) => get("/recommendations", p),
      chat: async (body) => {
        const res = await fetch(`${API}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`/chat: HTTP ${res.status}`);
        return res.json();
      },
    };

// Danh sách tháng và tháng mới nhất lấy từ dữ liệu lịch sử đã xuất.
export const { latestMonth, availableMonths, addMonths, SRI_THRESHOLDS } = mock;
