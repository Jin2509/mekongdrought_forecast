# Week 2: Rà soát dataset, crawler và đề xuất kiến trúc

Đề tài: **Dự báo hạn hán bằng SPEI và cảnh báo nguy cơ mặn, kèm hệ khuyến nghị RAG cho Đồng bằng sông Cửu Long**

---

## 1. Hiện trạng project (trước Week 2)

| Thành phần | Trạng thái |
|---|---|
| `config.yaml` | 5 trạm (BT, CM, KG, DT, AG), giai đoạn 1991–2025 |
| `src/fetch_api.py` | Crawler Open-Meteo Historical (ERA5): có retry/backoff, chia khối theo năm, bỏ qua khối đã tải, gộp mưa/Tmax/ET0 theo ngày và độ ẩm đất (trung bình theo ngày của dữ liệu giờ) |
| `reports/validate_raw.py` | Kiểm tra thiếu ngày, NaN, ngoài ngưỡng, giá trị đứng yên, tổng mưa năm |
| `src/build_dataset.py` | **Rỗng.** Chưa có bước gộp tháng, SPEI, đặc trưng, nhãn |
| `data/interim/*.csv` | 5 trạm × 12.784 ngày, 0 ERROR |
| Dữ liệu mặn, tài liệu RAG, UI | Chưa có |

Luồng dữ liệu đang có:

```
config.yaml → fetch_api.py → data/raw/ → data/interim/<ID>_daily.csv → validate_raw.py → (build_dataset.py: chưa viết)
```

---

## 2. Mở rộng lên 13 tỉnh ĐBSCL (địa giới cũ)

### 2.1. Danh sách điểm lấy dữ liệu

Mỗi tỉnh lấy 1 điểm tại tỉnh lỵ. Cột `province_2025` ánh xạ sang 6 tỉnh/thành sau sáp nhập (từ 01/07/2025) để UI hiển thị được theo cả hai cách chia.

| ID | Tỉnh (cũ) | Điểm | Lat | Lon | Vùng | Tỉnh sau 2025 | Ô lưới ERA5 |
|---|---|---|---|---|---|---|---|
| LA | Long An | Tân An | 10.535 | 106.413 | coastal | Tây Ninh | 10.50, 106.50 |
| TG | Tiền Giang | Mỹ Tho | 10.360 | 106.360 | coastal | Đồng Tháp | 10.25, 106.25 |
| BT | Bến Tre | Bến Tre | 10.24 | 106.38 | coastal | Vĩnh Long | 10.25, 106.50 |
| TV | Trà Vinh | Trà Vinh | 9.935 | 106.345 | coastal | Vĩnh Long | 10.00, 106.25 |
| VL | Vĩnh Long | Vĩnh Long | 10.253 | 105.972 | inland | Vĩnh Long | 10.25, 106.00 |
| DT | Đồng Tháp | Cao Lãnh | 10.46 | 105.63 | inland | Đồng Tháp | 10.50, 105.75 |
| AG | An Giang | Long Xuyên | 10.37 | 105.43 | inland | An Giang | 10.25, 105.50 |
| KG | Kiên Giang | Rạch Giá | 10.01 | 105.08 | coastal | An Giang | 10.00, 105.25 |
| CT | Cần Thơ | Ninh Kiều | 10.033 | 105.783 | inland | Cần Thơ | 10.00, 105.75 |
| HG | Hậu Giang | Vị Thanh | 9.784 | 105.470 | inland | Cần Thơ | 9.75, 105.50 |
| ST | Sóc Trăng | Sóc Trăng | 9.603 | 105.973 | coastal | Cần Thơ | 9.50, 106.00 |
| BL | Bạc Liêu | Bạc Liêu | 9.294 | 105.727 | coastal | Cà Mau | 9.25, 105.75 |
| CM | Cà Mau | Cà Mau | 9.18 | 105.15 | coastal | Cà Mau | 9.25, 105.25 |

