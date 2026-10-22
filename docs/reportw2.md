# Report Week 2: Kiểm tra và bổ sung features cho SPEI, cảnh báo mặn, khuyến nghị

> Trạng thái: **đang làm dở, tạm dừng ngày 22/10/2026**. Xem mục 6 để chạy tiếp.

---

## 1. Kết luận kiểm tra

| Mục tiêu | Dataset cũ (3 biến ngày + độ ẩm đất 0–7 cm) | Sau khi set up lại |
|---|---|---|
| **SPEI** | Đủ biến đầu vào (P, ET0), nhưng **chưa tính**: `build_dataset.py` rỗng. Thêm nữa, dữ liệu `best_match` gãy chuỗi năm 2017 | ✅ Đủ. Đã tính SPEI-1/3/6/12, kiểm định đạt chuẩn (mục 4) |
| **Cảnh báo mặn** | ❌ Thiếu gần hết: không có lưu lượng thượng nguồn, triều, gió chướng, ENSO, nhãn mặn | ⚠️ Đã có đủ **các yếu tố gây mặn** (lưu lượng Mekong, ENSO/IOD, gió Đông, triều thiên văn, hạn tại chỗ). **Vẫn thiếu nhãn độ mặn thực đo**, phải thu thập thủ công |
| **Khuyến nghị (RAG)** | ❌ Không có dữ liệu nền | ⚠️ Đã có hồ sơ sản xuất 13 tỉnh, lịch thời vụ, ngưỡng chịu mặn, khung danh mục tài liệu. **Chưa có tài liệu** trong kho tri thức |

---

## 2. Những gì đã set up

| File | Thay đổi |
|---|---|
| `config.yaml` | 10 biến ngày ERA5 (thêm Tmin, độ ẩm không khí, gió, hướng gió, độ ẩm đất 3 tầng); bỏ tải dữ liệu giờ; `ml_start: 1997`; thêm mục `external` và `split` |
| `src/fetch_api.py` | Kiểm tra khối đã đủ cột và đủ ngày (`is_complete`) thay vì chỉ kiểm tra file tồn tại. Thiếu biến hoặc thiếu ngày thì tự tải lại |
| `src/fetch_external.py` (mới) | Tải ONI (NOAA CPC), DMI/IOD (NOAA PSL), lưu lượng ngày tại Kratie và Tân Châu (GloFAS qua Open-Meteo Flood API) |
| `src/validate_raw.py` | Kiểm tra ngưỡng cho 10 biến; mọi biến bắt buộc đủ từ 1991 |
| `src/build_dataset.py` (viết mới) | Gộp tháng, SPEI (GLO + L-moments), Hargreaves để kiểm tra chéo ET0, đặc trưng ngoài, triều, trễ, nhãn, chia tập có khoảng đệm |
| `data/external/agri_profile.yaml` (mới) | Ngưỡng chịu mặn theo cây/con, lịch thời vụ lúa, sản xuất chính của 13 tỉnh (**giá trị tham khảo, cần đối chiếu**) |
| `data/external/salinity_observations_template.csv` | Khung nhãn độ mặn thực đo |
| `data/knowledge/manifest.csv` | Khung danh mục tài liệu cho RAG |

### Các quyết định kỹ thuật quan trọng

1. **SPEI dùng phân phối Generalized Logistic (GLO) fit bằng L-moments**, không dùng công thức PWM log-logistic gốc.
   - Với công thức gốc, ở các tháng mùa mưa D lệch âm, β ≤ 1 và fit hỏng. Ví dụ Bến Tre tháng 9: std của SPEI lên tới 3,84.
   - GLO là cùng phân phối log-logistic viết lại theo tham số khác (k = −1/β), và xử lý được cả hai chiều lệch. Package `SPEI` trên R cũng dùng cách này.
2. **Lưu lượng Mekong lấy từ GloFAS.** Hai ô lưới được dò cho nằm trên dòng chính, có lưu lượng lớn nhất trong vùng lân cận:
   - Kratie (12.425, 105.975): tổng lượng nước từ thượng nguồn.
   - Tân Châu (10.825, 105.275): đầu vào sông Tiền.

   GloFAS lưới 5 km **không tách được sông Hậu tại Châu Đốc**, nên không dùng điểm này. Có số liệu từ 1997, nên `ml_start` là 1997.
