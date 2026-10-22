"""Dựng dataset tháng cho tất cả trạm: gộp tháng, SPEI, đặc trưng khí hậu / thủy văn / triều, nhãn.

Chạy:  python -m mekong.features.build [--stations LA TG ...]
       (sau mekong.ingestion.open_meteo, mekong.ingestion.external, mekong.quality.validate)
Đầu ra:
  data/processed/dataset_monthly_full.csv  từ calib_start, cho EDA và vẽ lịch sử
  data/processed/dataset_monthly_ml.csv    từ ml_start, đã bỏ dòng thiếu đặc trưng/nhãn
  reports/spei_sanity.csv                  mean/std/frac_dry của SPEI trên giai đoạn chuẩn
"""
import argparse
import logging
import sys

import numpy as np
import pandas as pd

from mekong.config import get_path, load_config, setup_logging
from mekong.features.aggregate import hargreaves_et0, monthly_station
from mekong.features.external import load_dmi, load_discharge, load_oni, tide_proxy
from mekong.features.spei import spei

log = logging.getLogger("features.build")

DRY_SEASON = [12, 1, 2, 3, 4, 5]


def load_station_monthly(cfg, st, fcfg, calib_years):
    daily = pd.read_csv(get_path(cfg, "interim") / f"{st['id']}_daily.csv", parse_dates=["date"])
    miss = [c for c in cfg["api"]["daily_vars"] if c not in daily.columns]
    if miss:
        raise ValueError(f"{st['id']}: interim thiếu cột {miss} -> chạy lại ingestion.open_meteo")
    m = monthly_station(daily)
    m["et0_hg_sum"] = hargreaves_et0(m, st["lat"])
    calib = (m.index.year >= calib_years[0]) & (m.index.year <= calib_years[1])
    for k in fcfg["spei_scales"]:
        m[f"spei{k}"] = spei(m["D"], k, calib)
    m["station"] = st["id"]
    m["province"] = st["province"]
    m["province_2025"] = st["province_2025"]
    m["lat"], m["lon"] = st["lat"], st["lon"]
    m["coastal"] = int(st["zone"] == "coastal")
    return m


def add_features(df, fcfg):
    """Mùa vụ, độ trễ, chỉ số khí hậu và nhãn. Đặc trưng tháng t chỉ dùng dữ liệu đến hết tháng t."""
    df = df.sort_values(["station", "date"]).copy()
    mo = df["date"].dt.month
    df["month"] = mo
    df["month_sin"] = np.sin(2 * np.pi * mo / 12)
    df["month_cos"] = np.cos(2 * np.pi * mo / 12)
    df["dry_season"] = mo.isin(DRY_SEASON).astype(int)
    g = df.groupby("station")
    for v in fcfg["lag_vars"]:
        for k in fcfg["lags"]:
            df[f"{v}_lag{k}"] = g[v].shift(k)
    # ONI của tháng t là TB t-1..t+1 -> chỉ biết sau tháng t+1: dùng trễ >= 2
    df["oni_lag2"] = g["oni"].shift(2)
    df["oni_lag3"] = g["oni"].shift(3)
    df["dmi_lag1"] = g["dmi"].shift(1)
    src, thr = f"spei{fcfg['target_scale']}", fcfg["drought_threshold"]
    for h in fcfg["horizons"]:
        y = g[src].shift(-h)
        df[f"target_spei{fcfg['target_scale']}_h{h}"] = y
        df[f"target_drought_h{h}"] = (y <= thr).astype(float).where(y.notna())
    return df


def assign_split(dates, cfg):
    s = cfg["split"]
    y = dates.dt.year
    split = np.where(y <= s["train_end"], "train", np.where(y <= s["val_end"], "val", "test"))
    split = pd.Series(split, index=dates.index)
    # khoảng đệm: nhãn nhìn trước tối đa max(horizons) tháng -> bỏ cuối train / cuối val
    gap = max(cfg["features"]["horizons"])
    for end in (s["train_end"], s["val_end"]):
        lo = pd.Timestamp(end, 12, 1) - pd.DateOffset(months=gap - 1)
        split[(dates >= lo) & (dates <= pd.Timestamp(end, 12, 1))] = "gap"
    return split


def spei_sanity(df, scales, calib_years, thr):
    """SPEI trên giai đoạn chuẩn phải có mean≈0, std≈1, frac_dry≈0.16."""
    cal = df[df["date"].dt.year.between(*calib_years)]
    rows = []
    for sid, s_df in cal.groupby("station"):
        for k in scales:
            s = s_df[f"spei{k}"]
            rows.append(dict(station=sid, scale=k, mean=s.mean(), std=s.std(),
                             frac_dry=(s <= thr).mean(), n=s.notna().sum()))
    san = pd.DataFrame(rows).round(3)
    corr = df.groupby("station")[["et0_sum", "et0_hg_sum"]].corr().xs("et0_sum", level=1)["et0_hg_sum"]
    san["et0_pm_vs_hg_corr"] = san["station"].map(corr.round(3))
    return san


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=None)
    ap.add_argument("--stations", nargs="*", help="chỉ dựng cho các ID này (mặc định: tất cả)")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    setup_logging("build_dataset", cfg)
    p, fcfg = cfg["period"], cfg["features"]
    ext = get_path(cfg, "external")
    calib_years = (p["calib_start"], p["calib_end"])
    stations = [s for s in cfg["stations"] if not args.stations or s["id"] in args.stations]

    try:
        frames = [load_station_monthly(cfg, st, fcfg, calib_years) for st in stations]
    except ValueError as e:
        log.error("%s", e)
        sys.exit(1)
    df = pd.concat(frames).rename_axis("date")

    shared = [load_oni(ext / "oni.ascii.txt"), load_dmi(ext / "dmi.had.long.data"),
              load_discharge(ext / "discharge_daily.csv", calib_years), tide_proxy(df.index)]
    shared = pd.concat(shared, axis=1, sort=True)
    df = df.join(shared, how="left").reset_index()
    df = add_features(df, fcfg)
    df["split"] = assign_split(df["date"], cfg)

    out_dir = get_path(cfg, "processed", mkdir=True)
    df.to_csv(out_dir / "dataset_monthly_full.csv", index=False)

    feat = [c for c in df.columns if any(c.endswith(f"_lag{k}") for k in fcfg["lags"])]
    targets = [c for c in df.columns if c.startswith("target_")]
    ml = df[df["date"] >= pd.Timestamp(p["ml_start"], 1, 1)].dropna(subset=feat + targets)
    ml.to_csv(out_dir / "dataset_monthly_ml.csv", index=False)
    log.info("full: %s, ml: %s (%s)", df.shape, ml.shape, ml["split"].value_counts().to_dict())

    san = spei_sanity(df, fcfg["spei_scales"], calib_years, fcfg["drought_threshold"])
    san.to_csv(get_path(cfg, "reports", mkdir=True) / "spei_sanity.csv", index=False)
    print(san.groupby("scale")[["mean", "std", "frac_dry"]].agg(["min", "max"]).round(3))


if __name__ == "__main__":
    main()
