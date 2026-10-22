# WEEK 1 — Refactor pipeline dữ liệu sang cấu trúc chuẩn

Đề tài: **Dự báo hạn hán bằng SPEI và cảnh báo nguy cơ mặn kèm hệ khuyến nghị RAG cho ĐBSCL**
Ngày thực hiện: 22/10/2026. Nguồn: `../mekong_drought_forecast` (4 script phẳng trong `src/`).

---

## Bước 1. Khảo sát hiện trạng

| Project | Hiện trạng |
|---|---|
| `mekong_drought_forecast` (cũ) | `src/fetch_api.py`, `fetch_external.py`, `validate_raw.py`, `build_dataset.py`; dữ liệu 13 trạm nhưng chỉ 5 trạm (LA, TG, BT, TV, VL) đủ 10 biến, DT tải dở 4/7 khối, 7 trạm còn bộ 3 biến cũ (crawl bị 429) |
| `mekong_drought_forecast_RAG` (mới) | Đã có khung `src/mekong/{ingestion,quality,features,forecasting,salinity,rag,storage,services,api,web}`, `config.yaml`; `config.py`, `README.md`, `Makefile`, `pyproject` đều rỗng |

## Bước 2. Sửa lỗi cấu trúc / cấu hình (trước khi chuyển code)

| Vấn đề | Ảnh hưởng | Đã sửa |
|---|---|---|
| `period.calid_start`, `calid_end`, `ml_statr` | Code đọc `calib_start/calib_end/ml_start` -> `KeyError` | Đổi đúng tên, thêm chú thích |
| `- wind_direction_10m_dominant.` (dấu chấm thừa) | Gửi tên biến sai lên Open-Meteo -> HTTP 400 | Bỏ dấu chấm |
| `paths.reports: figures/reports` | Ngược với cấu trúc thư mục `reports/figures` | `reports: reports`, thêm `figures`, `knowledge`, `models` |
| `pyroject.toml` | pip không nhận | Đổi thành `pyproject.toml`, khai báo package `src/mekong` |
| Thư mục `notbooks/`, `data/knowlegde/`, `test/` | Sai chính tả, lệch với code/tài liệu | `notebooks/`, `data/knowledge/`, `tests/` |
| Tham số SPEI/lag/horizon hard-code trong `build_dataset.py` | Muốn đổi phải sửa code | Thêm mục `features:` vào `config.yaml` |

## Bước 3. Refactor code sang `src/mekong/`

| File cũ | Module mới | Nội dung |
|---|---|---|
| (không có) | `mekong/config.py` | `ROOT`, `load_config`, `rpath`, `get_path`, `effective_end`, `setup_logging` (log ra `logs/<tên>.log`) |
| `fetch_api.py` (`make_session`) | `mekong/ingestion/http.py` | Session có retry/backoff, tôn trọng `Retry-After` |
| `fetch_api.py` | `mekong/ingestion/open_meteo.py` | Crawl ERA5 theo khối 5 năm, `is_complete`, gộp `interim`, `grid_points.csv` |
| `fetch_external.py` | `mekong/ingestion/external.py` | ONI, DMI, lưu lượng GloFAS (Kratie, Tân Châu) |
| `validate_raw.py` | `mekong/quality/validate.py` | Kiểm tra thiếu ngày, NaN, ngưỡng, giá trị đứng yên, mưa năm |
| `build_dataset.py` (gộp tháng) | `mekong/features/aggregate.py` | `monthly_station`, `longest_dry_spell`, `hargreaves_et0` |
| `build_dataset.py` (SPEI) | `mekong/features/spei.py` | `glo_lmoments`, `glo_cdf`, `spei` |
| `build_dataset.py` (dữ liệu ngoài) | `mekong/features/external.py` | `load_oni`, `load_dmi`, `load_discharge`, `tide_proxy` |
| `build_dataset.py` (ghép) | `mekong/features/build.py` | `add_features`, `assign_split`, `spei_sanity`, `main` |
| — | `forecasting/ salinity/ rag/ storage/ services/ api/ web/` | `__init__.py` giữ chỗ cho các tuần sau |