3. **Triều dùng đặc trưng thay thế (proxy) tính thiên văn**: biên độ triều bán nhật M2+S2 theo pha Mặt Trăng và khoảng cách Trái Đất–Mặt Trăng, nên đạt cực đại khi triều cường trùng cận điểm. Lý do: Open-Meteo Marine chỉ có mực nước biển từ khoảng 2022.
4. **Độ ẩm đất lấy trung bình ngày ERA5 cho 3 tầng từ 1991.** Trước đây dữ liệu giờ chỉ tải từ 2010. Nhờ vậy dữ liệu ML tăng từ 16 năm lên 29 năm.
5. Giữ **≤ 10 biến mỗi request**. Dù vậy, request 10 biến × 5 năm vẫn tốn nhiều lượt gọi: bản miễn phí của Open-Meteo chỉ cho khoảng **39 request/giờ**.

---

## 3. Danh mục features

Dataset tháng gồm **94 cột**, mỗi dòng ứng với một cặp *(trạm, tháng)*.

### 3.1. Khí tượng tháng (gộp từ dữ liệu ngày ERA5)

| Cột | Cách tính | Dùng cho |
|---|---|---|
| `precip_sum` | Tổng mưa (mm) | SPEI, hạn |
| `rain_days` | Số ngày mưa ≥ 1 mm | Hạn |
| `dry_spell_max` | Chuỗi ngày khô (< 1 mm) dài nhất trong tháng | Hạn, khuyến nghị tưới |
| `et0_sum` | Tổng ET0 FAO-56 Penman–Monteith (mm) | SPEI |
| `et0_hg_sum` | ET0 Hargreaves từ Tmax/Tmin | Kiểm tra chéo ET0 |
| `D` | `precip_sum − et0_sum` | SPEI |
| `tmax_mean`, `tmax_max`, `tmin_mean` | Nhiệt độ (°C) | Hạn, nắng nóng |
| `hot_days` | Số ngày Tmax ≥ 35 °C | Khuyến nghị (stress nhiệt) |
| `rh_mean` | Độ ẩm không khí TB (%) | Hạn |
| `wind_mean` | Tốc độ gió TB (km/h) | Mặn |
| `easterly_wind` | TB thành phần gió thổi **từ hướng Đông** (km/h) | **Mặn**: gió chướng đẩy nước biển vào cửa sông |
| `easterly_days` | Số ngày hướng gió chủ đạo 45–150° | Mặn |
| `sm_0_7`, `sm_7_28`, `sm_28_100` | Độ ẩm đất TB 3 tầng (m³/m³) | Hạn nông nghiệp (tầng mặt, vùng rễ lúa, vùng rễ cây ăn trái) |

### 3.2. Chỉ số hạn

| Cột | Ý nghĩa |
|---|---|
| `spei1`, `spei3`, `spei6`, `spei12` | SPEI theo thang 1/3/6/12 tháng. Fit trên 1991–2020, riêng cho từng trạm và từng tháng trong năm |

Phân loại: ≤ −2 cực đoan, −2 đến −1,5 nặng, −1,5 đến −1 vừa, −1 đến 1 bình thường, ≥ 1 ẩm.

### 3.3. Yếu tố gây mặn và khí hậu quy mô lớn (giống nhau cho mọi trạm)

| Cột | Nguồn | Ý nghĩa |
|---|---|---|
| `q_KR_mean`, `q_KR_min` | GloFAS (Kratie) | Lưu lượng TB và nhỏ nhất tháng (m³/s) |
| `q_TC_mean`, `q_TC_min` | GloFAS (Tân Châu) | Như trên, tại đầu vào sông Tiền |
| `q_KR_anom`, `q_TC_anom` | Tính từ dữ liệu trên | Dị thường chuẩn hóa theo tháng trong năm (z-score). **Âm nghĩa là nước về ít, nguy cơ mặn cao** |
| `oni` | NOAA CPC | Chỉ số ENSO. Dương ≥ 0,5 là El Niño, thường kéo theo mùa khô hạn mặn |
| `dmi` | NOAA PSL (HadISST) | Chỉ số dao động lưỡng cực Ấn Độ Dương (IOD) |
| `tide_amp_max`, `tide_amp_mean` | Tính thiên văn | Biên độ triều tương đối (proxy) |

