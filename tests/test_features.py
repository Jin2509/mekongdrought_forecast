import numpy as np
import pandas as pd

from mekong.config import load_config
from mekong.features.aggregate import longest_dry_spell
from mekong.features.build import assign_split
from mekong.features.spei import glo_cdf, glo_lmoments, spei


def test_config_keys():
    cfg = load_config()
    assert {"calib_start", "calib_end", "ml_start", "end"} <= set(cfg["period"])
    assert len(cfg["stations"]) == 13
    assert all(v.isidentifier() for v in cfg["api"]["daily_vars"])
    assert {"spei_scales", "horizons", "lags", "lag_vars"} <= set(cfg["features"])


def test_spei_standard_normal_on_synthetic():
    rng = np.random.default_rng(0)
    idx = pd.date_range("1991-01-01", "2020-12-01", freq="MS")
    # D có chu kỳ mùa + nhiễu lệch (gamma) giống chuỗi mưa - ET0
    d = pd.Series(80 * np.sin(2 * np.pi * idx.month / 12) + rng.gamma(2, 30, len(idx)) - 60, index=idx)
    s = spei(d, 3, np.ones(len(idx), bool)).dropna()
    assert abs(s.mean()) < 0.1
    assert abs(s.std() - 1) < 0.1
    assert 0.10 < (s <= -1).mean() < 0.22


def test_glo_cdf_monotonic_and_bounded():
    x = np.random.default_rng(1).normal(0, 1, 200) ** 3   # lệch mạnh
    xi, alpha, k = glo_lmoments(x)
    grid = np.linspace(x.min() - 5, x.max() + 5, 500)
    f = glo_cdf(grid, xi, alpha, k)
    assert np.all((f >= 0) & (f <= 1))
    assert np.all(np.diff(f) >= -1e-12)


def test_longest_dry_spell():
    assert longest_dry_spell(pd.Series([0, 0, 5, 0, 0, 0, 2])) == 3
    assert longest_dry_spell(pd.Series([5, 5])) == 0


def test_split_gap_covers_label_horizon():
    cfg = load_config()
    dates = pd.Series(pd.date_range("2018-08-01", "2019-02-01", freq="MS"))
    split = assign_split(dates, cfg).tolist()
    assert split == ["train", "train", "gap", "gap", "gap", "val", "val"]
