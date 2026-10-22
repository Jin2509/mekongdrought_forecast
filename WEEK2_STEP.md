# WEEK 2 — Hoàn tất crawl 13 tỉnh và kiểm tra chất lượng dữ liệu

Đề tài: **Dự báo hạn hán bằng SPEI và cảnh báo nguy cơ mặn kèm hệ khuyến nghị RAG cho ĐBSCL**
Ngày kiểm tra: 22/10/2026. Tiếp nối `WEEK1_STEP.md` (lúc đó còn thiếu BL, CM do Open-Meteo trả 429).

**Kết luận: dữ liệu ĐÃ ĐỦ cho 13/13 trạm, 0 ERROR.** Dataset tháng đủ 13 trạm đã dựng xong, SPEI đạt chuẩn.

---

## Bước 1. Crawl 2 trạm còn thiếu (BL, CM)

```bash
PYTHONPATH=src python -m mekong.ingestion.open_meteo --stations BL CM 2>&1 | tee logs/fetch_BL_CM.log
```

- Tải đủ 7 khối × 2 trạm (1991–2025, mỗi khối 5 năm, 10 biến). Log `logs/fetch_BL_CM.log` không có dòng 429 / ERROR nào.
- Hoàn tất lúc 12:18; `data/interim/BL_daily.csv`, `CM_daily.csv` được gộp lại.

## Bước 2. Kiểm tra độ đầy đủ của file

| Kiểm tra | Kết quả |
|---|---|
| Số trạm có `data/interim/<ID>_daily.csv` | 13/13 |
| Số cột mỗi file | 11 (`date` + 10 biến `api.daily_vars`) ở cả 13 trạm |
| Số dòng mỗi file | 12.784 ngày (1991-01-01 → 2025-12-31, 35 năm, 9 năm nhuận) ở cả 13 trạm |
| Khối thô `data/raw/<ID>_daily_era5_*.csv` | 7 khối × 13 trạm = 91 file, đều đủ 11 cột |
| Tổng NaN trong interim | 0 ở cả 13 trạm |
| Tọa độ ô lưới ERA5 (`reports/grid_points.csv`) | 13 ô khác nhau, không trạm nào trùng ô |
| Chuỗi mưa trùng giữa 2 trạm | Không có. Tương quan mưa ngày cao nhất 0,946 (TG–BT, hai tỉnh lỵ cách nhau khoảng 13 km) |

## Bước 3. `make validate`

```
Tổng: 0 ERROR, 8 WARN. Báo cáo: reports/validation_report.csv
```

| Trạm | WARN | Đánh giá |
|---|---|---|
| AG, BL, HG, KG, TV, VL | `temperature_2m_min` đứng yên 5–6 ngày | Chấp nhận được: Tmin ở ĐBSCL dao động rất hẹp, ERA5 làm tròn 0,1 °C |
| ST | `temperature_2m_max` đứng yên 6 ngày | Như trên |
| BL | 1 ngày mưa > 150 mm (1999-11-01: 206,1 mm) | Cùng ngày CM 79,8 mm, ST 80,9 mm -> cả vùng có mưa lớn thật trong ngày này; 206 mm tại 1 ô lưới ven biển là khả dĩ, **giữ nguyên** (nên đối chiếu số liệu trạm Bạc Liêu nếu có) |

## Bước 4. Thống kê mô tả từng trạm (1991–2025)