### 3.4. Thời gian và trạm

| Cột | Ý nghĩa |
|---|---|
| `month`, `month_sin`, `month_cos` | Tính mùa |
| `dry_season` | 1 nếu tháng 12–5 |
| `station`, `province`, `province_2025` | ID trạm, tỉnh cũ, tỉnh sau sáp nhập |
| `lat`, `lon`, `coastal` | Vị trí; `coastal` = 1 với tỉnh giáp biển |

### 3.5. Đặc trưng trễ (dùng cho dự báo, chống rò rỉ dữ liệu)

- `<biến>_lag1/2/3` cho các biến: `precip_sum`, `et0_sum`, `D`, `tmax_mean`, `rh_mean`, `easterly_wind`, `sm_0_7`, `sm_7_28`, `sm_28_100`, `spei1`, `spei3`, `spei6`, `q_TC_anom`, `q_KR_anom`. Tổng cộng 42 cột.
- `oni_lag2`, `oni_lag3`: ONI là trung bình trượt 3 tháng nên chỉ biết được sau 1 tháng; phải trễ ít nhất 2 tháng.
- `dmi_lag1`.

### 3.6. Nhãn và chia tập

| Cột | Ý nghĩa |
|---|---|
| `target_spei3_h1/h2/h3` | SPEI-3 của 1/2/3 tháng sau (hồi quy) |
| `target_drought_h1/h2/h3` | 1 nếu SPEI-3 ≤ −1 (phân loại) |
| `split` | `train` ≤ 2018, `val` 2019–2021, `test` ≥ 2022. `gap` là 3 tháng cuối của train và của val, bỏ ra để nhãn không rò sang tập sau |

### 3.7. Đối chiếu yếu tố cần có với feature

| Bài toán | Yếu tố cần | Feature | Trạng thái |
|---|---|---|---|
| SPEI | Mưa, bốc thoát hơi tiềm năng | `precip_sum`, `et0_sum`, `D` | ✅ |
| Dự báo hạn | Trễ khí tượng, độ ẩm đất, ENSO/IOD, mùa | Mục 3.1–3.5 | ✅ |
| Mặn: nguồn nước ngọt | Lưu lượng thượng nguồn | `q_*` | ✅ (GloFAS, chưa có sông Hậu) |
| Mặn: lực đẩy từ biển | Triều, gió chướng | `tide_amp_*`, `easterly_*` | ⚠️ Triều chỉ là proxy thiên văn |
| Mặn: hạn tại chỗ | SPEI, mùa khô | `spei*`, `dry_season` | ✅ |
| Mặn: phơi nhiễm | Giáp biển hay nội đồng | `coastal` | ✅ (chưa có khoảng cách tới cửa sông) |
| **Mặn: nhãn thực đo** | Độ mặn max, chiều dài xâm nhập ranh 4‰ | `salinity_observations_template.csv` | ❌ **Cần thu thập** |
| Khuyến nghị: đối tượng | Cây/con chính của tỉnh | `agri_profile.yaml → provinces` | ⚠️ Cần đối chiếu niên giám |
| Khuyến nghị: ngưỡng | Ngưỡng chịu mặn | `agri_profile.yaml → salinity_tolerance` | ⚠️ Cần đối chiếu nguồn |
| Khuyến nghị: thời điểm | Lịch thời vụ | `agri_profile.yaml → rice_seasons` | ✅ (chung cho vùng) |
| **Khuyến nghị: tri thức** | Văn bản hướng dẫn, bản tin | `data/knowledge/` | ❌ **Chưa có tài liệu** |

---

## 4. Kết quả kiểm định (5 tỉnh đã đủ dữ liệu: LA, TG, BT, TV, VL)

### SPEI trên giai đoạn chuẩn 1991–2020

| Thang | mean | std | frac_dry (≤ −1) | Kỳ vọng |
|---|---|---|---|---|
| SPEI-1 | 0.007 – 0.009 | 0.979 – 0.984 | 0.156 – 0.169 | 0 / 1 / ≈ 0.16 |
| SPEI-3 | 0.002 – 0.006 | 0.978 – 0.980 | 0.169 – 0.192 | |
| SPEI-6 | 0.000 – 0.002 | 0.977 – 0.983 | 0.175 – 0.189 | |
| SPEI-12 | −0.005 – −0.004 | 0.981 – 0.982 | 0.211 – 0.219 | Hơi cao, do tự tương quan mạnh ở thang dài |

