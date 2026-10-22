"""Tải dữ liệu ngoài cho cảnh báo mặn và đặc trưng khí hậu:
- ONI (ENSO, NOAA CPC), DMI (IOD, NOAA PSL)
- Lưu lượng sông Mekong theo ngày (GloFAS qua Open-Meteo Flood API)

Chạy:  python -m mekong.ingestion.external
Đầu ra: data/external/oni.ascii.txt, dmi.had.long.data, discharge_daily.csv
"""
import argparse
import logging

import pandas as pd

from mekong.config import effective_end, get_path, load_config, setup_logging
from mekong.ingestion.http import make_session

log = logging.getLogger("ingestion.external")


def download_text(session, url, out):
    r = session.get(url, timeout=120)
    r.raise_for_status()
    out.write_text(r.text, encoding="utf-8")
    log.info("đã lưu %s", out)


def fetch_discharge(cfg, session, out):
    """Lưu lượng ngày (m3/s) tại các điểm trên dòng chính; 1 cột / điểm.
    GloFAS chỉ có số liệu từ 1997, các ngày trước đó là NaN."""
    ext = cfg["external"]
    end = effective_end(cfg).isoformat()
    cols = {}
    for pt in ext["discharge_points"]:
        r = session.get(ext["flood_api"], timeout=120, params={
            "latitude": pt["lat"], "longitude": pt["lon"], "daily": "river_discharge",
            "start_date": f"{cfg['period']['calib_start']}-01-01", "end_date": end})
        r.raise_for_status()
        js = r.json()
        log.info("%s: ô lưới lat=%s lon=%s", pt["id"], js["latitude"], js["longitude"])
        d = js["daily"]
        cols[f"q_{pt['id']}"] = pd.Series(d["river_discharge"], index=pd.to_datetime(d["time"]))
    df = pd.DataFrame(cols).rename_axis("date")
    df.to_csv(out)
    valid = df.dropna()
    log.info("đã lưu %s (%d dòng, có số liệu từ %s)", out, len(df),
             valid.index.min().date() if len(valid) else "-")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=None)
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    setup_logging("fetch_external", cfg)
    ext_dir = get_path(cfg, "external", mkdir=True)
    session = make_session(cfg["project"]["contact"])
    download_text(session, cfg["external"]["oni_url"], ext_dir / "oni.ascii.txt")
    download_text(session, cfg["external"]["dmi_url"], ext_dir / "dmi.had.long.data")
    fetch_discharge(cfg, session, ext_dir / "discharge_daily.csv")


if __name__ == "__main__":
    main()