- 13 điểm nằm ở **13 ô lưới ERA5 khác nhau**, nên không tỉnh nào bị trùng dữ liệu. Crawler ghi tọa độ ô lưới thực tế vào `reports/grid_points.csv` và cảnh báo nếu có 2 trạm trùng ô.
- Giữ nguyên ID của 5 trạm cũ nên code và dữ liệu cũ vẫn dùng được.
- Hạn chế: 1 điểm/tỉnh chưa đại diện cho cả tỉnh. Hướng nâng cấp: lấy trung bình nhiều ô lưới trong ranh giới tỉnh (cần file ranh giới GADM hoặc HDX và `geopandas`).

### 2.2. Lỗi dữ liệu nghiêm trọng đã phát hiện và sửa: nguồn `best_match` không đồng nhất

Crawler cũ không truyền tham số `models`, nên Open-Meteo dùng mặc định `best_match`. Đối chiếu dữ liệu Bến Tre đã tải với từng mô hình riêng lẻ:

| Năm | Mưa trong dữ liệu cũ | Mưa ERA5 | Nguồn thực tế của dữ liệu cũ |
|---|---|---|---|
| 2014–2016 | 1883 / 1561 / 2158 mm | 1882 / 1561 / 2158 mm | ERA5 (0.25°) |
| 2017–2019 | 2525 / 2059 / 1573 mm | 2252 / 2046 / 1544 mm | **ECMWF IFS 9 km** (khớp 100%) |

Nghĩa là chuỗi dữ liệu **đổi nguồn từ 01/2017**. Nhiệt độ cũng vậy: trước 2017 lấy từ ERA5-Land, sau 2017 lấy từ IFS. Điểm gãy này nằm giữa giai đoạn chuẩn 1991–2020 dùng để fit SPEI, nên phân phối bị trộn từ hai nguồn và SPEI giai đoạn sau 2017 bị lệch có hệ thống.

**Đã sửa:** thêm `api.models: era5` vào `config.yaml`, truyền tham số này trong `fetch_api.py`, và gắn tên model vào tên file thô (`BT_daily_era5_1991_1995.csv`) để không trộn với dữ liệu cũ. ERA5 có đủ cả 4 biến (mưa, Tmax, ET0, độ ẩm đất 0–7 cm) và đồng nhất từ 1940 đến nay.

Cần ghi trong báo cáo đồ án: đây là dữ liệu tái phân tích ERA5 (ô lưới khoảng 28 km), không phải số đo tại trạm. Mưa ERA5 vùng nội đồng (khoảng 1.900 mm/năm) cao hơn số đo trạm (khoảng 1.400–1.600 mm/năm). SPEI là chỉ số chuẩn hóa theo phân phối của chính chuỗi nên độ lệch trung bình phần lớn bị triệt tiêu, nhưng vẫn cần nêu rõ.

### 2.3. Kết quả crawl lại

Chạy `python src/fetch_api.py` (log trong `logs/fetch_full.log`): tải 195/195 khối, không có lỗi HTTP. Sau đó chạy `python src/validate_raw.py`: **0 ERROR, 2 WARN**.

| ID | Số ngày | Mưa TB (mm/năm) | ET0 TB (mm/năm) | Tmax TB (°C) | Độ ẩm đất min–max |
|---|---|---|---|---|---|
| LA | 12.784 | 1876 | 1499 | 31.7 | 0.158–0.445 |
| TG | 12.784 | 1931 | 1444 | 31.3 | 0.147–0.431 |
| BT | 12.784 | 1988 | 1500 | 31.0 | 0.142–0.430 |
| TV | 12.784 | 2124 | 1455 | 31.0 | 0.120–0.431 |
| VL | 12.784 | 1868 | 1431 | 31.4 | 0.144–0.486 |
| DT | 12.784 | 1811 | 1495 | 32.1 | 0.228–0.502 |
| AG | 12.784 | 1806 | 1458 | 31.5 | 0.122–0.488 |
| KG | 12.784 | 1966 | 1445 | 31.2 | 0.236–0.513 |
| CT | 12.784 | 1867 | 1418 | 31.2 | 0.123–0.452 |
| HG | 12.784 | 2087 | 1407 | 31.2 | 0.249–0.512 |
| ST | 12.784 | 1921 | 1467 | 30.4 | 0.130–0.457 |
| BL | 12.784 | 2000 | 1467 | 29.0 | 0.104–0.503 |
| CM | 12.784 | 2450 | 1456 | 31.3 | 0.085–0.497 |

