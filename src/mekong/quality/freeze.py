"""Khóa dữ liệu thô trước khi thực hiện."""

import argparse
import hashlib
import sys


from mekong.config import ROOT, get_path, load_config, rpath
MANIFEST = "data/MANIFEST.sha256"
EXTERNAL_FILES = ["oni.ascii.txt", "dmi.had.long.data","discharge_daily.csv"]

# TÍNH SHA256 của 1 file và trả về hexa
def file_sha256(path,chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()

# chọn file để băm
def tracked_files(cfg):
    ext = get_path(cfg, "external")
    files = list(get_path(cfg,"raw").glob("*_daily_*.csv"))
    files += [ext / name for name in EXTERNAL_FILES if (ext/ name).exists()]
    return sorted(files, key=lambda p: p.relative_to(ROOT).as_posix())

def build_manifest(cfg):
    return {p.relative_to(ROOT).as_posix(): file_sha256(p) for p in tracked_files(cfg)}


def read_manifest(path):
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            digest, rel = line.split(maxsplit=1)
            out[rel.strip()] = digest
    return out

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=None)
    ap.add_argument("--check", action="store_true", help="so với manifest đã ghi")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    path = rpath(MANIFEST)
    current = build_manifest(cfg)

    # Chế độ ghi manifest
    if not args.check:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write("".join(f"{d}  {p}\n" for p, d in current.items()))
        print(f"đã ghi {len(current)} file vào {path}")
        return

    # Chế độ kiểm tra
    if not path.exists():
        print(f"chưa có {path}: chạy 'make freeze-raw' trước")
        sys.exit(1)

    old = read_manifest(path)
    changed = [p for p in old if p in current and current[p] != old[p]]
    missing = [p for p in old if p not in current]
    added = [p for p in current if p not in old]

    for label, items in (("ĐỔI", changed), ("MẤT", missing), ("MỚI", added)):
        for p in items:
            print(f"[{label}] {p}")

    print(f"\n{len(old)} file trong manifest: {len(changed)} đổi, {len(missing)} mất, {len(added)} mới")
    sys.exit(1 if changed or missing else 0)


if __name__ == "__main__":
    main()

        