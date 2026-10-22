"""Tải dữ liệu khí tượng theo ngày từ Open-Meteo Historical Weather API (ERA5).

Chạy:  python -m mekong.ingestion.open_meteo [--stations LA TG ...]
Đầu ra: data/raw/<ID>_daily_<model>_<y0>_<y1>.csv, data/interim/<ID>_daily.csv,
        reports/grid_points.csv
Có thể chạy lại nhiều lần: khối nào đã đủ cột và đủ ngày thì bỏ qua.
"""
import argparse
import logging
import os
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd
import requests

from mekong.config import effective_end, get_path, load_config, setup_logging
from mekong.ingestion.http import make_session

log = logging.getLogger("ingestion.open_meteo")


class RateLimited(RuntimeError):
    """API trả 429 sau khi đã retry: dừng crawl, chờ rồi chạy lại."""


def get_endpoint(cfg):
    key = os.getenv("OPEN_METEO_API_KEY", "").strip()
    if key:
        return cfg["api"]["base_paid"], key
    return cfg["api"]["base_free"], None


def year_chunks(y0, y1, step):
    y = y0
    while y <= y1:
        yield y, min(y + step - 1, y1)
        y += step


def request_block(session, base, key, lat, lon, start, end, tz, daily=None, hourly=None,
                  models=None):
    params = {"latitude": lat, "longitude": lon, "start_date": start,
              "end_date": end, "timezone": tz}
    if models:
        params["models"] = models
    if daily:
        params["daily"] = ",".join(daily)
    if hourly:
        params["hourly"] = ",".join(hourly)
    if key:
        params["apikey"] = key
    try:
        r = session.get(base, params=params, timeout=120)
    except requests.exceptions.RetryError as e:
        if "429" in str(e):
            raise RateLimited("Open-Meteo giới hạn lượt gọi (429)") from e
        raise
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    return r.json()


def raw_prefix(cfg, st, kind):
    # gắn tên model vào file để không trộn dữ liệu của các model khác nhau
    return f"{st['id']}_{kind}_{cfg['api'].get('models') or 'best_match'}"


def is_complete(path, variables, e_date):
    """File đã có đủ cột và đủ ngày đến e_date? (khối năm hiện tại có thể mới tải 1 phần)"""
    if not path.exists():
        return False
    df = pd.read_csv(path)
    if not set(variables) <= set(df.columns) or df.empty:
        return False
    return str(df["date"].iloc[-1])[:10] >= e_date


def fetch_station(cfg, st, session):
    """Tải các khối còn thiếu; trả về tọa độ ô lưới API trả về (None nếu không gọi API)."""
    raw = get_path(cfg, "raw", mkdir=True)
    p, api, tz = cfg["period"], cfg["api"], cfg["project"]["timezone"]
    grid = None
    end_all = effective_end(cfg)
    base, key = get_endpoint(cfg)
    jobs = [("daily", p["calib_start"], api["daily_chunk_years"], api["daily_vars"], None)]
    if api.get("hourly_vars"):
        jobs.append(("soil", p["ml_start"], api["hourly_chunk_years"], None, api["hourly_vars"]))
    for kind, y_start, step, daily, hourly in jobs:
        for y0, y1 in year_chunks(y_start, end_all.year, step):
            out = raw / f"{raw_prefix(cfg, st, kind)}_{y0}_{y1}.csv"
            s_date = f"{y0}-01-01"
            e_date = min(date(y1, 12, 31), end_all).isoformat()
            if is_complete(out, daily or hourly, e_date):
                log.info("bỏ qua (đã đủ) %s", out.name)
                continue
            js = request_block(session, base, key, st["lat"], st["lon"],
                               s_date, e_date, tz, daily, hourly, api.get("models"))
            grid = (js.get("latitude"), js.get("longitude"), js.get("elevation"))
            log.info("tọa độ trả về: lat=%s lon=%s", grid[0], grid[1])
            block = js["daily"] if daily else js["hourly"]
            df = pd.DataFrame(block).rename(columns={"time": "date"})
            df.to_csv(out, index=False)
            log.info("đã lưu %s (%d dòng)", out.name, len(df))
            time.sleep(api["sleep_seconds"])
    return grid


def _read_blocks(files):
    df = pd.concat([pd.read_csv(f) for f in files])
    df["date"] = pd.to_datetime(df["date"])
    return df.drop_duplicates("date").set_index("date").sort_index()


def merge_station(cfg, st):
    """Gộp các khối thô thành data/interim/<ID>_daily.csv."""
    raw, interim = get_path(cfg, "raw"), get_path(cfg, "interim", mkdir=True)
    files = sorted(raw.glob(f"{raw_prefix(cfg, st, 'daily')}_*.csv"))
    if not files:
        raise FileNotFoundError(f"không có file thô cho {st['id']} trong {raw}")
    daily = _read_blocks(files)
    soil_files = sorted(raw.glob(f"{raw_prefix(cfg, st, 'soil')}_*.csv")) if cfg["api"].get("hourly_vars") else []
    if soil_files:
        soil_daily = _read_blocks(soil_files).resample("D").mean()
        soil_daily.columns = [c + "_mean" for c in soil_daily.columns]
        daily = daily.join(soil_daily, how="left")
    out = interim / f"{st['id']}_daily.csv"
    daily.to_csv(out)
    return out


def save_grid_points(cfg, grids):
    """Ghi tọa độ ô lưới thực tế; cảnh báo nếu 2 trạm rơi vào cùng 1 ô (dữ liệu trùng)."""
    out = get_path(cfg, "reports", mkdir=True) / "grid_points.csv"
    df = pd.DataFrame(grids)
    if out.exists():
        old = pd.read_csv(out)
        df = pd.concat([old[~old["id"].isin(df["id"])], df])
    dup = df[df.duplicated(["grid_lat", "grid_lon"], keep=False)]
    if len(dup):
        log.warning("các trạm trùng ô lưới: %s", dup["id"].tolist())
    df.to_csv(out, index=False)
    log.info("đã lưu %s", out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=None)
    ap.add_argument("--stations", nargs="*", help="chỉ tải các ID này (mặc định: tất cả)")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    setup_logging("fetch_open_meteo", cfg)
    base, key = get_endpoint(cfg)
    log.info("endpoint: %s (%s), model: %s", base, "có API key" if key else "miễn phí",
             cfg["api"].get("models") or "best_match")
    session = make_session(cfg["project"]["contact"])
    stations = [s for s in cfg["stations"] if not args.stations or s["id"] in args.stations]
    grids, failed = [], []
    for i, st in enumerate(stations):
        log.info("=== %s (%s) ===", st["id"], st["name"])
        try:
            g = fetch_station(cfg, st, session)
        except RateLimited as e:
            # các trạm sau chắc chắn cũng bị 429 -> dừng, giữ nguyên interim cũ của trạm dở dang
            failed += [s["id"] for s in stations[i:]]
            log.error("%s. Dừng tại %s; chờ ~1 giờ rồi chạy lại để tải tiếp.", e, st["id"])
            break
        except Exception:
            log.exception("lỗi khi tải %s, bỏ qua trạm này", st["id"])
            failed.append(st["id"])
            continue
        if g:
            grids.append({"id": st["id"], "lat": st["lat"], "lon": st["lon"],
                          "grid_lat": g[0], "grid_lon": g[1], "grid_elevation": g[2]})
        log.info("gộp dữ liệu -> %s", merge_station(cfg, st))
    if grids:
        save_grid_points(cfg, grids)
    if failed:
        log.error("chưa tải xong: %s", failed)
        sys.exit(1)


if __name__ == "__main__":
    main()
