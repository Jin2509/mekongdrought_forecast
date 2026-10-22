"""SPEI (Vicente-Serrano 2010) với phân phối Generalized Logistic fit bằng L-moments."""
import numpy as np
import pandas as pd
from scipy.stats import norm

MIN_REF_YEARS = 20   # số năm tối thiểu trong giai đoạn chuẩn để fit 1 tháng


def glo_lmoments(x):
    """Tham số phân phối Generalized Logistic bằng L-moments (Hosking 1997).
    GLO chính là log-logistic 3 tham số của Vicente-Serrano (2010) viết lại với k = -1/beta,
    nhưng xử lý được cả chuỗi lệch âm (tháng mùa mưa) mà công thức PWM gốc bị hỏng."""
    x = np.sort(x)
    n = len(x)
    i = np.arange(n)
    b0 = x.mean()
    b1 = np.sum(i / (n - 1) * x) / n
    b2 = np.sum(i * (i - 1) / ((n - 1) * (n - 2)) * x) / n
    l1, l2, l3 = b0, 2 * b1 - b0, 6 * b2 - 6 * b1 + b0
    k = -l3 / l2
    if abs(k) < 1e-6:
        return l1, l2, 0.0
    alpha = l2 * np.sin(k * np.pi) / (k * np.pi)
    xi = l1 - alpha * (1 / k - np.pi / np.sin(k * np.pi))
    return xi, alpha, k


def glo_cdf(x, xi, alpha, k):
    if k == 0:
        y = (x - xi) / alpha
    else:
        arg = 1 - k * (x - xi) / alpha
        # ngoài miền xác định: k>0 -> vượt cận trên (F=1), k<0 -> dưới cận dưới (F=0)
        with np.errstate(invalid="ignore"):
            y = -np.log(np.where(arg > 0, arg, np.nan)) / k
        y = np.where(arg > 0, y, np.inf if k > 0 else -np.inf)
    return 1 / (1 + np.exp(-y))


def spei(d, scale, calib):
    """d: chuỗi D tháng liên tục (DatetimeIndex); calib: mask bool giai đoạn chuẩn.
    Fit riêng từng tháng trong năm trên giai đoạn chuẩn rồi áp cho toàn chuỗi."""
    acc = d.rolling(scale, min_periods=scale).sum()
    out = pd.Series(np.nan, index=d.index)
    for mo in range(1, 13):
        sel = acc.index.month == mo
        ref = acc[sel & calib].dropna()
        if len(ref) < MIN_REF_YEARS:
            continue
        x = acc[sel]
        cdf = np.clip(glo_cdf(x.to_numpy(), *glo_lmoments(ref.to_numpy())), 1e-6, 1 - 1e-6)
        out[sel] = np.where(x.notna(), norm.ppf(cdf), np.nan)
    return out