| ID | Mưa năm TB (mm) | ET0 năm TB (mm) | Tmax TB (°C) | RH TB (%) | Ẩm đất 0–7 cm TB | Mưa ngày max (mm) |
|---|---|---|---|---|---|---|
| LA | 1876 | 1499 | 31,7 | 81,0 | 0,339 | 109,4 |
| TG | 1931 | 1444 | 31,3 | 82,8 | 0,333 | 123,2 |
| BT | 1988 | 1500 | 31,0 | 82,5 | 0,327 | 145,1 |
| TV | 2124 | 1455 | 31,0 | 82,9 | 0,319 | 118,6 |
| VL | 1868 | 1431 | 31,4 | 81,9 | 0,323 | 97,5 |
| DT | 1811 | 1495 | 32,1 | 78,9 | 0,397 | 104,7 |
| AG | 1806 | 1458 | 31,5 | 80,4 | 0,321 | 89,7 |
| KG | 1966 | 1445 | 31,2 | 80,3 | 0,415 | 116,1 |
| CT | 1867 | 1418 | 31,2 | 81,7 | 0,321 | 83,0 |
| HG | 2087 | 1407 | 31,2 | 81,3 | 0,421 | 125,4 |
| ST | 1921 | 1467 | 30,4 | 81,8 | 0,328 | 110,4 |
| **BL** | 2000 | 1467 | **29,0** | 81,6 | **0,176** | **206,1** |
| CM | 2450 | 1456 | 31,3 | 80,9 | 0,407 | 110,7 |

Nhận xét: mưa năm 1800–2450 mm, ET0 1400–1500 mm là hợp lý cho ĐBSCL; Cà Mau mưa nhiều nhất, phù hợp thực tế.

### ⚠️ Điểm bất thường: ô lưới Bạc Liêu

| | BL | ST | CM |
|---|---|---|---|
| Ẩm đất 0–7 cm TB | **0,176** | 0,328 | 0,407 |
| Ẩm đất 28–100 cm TB | **0,178** | 0,346 | 0,409 |
| Tmax TB tháng 4 (°C) | **30,3** | 32,3 | 33,4 |
| Gió TB (km/h) | **15,3** | 11,7 | 9,6 |

Ô ERA5 (9,25; 105,75) của BL mát hơn, gió mạnh hơn và đất "khô" hơn hẳn hai tỉnh lân cận. Nhiều khả năng ô này chứa một phần biển hoặc gán loại đất khác (cát ven biển), nên mang tính chất **ô lưới ven biển**, không phải đồng ruộng nội địa.

- Không ảnh hưởng SPEI: SPEI chuẩn hóa riêng từng trạm, sanity của BL vẫn đạt (bước 5).
- Có ảnh hưởng đặc trưng ẩm đất: khi huấn luyện mô hình gộp nhiều trạm, nên dùng **dị thường ẩm đất theo trạm** (trừ trung bình tháng của trạm) thay cho giá trị tuyệt đối, hoặc đưa `station`/`coastal` vào mô hình.
- Nếu muốn ô lưới đại diện hơn, có thể dời tọa độ BL vào nội địa (ví dụ khu vực Phước Long – Hồng Dân) rồi crawl lại riêng BL. Khi đó cần ghi chú trong báo cáo là điểm lấy dữ liệu không còn là tỉnh lỵ.

## Bước 5. Dữ liệu ngoài

| File | Phạm vi | Tình trạng |
|---|---|---|
| `discharge_daily.csv` (Kratie, Tân Châu) | 1997-01-01 → 2025-12-31 | 0 NaN từ 1997; trước 1997 là NaN đúng như dự kiến (GloFAS bắt đầu từ 1997) |
| `oni.ascii.txt` | 1950 → JAS 2026 | Đủ, vượt qua `period.end` |
| `dmi.had.long.data` | 1870 → 2026 | Đủ |
| `agri_profile.yaml` | 13 tỉnh | Có (giá trị tham khảo) |
| `salinity_observations_template.csv` | — | ❌ chỉ có header |
| `data/knowledge/manifest.csv` | — | ❌ chỉ có header |

## Bước 6. `make build` với đủ 13 trạm

- `dataset_monthly_full.csv`: **5460 × 94** (13 trạm × 420 tháng, 1991-01 → 2025-12).
- `dataset_monthly_ml.csv`: **4446 × 94**, 13 trạm, 1997-04 → 2025-09 (train 3354 / val 429 / test 585 / gap 78).
- NaN ở bảng full: `spei3` có 26 ô, tức 2 tháng đầu × 13 trạm, đúng do cửa sổ trượt 3 tháng. P, ET0, ONI, DMI, triều không có NaN.

Sanity SPEI trên giai đoạn chuẩn 1991–2020 (`reports/spei_sanity.csv`):

