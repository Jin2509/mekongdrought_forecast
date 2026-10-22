"""Đọc config.yaml và các tiện ích dùng chung (đường dẫn, logging, mốc thời gian).

Mọi đường dẫn trong config tính theo thư mục gốc dự án nên có thể chạy từ bất kỳ đâu.
"""
import logging
from datetime import date, timedelta
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]   # src/mekong/config.py -> gốc dự án
DEFAULT_CONFIG = ROOT / "config.yaml"

load_dotenv(ROOT / ".env")


def rpath(p) -> Path:
    """Đường dẫn tương đối trong config -> tuyệt đối theo gốc dự án."""
    p = Path(p)
    return p if p.is_absolute() else ROOT / p


def load_config(path=None) -> dict:
    with open(rpath(path or DEFAULT_CONFIG), encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_path(cfg, key, mkdir=False) -> Path:
    """Thư mục `paths.<key>` trong config."""
    p = rpath(cfg["paths"][key])
    if mkdir:
        p.mkdir(parents=True, exist_ok=True)
    return p


def effective_end(cfg) -> date:
    """Ngày cuối có dữ liệu: min(31/12 năm `end`, hôm nay - end_lag_days)."""
    p = cfg["period"]
    cap = date.today() - timedelta(days=p["end_lag_days"])
    return min(date(p["end"], 12, 31), cap)


def setup_logging(name, cfg=None):
    """Log ra màn hình và logs/<name>.log."""
    handlers = [logging.StreamHandler()]
    if cfg is not None:
        handlers.append(logging.FileHandler(get_path(cfg, "logs", mkdir=True) / f"{name}.log",
                                            encoding="utf-8"))
    logging.basicConfig(level=logging.INFO, handlers=handlers, force=True,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    return logging.getLogger(name)
