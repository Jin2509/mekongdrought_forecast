# Mekong Drought Forecast + RAG

Dự báo hạn hán bằng SPEI, cảnh báo nguy cơ mặn và hệ khuyến nghị RAG cho 13 tỉnh ĐBSCL (địa giới cũ).

## Cấu trúc

```
config.yaml              # trạm, biến API, giai đoạn, tham số features, đường dẫn
src/mekong/
  config.py              # load_config, đường dẫn theo gốc dự án, logging
  ingestion/             # open_meteo.py (ERA5), external.py (ONI, DMI, GloFAS), http.py
  quality/validate.py    # kiểm tra data/interim
  features/              # aggregate.py, spei.py, external.py, build.py
  forecasting/ salinity/ rag/ storage/ services/ api/ web/   # các tuần sau
data/{raw,interim,external,processed,knowledge}
reports/ (figures/)  logs/  models/  notebooks/  tests/  docs/
```

## Chạy

```bash
source .venv/bin/activate
make fetch      # tải ERA5 theo ngày (chạy lại được, bỏ qua khối đã đủ)
make external   # ONI, DMI, lưu lượng Mekong
make validate   # phải hết ERROR
make build      # data/processed/dataset_monthly_{full,ml}.csv + reports/spei_sanity.csv
make test
```

Hoặc trực tiếp: `PYTHONPATH=src python -m mekong.features.build --stations LA TG BT`.
Nhật ký từng tuần: `WEEK1_STEP.md`, `docs/`.