Cách chạy mới (từ gốc dự án, `Makefile` đã đặt `PYTHONPATH=src`):

```bash
make fetch       # python -m mekong.ingestion.open_meteo [--stations ...]
make external    # python -m mekong.ingestion.external
make validate    # python -m mekong.quality.validate
make build       # python -m mekong.features.build [--stations ...]
make test
```

Ngoài ra: copy `data/{raw,interim,external,knowledge}`, `reports/*.csv`, `logs/fetch_full.log`, `docs/WEEK2_REPORT.md`, `docs/reportw2.md` từ project cũ sang (chỉ copy, project cũ giữ nguyên). Viết `README.md`, `Makefile`, `pyproject.toml`, `.env.example` (`OPEN_METEO_API_KEY`), cập nhật `.gitignore`.

## Bước 4. Điều chỉnh source code

| Vấn đề trong code cũ | Hậu quả | Cách sửa |
|---|---|---|
| `load_config("config.yaml")` theo thư mục hiện hành; `validate_raw` lại tính theo gốc dự án | Chạy từ thư mục khác là lỗi, hai script không nhất quán | Mọi đường dẫn đi qua `mekong.config.rpath/get_path` |
| `build_dataset` import `from fetch_api import load_config` | Phụ thuộc `sys.path`, không chạy được khi là package | Import tuyệt đối `mekong.*`, chạy bằng `python -m` |
| Hết lượt API (429) -> `RetryError` văng ra, dừng cả chương trình (xem `logs/fetch_full.log`) | Không biết trạm nào còn thiếu | Bắt `RateLimited`: dừng gọn, in danh sách trạm chưa xong, thoát mã 1. Lỗi khác chỉ bỏ qua trạm đó |
| `merge_station` gọi `pd.concat([])` khi chưa có file thô | `ValueError` khó hiểu | Báo `FileNotFoundError` rõ trạm |
| `validate_raw` tự tính ngày cuối, trùng logic `effective_end` | Dễ lệch nhau khi sửa | Dùng chung `effective_end`; biến bắt buộc lấy từ `api.daily_vars` |
| `build_dataset` đọc interim thiếu cột -> `KeyError: wind_direction_10m_dominant` | Khó hiểu nguyên nhân | Kiểm tra cột trước, báo trạm nào cần tải lại |
| `fetch_discharge` gọi `.min().date()` trên chuỗi rỗng | Crash nếu GloFAS trả toàn NaN | Kiểm tra trước khi log |
| `spei_sanity` dùng generator lồng 3 tầng | Khó đọc | Viết lại bằng `groupby` |
| Không có `--stations` | Không dựng/tải thử được trên một phần trạm | Thêm `--stations` cho `open_meteo` và `build` |
| Cảnh báo `Pandas4Warning` khi `concat` DatetimeIndex (pandas 3.0) | Hành vi sẽ đổi ở pandas 4 | `pd.concat(..., sort=True)` |

Thêm `tests/test_features.py` (5 test: khóa config, SPEI ~ N(0,1) trên dữ liệu giả, CDF GLO đơn điệu/bị chặn, chuỗi ngày khô, khoảng đệm train/val). Kết quả: **5 passed**.

## Bước 5. Chạy kiểm tra pipeline

- `make validate`: 5 trạm đủ (LA, TG, BT, TV, VL) **0 ERROR**, 2 WARN (Tmin đứng yên 5–6 ngày ở TV, VL — chấp nhận được). 8 trạm còn lại ERROR thiếu cột (dữ liệu cũ 3 biến).
- `python -m mekong.features.build --stations LA TG BT TV VL`: full 2100 × 94, ml 1710 × 94 (train 1290 / val 165 / test 225 / gap 30). SPEI trên giai đoạn chuẩn 1991–2020:

| Thang | mean | std | frac_dry (≤ −1) |
|---|---|---|---|
| SPEI-1 | 0,007 – 0,009 | 0,979 – 0,984 | 0,156 – 0,169 |
| SPEI-3 | 0,002 – 0,006 | 0,978 – 0,980 | 0,169 – 0,192 |
| SPEI-6 | 0,000 – 0,002 | 0,977 – 0,983 | 0,175 – 0,189 |
| SPEI-12 | −0,005 – −0,004 | 0,981 – 0,982 | 0,211 – 0,219 |

