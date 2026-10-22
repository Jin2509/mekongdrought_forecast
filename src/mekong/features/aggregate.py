"""Gộp dữ liệu ngày của 1 trạm sang tháng + ET0 Hargreaves để kiểm tra chéo."""
import logging

import numpy as np
import pandas as pd

log = logging.getLogger("features.aggregate")

RAIN_DAY_MM = 1.0      # ngày mưa: P >= 1 mm
HOT_DAY_TMAX = 35.0    # ngày nắng nóng: Tmax >= 35 °C


def longest_dry_spell(p):
    dry = (p < RAIN_DAY_MM).astype(int)
    if dry.empty:
        return 0
    return int(dry.groupby((dry == 0).cumsum()).sum().max())


def monthly_station(df):
    """Gộp dữ liệu ngày sang tháng; bỏ tháng chưa đủ ngày."""
    df = df.set_index("date")
    # gió thổi TỪ hướng Đông (sin > 0) -> đẩy nước biển vào các cửa sông Biển Đông (gió chướng)
    rad = np.deg2rad(df["wind_direction_10m_dominant"])
    df["easterly"] = df["wind_speed_10m_mean"] * np.sin(rad)
    df["is_easterly"] = df["wind_direction_10m_dominant"].between(45, 150)
    g = df.resample("MS")
    m = pd.DataFrame({
        "n_days": g["precipitation_sum"].count(),
        "precip_sum": g["precipitation_sum"].sum(),
        "rain_days": g["precipitation_sum"].apply(lambda s: int((s >= RAIN_DAY_MM).sum())),
        "dry_spell_max": g["precipitation_sum"].apply(longest_dry_spell),
        "et0_sum": g["et0_fao_evapotranspiration"].sum(),
        "tmax_mean": g["temperature_2m_max"].mean(),
        "tmax_max": g["temperature_2m_max"].max(),
        "tmin_mean": g["temperature_2m_min"].mean(),
        "hot_days": g["temperature_2m_max"].apply(lambda s: int((s >= HOT_DAY_TMAX).sum())),
        "rh_mean": g["relative_humidity_2m_mean"].mean(),
        "wind_mean": g["wind_speed_10m_mean"].mean(),
        "easterly_wind": g["easterly"].mean(),
        "easterly_days": g["is_easterly"].sum(),
        "sm_0_7": g["soil_moisture_0_to_7cm_mean"].mean(),
        "sm_7_28": g["soil_moisture_7_to_28cm_mean"].mean(),
        "sm_28_100": g["soil_moisture_28_to_100cm_mean"].mean(),
    })
    full = m["n_days"] == m.index.days_in_month
    if (~full).any():
        log.info("bỏ %d tháng chưa đủ ngày: %s", (~full).sum(), list(m.index[~full].date))
    m = m[full].drop(columns="n_days")
    m["D"] = m["precip_sum"] - m["et0_sum"]   # cân bằng nước khí hậu
    return m


def hargreaves_et0(m, lat):
    """ET0 Hargreaves (mm/tháng) để kiểm tra chéo ET0 Penman-Monteith của API."""
    j = (m.index + pd.Timedelta(days=14)).dayofyear.to_numpy()
    phi = np.deg2rad(lat)
    dr = 1 + 0.033 * np.cos(2 * np.pi * j / 365)
    dec = 0.409 * np.sin(2 * np.pi * j / 365 - 1.39)
    ws = np.arccos(-np.tan(phi) * np.tan(dec))
    ra = 24 * 60 / np.pi * 0.082 * dr * (ws * np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.sin(ws))
    tmean = (m["tmax_mean"] + m["tmin_mean"]) / 2
    daily = 0.0023 * 0.408 * ra * (tmean + 17.8) * np.sqrt((m["tmax_mean"] - m["tmin_mean"]).clip(lower=0))
    return daily * m.index.days_in_month
