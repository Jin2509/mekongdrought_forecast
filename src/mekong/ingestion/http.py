"""HTTP session dùng chung cho các crawler: retry/backoff, tôn trọng Retry-After."""
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def make_session(contact):
    s = requests.Session()
    retry = Retry(total=5, backoff_factor=3, respect_retry_after_header=True,
                  status_forcelist=[429, 500, 502, 503, 504], allowed_methods=["GET"])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers["User-Agent"] = f"cs114-student-project ({contact})"
    return s