| Thang | mean | std | frac_dry (≤ −1) |
|---|---|---|---|
| SPEI-1 | 0,007 – 0,009 | 0,979 – 0,989 | 0,156 – 0,175 |
| SPEI-3 | 0,002 – 0,007 | 0,978 – 0,982 | 0,169 – 0,192 |
| SPEI-6 | 0,000 – 0,004 | 0,975 – 0,983 | 0,161 – 0,189 |
| SPEI-12 | −0,005 – 0,003 | 0,976 – 0,982 | 0,172 – 0,219 |

Đạt chuẩn: mean ≈ 0, std ≈ 1, frac_dry ≈ 0,16.

### Đối chiếu với các đợt hạn mặn lịch sử

SPEI-3 nhỏ nhất trong mùa khô (tháng 1–5):

| Năm | Khoảng SPEI-3 min (13 trạm) | Trạm khô nhất |
|---|---|---|
| 2016 | −1,75 → −1,48 | CM −1,75, ST −1,70 |
| 2020 | −1,61 → −1,13 | ST −1,61, CM −1,59, BL −1,55 |
| 2024 | −1,60 → −1,33 | LA −1,60, TG −1,60 |

Cả ba đợt hạn mặn lớn đã biết (2015–2016, 2019–2020, 2024) đều thể hiện là hạn vừa đến nặng trên toàn vùng. Năm 2016 và 2020 khô nhất ở các tỉnh ven biển phía nam, khớp với mô tả thực tế -> SPEI tính từ ERA5 nắm bắt được sự kiện thật.

### Tín hiệu dự báo (13 trạm)

- Tương quan với `target_spei3_h1`: `spei3` 0,76; `oni_lag2` −0,53; `q_TC_anom` 0,33; `D_lag1` 0,30; `dmi_lag1` −0,22; `sm_0_7` 0,20.
- Persistence `spei3 → h3` chỉ 0,29: horizon 2–3 tháng cần thêm ENSO và lưu lượng.
- Tỷ lệ tháng hạn (`target_drought_h1`): train 17,3%, val 21,7%, **test 7,2%**. Ven biển 16,2%, nội đồng 15,8%.

## Bước 7. Tổng kết

| Hạng mục | Trạng thái |
|---|---|
| Dữ liệu khí tượng ERA5 13 trạm, 10 biến, 1991–2025 | ✅ Đủ, 0 NaN, 0 ERROR |
| Dữ liệu ngoài (ONI, DMI, lưu lượng Mekong) | ✅ Đủ |
| Dataset tháng cho ML (13 trạm) | ✅ `data/processed/dataset_monthly_ml.csv` |
| SPEI đạt chuẩn và khớp các sự kiện 2016/2020/2024 | ✅ |
| Ô lưới BL mang tính ven biển (ẩm đất thấp, mát, gió mạnh) | ⚠️ Ghi chú báo cáo; dùng dị thường ẩm đất theo trạm |
| Nhãn độ mặn thực đo | ❌ Chưa có |
| Tài liệu cho RAG | ❌ Chưa có |

### Dọn dẹp (chưa thực hiện, chờ xác nhận)

`data/raw/` còn **104 file `*_soil_era5_*.csv`** từ cách tải độ ẩm đất theo giờ trước đây. Config hiện tại đặt `hourly_vars: []` nên code không còn dùng các file này. Có thể chuyển sang `data/raw/_legacy_soil/` hoặc xóa để tránh nhầm lẫn.

### Việc tiếp theo

1. EDA trong `notebooks/`: chuỗi SPEI-3 1991–2025 theo trạm, so sánh ven biển và nội đồng, mùa vụ của mưa, ET0, ẩm đất.
2. Baseline trong `mekong/forecasting/`: persistence, hồi quy tuyến tính, Random Forest cho `target_spei3_h1..h3` và `target_drought_h1..h3`.
3. Thu thập nhãn mặn cho các mùa khô 2016, 2020, 2024 (bản tin Viện KHTL miền Nam) và tài liệu khuyến cáo cho kho RAG.