WARN cần ghi chú trong báo cáo: BL có 1 ngày mưa > 150 mm; ST có Tmax giữ nguyên 6 ngày liên tiếp (thường gặp với dữ liệu ERA5 làm tròn 0,1 °C trong mùa mưa, không phải lỗi).

`data/interim/*.csv` của 5 trạm cũ đã bị **ghi đè bằng dữ liệu ERA5**. Bản `best_match` cũ vẫn còn trong lịch sử git (commit `4a56a40`).

---

## 3. Cấu trúc project đề xuất

Dạng *src-layout*, một package Python duy nhất, chia theo tầng chức năng:

```
mekong_drought_forecast/
├── pyproject.toml              # khai báo package + dependency (thay dần requirements.txt)
├── config.yaml                 # cấu hình duy nhất cho toàn hệ thống
├── .env.example                # OPEN_METEO_API_KEY, LLM_API_KEY, ...
├── Makefile                    # make fetch / validate / dataset / train / serve
├── docker-compose.yml
├── data/
│   ├── raw/                    # API trả về, giữ nguyên (gitignore)
│   ├── external/               # ONI (NOAA), mực nước Tân Châu/Châu Đốc (MRC), bản tin mặn
│   ├── interim/                # <ID>_daily.csv
│   ├── processed/              # dataset_monthly_*.parquet
│   └── knowledge/              # tài liệu PDF/HTML cho RAG
├── models/                     # model đã huấn luyện (*.joblib) + metadata.json
├── src/mekong/
│   ├── config.py               # đọc config.yaml + .env (pydantic-settings)
│   ├── ingestion/              # open_meteo.py (fetch_api), oni.py, mrc.py, salinity_bulletin.py
│   ├── quality/                # validate.py (validate_raw)
│   ├── features/               # aggregate.py, spei.py, build_dataset.py
│   ├── forecasting/            # baselines.py, train.py, evaluate.py, predict.py
│   ├── salinity/               # risk_index.py, classifier.py
│   ├── rag/                    # loader.py, chunker.py, index.py, retriever.py, generator.py
│   ├── services/               # nghiệp vụ dùng chung cho API, CLI và job
│   ├── api/                    # FastAPI: routers/, schemas.py, main.py
│   ├── web/                    # templates/ + static/ (hoặc app Streamlit)
│   ├── storage/                # db.py (SQLite/DuckDB), repositories
│   └── cli.py                  # Typer: mekong fetch|validate|build|train|forecast|index-docs
├── notebooks/                  # chỉ EDA, đánh số 01_eda.ipynb, 02_spei_check.ipynb...
├── tests/                      # test_spei.py, test_features.py, test_api.py
├── reports/                    # validation_report.csv, grid_points.csv, figures/
├── logs/
└── docs/
```

Nguyên tắc:

- Notebook chỉ dùng để khám phá dữ liệu. Logic dùng lại phải nằm trong `src/mekong/`.
- `api/` và `web/` chỉ gọi `services/`, không gọi trực tiếp `forecasting/` hay `rag/`.
- Mọi hằng số (ngưỡng, trạm, giai đoạn) lấy từ `config.yaml`.
- Có thể chuyển dần: giữ nguyên các script hiện tại, viết `build_dataset.py` trước, rồi mới tách package khi bắt đầu làm API.

---

## 4. Các thuật toán cần cho project

### 4.1. Tầng dữ liệu và chỉ số hạn

| Bước | Thuật toán | Ghi chú |
|---|---|---|
| Gộp tháng | Tổng P, ET0; trung bình Tmax, độ ẩm đất; số ngày mưa | Loại tháng thiếu ngày |
| Cân bằng nước | D = P − ET0 (ET0 là FAO-56 Penman–Monteith, API đã tính sẵn) | |
| **SPEI-1/3/6** | Tổng trượt D theo k tháng → fit **log-logistic 3 tham số bằng L-moments/PWM** (Vicente-Serrano et al., 2010) riêng cho từng tháng trong năm trên giai đoạn 1991–2020 → chuyển sang Z chuẩn | Kiểm tra: mean ≈ 0, std ≈ 1, tỷ lệ SPEI ≤ −1 ≈ 0,16. Có thể đối chiếu với package `spei` hoặc `climate-indices` |
| Phân loại hạn | Ngưỡng WMO: ≤ −2 cực đoan, −2 đến −1,5 nặng, −1,5 đến −1 vừa | |
| Sự kiện hạn | Run theory: thời gian, cường độ, độ nghiêm trọng của chuỗi tháng SPEI < −1 | Dùng cho EDA và hiển thị lịch sử trên UI |