Kết quả trùng với project cũ (Week 2) -> refactor không làm thay đổi kết quả.

### 5.1. Crawl tiếp dữ liệu bằng code mới

`python -m mekong.ingestion.open_meteo --stations DT AG KG CT HG ST BL CM` (log: `logs/fetch_open_meteo.log`, `logs/fetch_week1_run.out`):

- Tải thêm 40 khối; **DT, AG, KG, CT, HG, ST đã đủ 10 biến** -> 11/13 trạm hoàn tất.
- Đến BL thì Open-Meteo trả 429 (API miễn phí tính request 10 biến × 5 năm thành nhiều lượt). Code mới **dừng gọn**, giữ nguyên interim cũ, in `chưa tải xong: ['BL', 'CM']` — đúng thiết kế ở Bước 4.
- `make validate`: còn **2 ERROR** (BL, CM thiếu cột), 6 WARN (Tmin/Tmax đứng yên 5–6 ngày ở HG, KG, ST, TV, VL — chấp nhận được với dữ liệu tái phân tích).

### 5.2. Dựng lại dataset với 11 trạm

`python -m mekong.features.build --stations LA TG BT TV VL DT AG KG CT HG ST`: full 4620 × 94, ml 3762 × 94 (train 2838 / val 363 / test 495 / gap 66).

| Thang | mean | std | frac_dry |
|---|---|---|---|
| SPEI-1 | 0,007 – 0,009 | 0,979 – 0,988 | 0,156 – 0,175 |
| SPEI-3 | 0,002 – 0,006 | 0,978 – 0,980 | 0,169 – 0,192 |
| SPEI-6 | 0,000 – 0,004 | 0,975 – 0,983 | 0,161 – 0,189 |
| SPEI-12 | −0,005 – 0,001 | 0,977 – 0,982 | 0,175 – 0,219 |

SPEI đạt chuẩn trên cả 11 trạm. Số liệu tương quan ở Bước 6 tính trên dataset 11 trạm này.

## Bước 6. Rà soát features trong `config.yaml`

### 6.1. Dự báo hạn (SPEI) — **đủ**

| Cần | Có trong config | Ghi chú |
|---|---|---|
| P, PET cho SPEI | `precipitation_sum`, `et0_fao_evapotranspiration` | ET0 Penman-Monteith; tương quan với Hargreaves được ghi trong `spei_sanity.csv` |
| Giai đoạn chuẩn 30 năm | `calib_start 1991` – `calib_end 2020` | Chuẩn WMO |
| Trạng thái đất / nhiệt / ẩm | `soil_moisture_*` 3 tầng, `temperature_2m_*`, `relative_humidity_2m_mean` | sm không chạm trần (khác bản best_match cũ) |
| Tín hiệu khí hậu dự báo xa | ONI, DMI (`external`) | `oni_lag2` tương quan −0,53 với `target_spei3_h1`: tín hiệu mạnh nhất sau SPEI hiện tại |

Tương quan với `target_spei3_h1` (11 trạm): `spei3` 0,76; `oni_lag2` −0,53; `q_TC_anom` 0,34; `D_lag1` 0,30; `sm_0_7` 0,23; `dmi_lag1` −0,22. Persistence `spei3 → h1` 0,76 nhưng `→ h3` chỉ 0,29: horizon 2–3 tháng cần ENSO/lưu lượng, đó là chỗ ML có thể vượt baseline.

### 6.2. Cảnh báo mặn — **đủ yếu tố đầu vào, THIẾU nhãn**

| Yếu tố gây mặn | Feature | Trạng thái |
|---|---|---|
| Lưu lượng thượng nguồn | `q_KR_*`, `q_TC_*` (GloFAS, từ 1997) | ✅ |
| Gió chướng | `easterly_wind`, `easterly_days` (từ `wind_speed/direction`) | ✅ |
| Triều | `tide_amp_max/mean` (triều thiên văn tính toán) | ⚠️ chỉ là proxy, chưa có mực nước thực |
| ENSO/IOD, hạn tại chỗ | `oni`, `dmi`, `spei*` | ✅ |
| Vùng ven biển | `zone` -> `coastal` | ✅ |
| **Nhãn độ mặn thực đo** | `data/external/salinity_observations_template.csv` | ❌ **0 dòng** — chưa huấn luyện được mô hình mặn |

