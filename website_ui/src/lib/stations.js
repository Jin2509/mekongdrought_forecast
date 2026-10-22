// 13 trạm/tỉnh (địa giới cũ) — khớp config.yaml và cột province_2025 của dataset.
export const STATIONS = [
  { id: "AG", name: "An Giang", province2025: "An Giang", lat: 10.37, lon: 105.43, coastal: 0 },
  { id: "BL", name: "Bạc Liêu", province2025: "Cà Mau", lat: 9.294, lon: 105.727, coastal: 1 },
  { id: "BT", name: "Bến Tre", province2025: "Vĩnh Long", lat: 10.24, lon: 106.38, coastal: 1 },
  { id: "CM", name: "Cà Mau", province2025: "Cà Mau", lat: 9.18, lon: 105.15, coastal: 1 },
  { id: "CT", name: "Cần Thơ", province2025: "Cần Thơ", lat: 10.033, lon: 105.783, coastal: 0 },
  { id: "DT", name: "Đồng Tháp", province2025: "Đồng Tháp", lat: 10.46, lon: 105.63, coastal: 0 },
  { id: "HG", name: "Hậu Giang", province2025: "Cần Thơ", lat: 9.784, lon: 105.47, coastal: 0 },
  { id: "KG", name: "Kiên Giang", province2025: "An Giang", lat: 10.01, lon: 105.08, coastal: 1 },
  { id: "LA", name: "Long An", province2025: "Tây Ninh", lat: 10.535, lon: 106.413, coastal: 1 },
  { id: "ST", name: "Sóc Trăng", province2025: "Cần Thơ", lat: 9.603, lon: 105.973, coastal: 1 },
  { id: "TG", name: "Tiền Giang", province2025: "Đồng Tháp", lat: 10.36, lon: 106.36, coastal: 1 },
  { id: "TV", name: "Trà Vinh", province2025: "Vĩnh Long", lat: 9.935, lon: 106.345, coastal: 1 },
  { id: "VL", name: "Vĩnh Long", province2025: "Vĩnh Long", lat: 10.253, lon: 105.972, coastal: 0 },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

// 6 tỉnh/thành sau sáp nhập 2025 -> các trạm thuộc về.
// Lưu ý: "Tây Ninh" mới chỉ có trạm LA (Long An cũ); phần Tây Ninh cũ không có trạm.
export const UNITS_2025 = [...new Set(STATIONS.map((s) => s.province2025))].map((name) => ({
  id: name,
  name,
  members: STATIONS.filter((s) => s.province2025 === name).map((s) => s.id),
}));

export const unitsFor = (level) =>
  level === "13"
    ? STATIONS.map((s) => ({ id: s.id, name: s.name, members: [s.id] }))
    : UNITS_2025;
