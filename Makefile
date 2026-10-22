PY ?= .venv/bin/python
RUN = PYTHONPATH=src $(PY) -m

.PHONY: install fetch external validate build data test freeze-raw check-raw preprocess baseline


install:
	$(PY) -m pip install -r requirements.txt

fetch:      ## tải ERA5 theo ngày cho 13 trạm (chạy lại được, bỏ qua khối đã đủ)
	$(RUN) mekong.ingestion.open_meteo

external:   ## ONI, DMI, lưu lượng Mekong (GloFAS)
	$(RUN) mekong.ingestion.external

validate:   ## kiểm tra data/interim, thoát 1 nếu còn ERROR
	$(RUN) mekong.quality.validate

build:      ## dataset tháng: SPEI, đặc trưng, nhãn
	$(RUN) mekong.features.build

data: fetch external validate build

test:
	$(PY) -m pytest -q

freeze-raw: ## ghi checksum dữ liệu thô
	$(RUN) mekong.quality.freeze

check-raw: ## kiểm tra dữ liệu thô không bị sửa
	$(RUN) mekong.quality.freeze --check