### 6.3. Khuyến nghị RAG — **có khung, THIẾU tài liệu**

- ✅ `data/external/agri_profile.yaml`: ngưỡng chịu mặn theo cây/con, lịch thời vụ lúa, cơ cấu sản xuất 13 tỉnh (giá trị tham khảo, cần đối chiếu nguồn chính thức).
- ❌ `data/knowledge/manifest.csv`: **chỉ có header**, chưa có tài liệu nào.
- `config.yaml` chưa có mục cấu hình RAG (đường dẫn kho, mô hình embedding, chunk size) — thêm khi làm phần RAG.

### 6.4. Các điểm cần lưu ý cho mô hình

1. **Rò rỉ nhẹ do giai đoạn chuẩn**: SPEI và `q_*_anom` fit trên 1991–2020, chồng với tập val (2019–2021). Đây là cách làm chuẩn của chỉ số SPEI nhưng cần ghi trong báo cáo; nếu muốn chặt hơn, đặt `calib_end: 2018` (= `train_end`) và so sánh.
2. **Lệch lớp**: tỷ lệ hạn (`target_drought_h1`) train 17,3%, val 21,8%, **test 6,7%** -> dùng `class_weight`, F1/PR-AUC; test ít ca hạn nên khoảng tin cậy rộng.
3. Cột tháng hiện tại (`spei3`, `precip_sum`…) là đặc trưng hợp lệ khi dự báo ở cuối tháng t; nên khai báo danh sách đặc trưng đầu vào mô hình trong config (vd. `features.model_inputs`) ở Week sau.
4. Có thể bổ sung (tùy chọn): `spei12`, `dry_spell_max`, `hot_days`, `tide_amp_max` vào `lag_vars`; dự báo mùa (ECMWF SEAS5) để cải thiện horizon 2–3 tháng.

## Bước 7. Tổng kết Week 1

| Hạng mục | Kết quả |
|---|---|
| Refactor | 4 script phẳng -> package `mekong` (config, ingestion, quality, features); chạy bằng `python -m` / `make`; kết quả SPEI không đổi so với code cũ |
| Cấu hình | Sửa 4 lỗi `config.yaml` làm hỏng code; tham số SPEI/lag/horizon chuyển vào `features:`; sửa tên `pyproject.toml` và 3 thư mục |
| Sửa code | Đường dẫn theo gốc dự án, xử lý 429 không crash, báo lỗi rõ khi thiếu cột/file, thêm `--stations`, 5 unit test (pass) |
| Dữ liệu | **11/13 trạm** đủ 10 biến 1991–2025, 0 ERROR; ONI, DMI, lưu lượng Kratie/Tân Châu đã có |
| Dataset | `data/processed/dataset_monthly_{full,ml}.csv` (11 trạm), `reports/spei_sanity.csv` đạt chuẩn |
| Features | SPEI: **đủ**. Mặn: đủ yếu tố đầu vào, **thiếu nhãn độ mặn**. RAG: có `agri_profile.yaml`, **thiếu tài liệu** |

### Việc còn lại

1. Chờ ~1 giờ cho reset hạn mức rồi chạy `make fetch` (tự bỏ qua khối đã có, chỉ tải BL, CM) -> `make validate` (phải 0 ERROR) -> `make build` để có dataset đủ 13 trạm.
2. Thu thập nhãn độ mặn (bản tin Viện KHTL miền Nam, Tổng cục Thủy lợi; các mùa khô 2016, 2020, 2024) vào `salinity_observations_template.csv`.
3. Thu thập tài liệu khuyến cáo (Bộ NN&MT, Sở NN các tỉnh) vào `data/knowledge/` và `manifest.csv`.
4. Week sau: EDA (`notebooks/`), baseline persistence / hồi quy tuyến tính / Random Forest trong `mekong/forecasting/`, đánh giá RMSE/MAE/R² và F1/PR-AUC theo trạm × horizon.
