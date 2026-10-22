"""Đặc trưng dùng chung cho mọi trạm: ENSO (ONI), IOD (DMI), lưu lượng Mekong, triều thiên văn."""
from pathlib import Path

import numpy as np
import pandas as pd

ONI_SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]


def load_oni(path):
    """ONI là TB trượt 3 tháng -> gán vào tháng giữa (DJF -> tháng 1)."""
    df = pd.read_csv(path, sep=r"\s+")
    df["month"] = df["SEAS"].map({s: i + 1 for i, s in enumerate(ONI_SEASONS)})
    df["date"] = pd.to_datetime(dict(year=df["YR"], month=df["month"], day=1))
    return df.set_index("date")["ANOM"].rename("oni")


def load_dmi(path):
    lines = Path(path).read_text().splitlines()
    rows = []
    for ln in lines[1:]:
        parts = ln.split()
        if len(parts) != 13:
            break
        y = int(parts[0])
        rows += [(pd.Timestamp(y, m + 1, 1), float(v)) for m, v in enumerate(parts[1:])]
    s = pd.Series(dict(rows), name="dmi")
    return s.where(s > -99)


def load_discharge(path, calib):
    """Lưu lượng tháng (TB, min) và dị thường chuẩn hóa theo tháng trong năm."""
    q = pd.read_csv(path, parse_dates=["date"]).set_index("date")
    out = {}
    for c in q.columns:
        pid = c.removeprefix("q_")
        mean = q[c].resample("MS").mean()
        out[f"q_{pid}_mean"] = mean
        out[f"q_{pid}_min"] = q[c].resample("MS").min()
        ref = mean[(mean.index.year >= calib[0]) & (mean.index.year <= calib[1])]
        mu = ref.groupby(ref.index.month).mean()
        sd = ref.groupby(ref.index.month).std()
        out[f"q_{pid}_anom"] = (mean - mu.reindex(mean.index.month).to_numpy()) / sd.reindex(mean.index.month).to_numpy()
    return pd.DataFrame(out)


SYNODIC, ANOMALISTIC = 29.530588853, 27.554549878
NEW_MOON_REF = pd.Timestamp("2000-01-06 18:14")   # trăng mới (UTC)
PERIGEE_REF = pd.Timestamp("2016-11-14 11:23")    # cận điểm (UTC)


def tide_proxy(index):
    """Biên độ triều bán nhật thiên văn (M2+S2), có hiệu chỉnh khoảng cách Mặt Trăng.
    Lớn nhất khi trăng mới/tròn trùng cận điểm (triều cường). Chỉ là đặc trưng thay thế
    vì Open-Meteo Marine chỉ có mực nước biển từ ~2022."""
    days = pd.date_range(index.min(), index.max() + pd.offsets.MonthEnd(0), freq="D") + pd.Timedelta(hours=5)
    phase = 2 * np.pi * ((days - NEW_MOON_REF) / pd.Timedelta(days=1) % SYNODIC) / SYNODIC
    anom = 2 * np.pi * ((days - PERIGEE_REF) / pd.Timedelta(days=1) % ANOMALISTIC) / ANOMALISTIC
    lunar = (1 / (1 - 0.0549 * np.cos(anom))) ** 3
    amp = np.sqrt(lunar ** 2 + 0.46 ** 2 + 2 * lunar * 0.46 * np.cos(2 * phase))
    s = pd.Series(np.asarray(amp), index=days.normalize())
    g = s.resample("MS")
    return pd.DataFrame({"tide_amp_max": g.max(), "tide_amp_mean": g.mean()})