### 4.2. Dự báo SPEI (1–3 tháng tới)

| Mức | Mô hình | Vai trò |
|---|---|---|
| Baseline | Persistence (SPEI(t+h) = SPEI(t)), climatology (= 0) | Mốc tối thiểu phải vượt |
| Tuyến tính | Ridge / ElasticNet trên đặc trưng trễ + ONI | Dễ giải thích |
| Cây | Random Forest, **LightGBM/XGBoost** | Mô hình chính đề xuất |
| (Tùy chọn) | SARIMAX theo từng trạm; LSTM/TCN nếu còn thời gian | 13 trạm × khoảng 190 tháng là ít dữ liệu nên deep learning khó có lợi thế |

- **Chiến lược đa bước:** *direct*, mỗi horizon h = 1, 2, 3 một mô hình riêng.
- **Gộp trạm (pooled/global model):** huấn luyện 1 mô hình cho cả 13 trạm, thêm đặc trưng trạm (lat, lon, zone, one-hot ID). Cách này nhân dữ liệu lên 13 lần so với mô hình riêng từng trạm.
- **Đặc trưng:** trễ 1–3 tháng của P, ET0, D, Tmax, độ ẩm đất, SPEI-1/3/6; `month_sin/cos`; ONI trễ ≥ 2 tháng; (bổ sung) IOD/DMI và mực nước Tân Châu nếu thu thập được.
- **Bất định:** quantile regression (LightGBM `objective=quantile`, các mức 0,1/0,5/0,9) để UI hiển thị khoảng dự báo; xác suất hạn = P(SPEI ≤ −1).
- **Kiểm định:** chia theo thời gian (train ≤ 2018, val 2019–2021, test ≥ 2022) có **khoảng đệm 3 tháng**; dò siêu tham số bằng `TimeSeriesSplit` (expanding window).
- **Thước đo:** RMSE, MAE, R², **skill score so với persistence**; với bài toán phân loại hạn dùng F1, PR-AUC, Brier score. Báo cáo theo từng trạm, từng horizon, và riêng mùa khô (tháng 12–5).
- **Giải thích:** SHAP cho LightGBM. Kết quả này cũng được đưa vào RAG làm ngữ cảnh ("vì sao dự báo hạn").

### 4.3. Cảnh báo nguy cơ mặn

**Lỗ hổng lớn nhất hiện tại: dataset chưa có dữ liệu mặn.** Hạn khí tượng (SPEI) chỉ là một yếu tố. Xâm nhập mặn ở ĐBSCL do các yếu tố sau quyết định:

1. Lưu lượng hoặc mực nước thượng nguồn Mekong tại Tân Châu/Châu Đốc (nguồn: MRC Data Portal),
2. Thủy triều Biển Đông và biển Tây,
3. Mùa khô (tháng 12–5),
4. Hạn tại chỗ (SPEI), ENSO.

Đề xuất làm theo 2 giai đoạn:

1. **Chỉ số rủi ro dựa trên luật (làm ngay, không cần nhãn):**
   `risk = w1·f(SPEI-3 dự báo) + w2·f(mực nước Tân Châu bất thường) + w3·mùa khô + w4·ONI + w5·zone(coastal)`.
   Các thành phần được chuẩn hóa về [0, 1], rồi xếp thành 4 mức Thấp, Trung bình, Cao, Rất cao. Trọng số chọn theo chuyên gia hoặc tài liệu, sau đó kiểm tra lại bằng các mùa mặn lịch sử: 2015–2016 và 2019–2020 phải ra "Rất cao".