### Kiểm tra với các mùa hạn mặn lịch sử (Bến Tre)

| Tháng | SPEI-3 | `q_TC_anom` | ONI |
|---|---|---|---|
| 03/2016 | −1.22 | −0.83 | 1.69 |
| 04/2016 | −1.52 | −1.29 | 1.11 |
| 12/2019 | −1.67 | −1.28 | 0.75 |
| 02/2020 | −1.39 | −2.16 | 0.66 |

Hai mùa mặn lịch sử 2015–2016 và 2019–2020 đều thể hiện đồng thời: SPEI-3 âm, lưu lượng Tân Châu thấp bất thường, và El Niño. Như vậy các feature phản ánh đúng cơ chế gây mặn.

### Lưu ý khi viết báo cáo

- Lưu lượng GloFAS mùa khô thấp hơn số đo thực tế (Tân Châu tháng 3 khoảng 900 m³/s). Vì vậy nên dùng **dị thường** (`q_*_anom`) thay vì giá trị tuyệt đối.
- Tương quan ET0 Penman–Monteith với Hargreaves là 0,55–0,81 tùy trạm. Hargreaves chỉ dùng để kiểm tra chéo, không dùng thay ET0.
- Một số WARN "Tmin đứng yên 5–6 ngày" ở TV, VL là đặc điểm của ERA5 (làm tròn 0,1 °C), không phải lỗi.

---

## 5. Tiến độ crawl khi tạm dừng

| Tỉnh | Khối có đủ 10 biến |
|---|---|
| LA, TG, BT, TV, VL | 7/7 ✅ |
| DT | 4/7 |
| AG, KG, CT, HG, ST, BL, CM | 0/7 |

Nguyên nhân dừng: vượt **giới hạn theo giờ** của Open-Meteo bản miễn phí. Các file `data/interim/*_daily.csv` của 8 tỉnh chưa xong vẫn là bản 3 biến cũ, nên `validate_raw.py` hiện báo ERROR "thiếu cột" cho 8 tỉnh này.

`data/processed/` chưa được tạo; bản chạy thử trên 5 tỉnh chỉ để kiểm định.

---

## 6. Cách chạy tiếp

```bash
source .venv/bin/activate
python src/fetch_api.py          # tự bỏ qua khối đã đủ; khoảng 39 request/giờ, chạy lại nếu gặp 429
python src/validate_raw.py       # phải 0 ERROR
python src/fetch_external.py     # đã chạy, chỉ cần chạy lại khi cập nhật dữ liệu mới
python src/build_dataset.py      # -> data/processed/*.csv, reports/spei_sanity.csv
```

Còn 52 request (DT 3 khối, 7 tỉnh × 7 khối), tương đương khoảng 1,5 giờ với giới hạn miễn phí. Có thể chạy qua đêm bằng vòng lặp:

```bash
until python src/fetch_api.py >> logs/fetch_full.log 2>&1; do sleep 1200; done
```

---

## 7. Việc tiếp theo

1. Crawl nốt 8 tỉnh → validate → `build_dataset.py` cho 13 tỉnh → điền lại bảng SPEI ở mục 4.
2. **Thu thập nhãn mặn:** bản tin của SIWRR và Đài KTTV Nam Bộ, điền vào `salinity_observations_template.csv`. Ưu tiên mùa khô 2016, 2020, 2024 và vài năm bình thường.
3. **Kho tri thức RAG:** 30–100 tài liệu ghi vào `data/knowledge/manifest.csv`.
4. Đối chiếu `agri_profile.yaml` với niên giám thống kê và văn bản khuyến cáo của Bộ NN&MT.
5. Xây chỉ số rủi ro mặn theo luật từ `q_*_anom`, `spei3`, `oni_lag2`, `easterly_wind`, `tide_amp_max`, `coastal`, `dry_season`, rồi kiểm tra trên các mùa 2016 và 2020.
6. (Tùy chọn) Bổ sung khoảng cách từ trạm tới cửa sông gần nhất, và mực nước biển Marine API từ 2022 để hiệu chỉnh proxy triều.