2. **Mô hình học có giám sát (khi có nhãn):** crawl bản tin dự báo mặn của Viện Khoa học Thủy lợi miền Nam (SIWRR) và Đài KTTV Nam Bộ (dùng `beautifulsoup4` đã có trong requirements). Lấy độ mặn lớn nhất hoặc chiều dài xâm nhập ranh 4‰ theo cửa sông/tỉnh làm nhãn. Sau đó huấn luyện **mô hình phân loại có thứ tự** (LightGBM nhiều lớp hoặc ordinal logistic), đánh giá bằng macro-F1 và ma trận nhầm lẫn.

Mức cảnh báo nên được ánh xạ sang cấp độ rủi ro thiên tai do xâm nhập mặn trong **QĐ 18/2021/QĐ-TTg** (cần đối chiếu ngưỡng cụ thể trong văn bản) để khuyến nghị bám theo quy định hiện hành.

### 4.4. Hệ khuyến nghị RAG

| Thành phần | Đề xuất |
|---|---|
| Kho tri thức | Văn bản hướng dẫn ứng phó hạn mặn của Bộ NN&MT, khuyến cáo lịch thời vụ của các Sở, bản tin SIWRR, tài liệu kỹ thuật canh tác (lúa chịu mặn, tôm–lúa, trữ nước ngọt) |
| Tiền xử lý | PDF/HTML → văn bản (`pypdf`/`pymupdf`, `bs4`), chunk 500–800 token, chồng lặp 10–15%, gắn metadata (tỉnh, năm, loại cây/con, nguồn) |
| Embedding | Model đa ngôn ngữ hỗ trợ tiếng Việt: `BAAI/bge-m3` hoặc `intfloat/multilingual-e5-base` |
| Vector store | **ChromaDB** hoặc FAISS chạy nhúng trong tiến trình (hợp với kiến trúc monolith); pgvector nếu sau này dùng PostgreSQL |
| Truy hồi | **Hybrid**: BM25 (`rank-bm25`, tốt với thuật ngữ tiếng Việt) kết hợp dense, gộp bằng Reciprocal Rank Fusion, rồi rerank bằng cross-encoder (`bge-reranker-v2-m3`). Lọc theo metadata tỉnh và mùa |
| Sinh câu trả lời | LLM nhận **ngữ cảnh có cấu trúc** (SPEI hiện tại và dự báo, mức rủi ro mặn, tỉnh, tháng) cùng các đoạn văn bản truy hồi được. Câu trả lời bắt buộc trích dẫn nguồn. Dùng LLM qua API (ví dụ Claude) hoặc model local (Ollama/Qwen) nếu cần chạy offline |
| Đánh giá | Bộ 30–50 câu hỏi tự soạn: Recall@k và MRR cho truy hồi; faithfulness và answer relevancy (RAGAS hoặc chấm tay) cho sinh câu trả lời |

Luồng xử lý: *người dùng chọn tỉnh → hệ thống lấy dự báo + mức rủi ro → tạo truy vấn → hybrid retrieve → rerank → LLM sinh khuyến nghị kèm trích dẫn*.

---

## 5. Kiến trúc phần mềm: **Modular Monolith**

Với đồ án có 1 nhóm nhỏ, lượng truy cập thấp, và cập nhật dữ liệu theo tháng, **monolith dạng module** là lựa chọn phù hợp: một codebase, một tiến trình deploy, các module tách rõ theo tầng (như mục 3). Microservice chỉ thêm chi phí vận hành mà không mang lại lợi ích ở quy mô này.

```
                    ┌──────────────────────── 1 container: app ─────────────────────────┐
 Trình duyệt ──────▶│  Web UI (Jinja2 + HTMX, Leaflet map, Chart.js)  /  hoặc Streamlit  │
                    │                    │ HTTP/JSON                                     │
                    │  FastAPI  /api/stations /api/spei /api/forecast /api/salinity      │
                    │           /api/recommend (RAG)                                     │
                    │                    ▼                                               │
                    │  services/  (ForecastService, SalinityService, AdvisorService)     │
                    │     │              │                 │                             │
                    │  forecasting/   salinity/           rag/ ──────────────▶ LLM API   │
                    │     │              │                 │                  (bên ngoài)│
                    │  storage/: SQLite/DuckDB + Parquet  ChromaDB (thư mục persist)     │
                    │                                                                    │
                    │  Scheduler (APScheduler, ngày 8 hàng tháng):                       │
                    │     fetch → validate → build → predict → ghi bảng forecasts        │
                    └────────────────────────────────────────────────────────────────────┘
```

### Cách setup monolith

1. **Một package `mekong`** cài ở chế độ editable (`pip install -e .`), khai báo trong `pyproject.toml`. CLI (Typer) và API (FastAPI) dùng chung code.
2. **Tách batch và online:** huấn luyện và crawl chạy qua CLI hoặc scheduler. API **chỉ đọc** kết quả đã tính sẵn (bảng `forecasts`, `salinity_risk`) nên phản hồi nhanh và không phải tải model mỗi request. Riêng RAG chạy online.
3. **Lưu trữ:**
   - SQLite hoặc DuckDB cho các bảng `stations`, `monthly_obs`, `forecasts`, `salinity_risk`, `recommend_log`.
   - Parquet cho dataset huấn luyện.
   - Thư mục `models/` chứa `*.joblib` kèm `metadata.json` (phiên bản, ngày train, thước đo).
   - Chroma persist trong `data/vectordb/`.
4. **Cấu hình:** `config.yaml` cho tham số khoa học, `.env` cho secret, đọc qua `pydantic-settings`.
5. **UI:**
   - Nếu cần nhanh: **Streamlit** gọi thẳng `services/`.
   - Nếu muốn kiến trúc rõ ràng hơn (khuyến nghị cho báo cáo): **FastAPI + Jinja2/HTMX + Leaflet**. Các màn hình: bản đồ 13 tỉnh tô màu theo mức hạn/mặn, biểu đồ SPEI lịch sử và dự báo kèm khoảng tin cậy, khung hỏi đáp khuyến nghị.
6. **Đóng gói:** `Dockerfile` (python:3.12-slim, `uvicorn mekong.api.main:app`) và `docker-compose.yml` gồm 1 service app (cộng thêm `ollama` nếu chạy LLM local), mount volume `data/` và `models/`.
7. **Chất lượng:** `pytest` (SPEI trên dữ liệu tổng hợp, chống rò rỉ đặc trưng, API smoke test), `ruff`, `pre-commit`, GitHub Actions chạy test.

---

## 6. Review code và môi trường

### 6.1. Đã sửa trong Week 2

| # | Vấn đề | Đã làm |
|---|---|---|
| 1 | `best_match` đổi nguồn năm 2017, làm chuỗi dữ liệu không đồng nhất | `api.models: era5`, truyền `models` vào request, tên file thô có tên model |
| 2 | Chỉ có 5/13 tỉnh | Thêm đủ 13 tỉnh, kèm `province`, `province_2025`, `zone` |
| 3 | Không lưu tọa độ ô lưới (cần cho báo cáo) | Ghi `reports/grid_points.csv`, cảnh báo nếu trùng ô |
| 4 | `.gitignore` gõ `__pycache_/` (thiếu `_`) | Sửa thành `__pycache__/` |
| 5 | `validate_raw.py` đặt trong `reports/`, khác với tài liệu hd.md | Chuyển sang `src/validate_raw.py` |
| 6 | `config.yaml` thiếu `calib_end`, còn ghi chú cũ "chạy thử 2023" | Thêm `calib_end: 2020`, xóa ghi chú cũ |
| 7 | Không có `.venv` trong thư mục project | Tạo `.venv` (Python 3.13) từ `requirements-lock.txt`, import thành công |

### 6.2. Còn tồn tại (theo mức ưu tiên)

| Mức | Vấn đề | Đề xuất |
|---|---|---|
| **Chặn** | `src/build_dataset.py` rỗng: chưa có SPEI, đặc trưng, nhãn | Ưu tiên số 1 tuần này, làm theo mục 5 của hd.md |
| **Chặn** (phần mặn) | Không có dữ liệu mặn hoặc thủy văn thượng nguồn | Thêm crawler MRC (Tân Châu/Châu Đốc) và bản tin mặn SIWRR |
| **Chặn** (phần RAG) | Chưa có kho tài liệu | Thu thập 30–100 tài liệu vào `data/knowledge/` kèm metadata nguồn |
| Cao | `fetch_api.py` bỏ qua khối đã có, kể cả khối của năm hiện tại vốn chỉ tải được một phần. Khi chạy lại vào tháng sau, phần dữ liệu mới không được bổ sung | Luôn tải lại khối chứa `effective_end` hoặc kiểm tra ngày cuối trong file |
| Cao | `fetch_api.py` đọc `config.yaml` và `data/` theo thư mục hiện hành; `validate_raw.py` thì dùng `ROOT` | Thống nhất dùng `ROOT` (hoặc module `config.py`) |
| TB | Chưa có test, README rỗng, PROGRESS.md sơ sài | Thêm `tests/test_spei.py`, viết README (cách chạy pipeline) |
| TB | `hd.md`, `hd.png`, `hd.pdf` đã thêm vào `.gitignore` nhưng vẫn đang được git theo dõi | `git rm --cached hd.md hd.png hd.pdf` nếu muốn bỏ khỏi repo |
| Thấp | Không có tham số CLI (chọn trạm, ép tải lại) | `argparse`/Typer: `--stations LA,TG --force` |

### 6.3. Môi trường đã đủ chưa?

| Giai đoạn | Thư viện cần | Trạng thái |
|---|---|---|
| Crawl, kiểm tra dữ liệu | requests, pandas, pyyaml, python-dotenv | ✅ Đủ |
| SPEI, EDA | numpy, scipy, matplotlib, jupyterlab | ✅ Đủ |
| ML cơ bản | scikit-learn | ✅ Đủ |
| ML nâng cao | `lightgbm` hoặc `xgboost`, `shap`, `pyarrow` (Parquet) | ❌ Thiếu |
| Crawl bản tin mặn, tài liệu | beautifulsoup4, lxml (có); `pypdf`/`pymupdf` | ⚠️ Thiếu phần đọc PDF |
| RAG | `chromadb` (hoặc `faiss-cpu`), `sentence-transformers`, `rank-bm25`, SDK LLM (`anthropic`…) | ❌ Thiếu |
| Backend và UI | `fastapi`, `uvicorn`, `jinja2` (đã có qua jupyter), `pydantic-settings`, `typer`, `apscheduler` (hoặc `streamlit`) | ❌ Thiếu |
| Chất lượng code | pytest (có); `ruff`, `pre-commit` | ⚠️ Thiếu một phần |

**Kết luận:** môi trường **đủ cho giai đoạn dữ liệu, SPEI và ML cơ bản** (Week 2–3), nhưng **chưa đủ cho mô hình nâng cao, RAG và UI**. Nên tách requirements theo nhóm (`[ml]`, `[rag]`, `[web]` trong `pyproject.toml`) để cài dần, tránh kéo cả PyTorch vào môi trường khi chưa cần.

Lưu ý: `requirements-lock.txt` đang ghim `pandas==3.0.6`. Pandas 3 thay đổi hành vi copy-on-write và kiểu chuỗi mặc định, nên khi viết `build_dataset.py` cần kiểm tra các phép gán kiểu chuỗi `df[c][mask] = ...` (pandas 3 không còn hỗ trợ).

---

## 7. Kế hoạch đề xuất cho các tuần tiếp theo

| Tuần | Việc |
|---|---|
| 2 (còn lại) | Hoàn thành `build_dataset.py` (gộp tháng, SPEI, ONI, đặc trưng, nhãn); kiểm tra SPEI (mean/std/frac_dry) cho 13 trạm |
| 3 | EDA (vùng ven biển so với nội đồng, các mùa hạn 2015–2016 và 2019–2020); baseline persistence/Ridge/RF |
| 4 | LightGBM + quantile, SHAP; crawler MRC và bản tin mặn |
| 5 | Chỉ số rủi ro mặn (luật), kiểm tra lại trên các mùa lịch sử |
| 6 | Kho tài liệu và pipeline RAG, bộ câu hỏi đánh giá |
| 7 | FastAPI + UI (bản đồ, biểu đồ, hỏi đáp), scheduler |
| 8 | Docker, test, viết báo cáo |
