"""크롤링 결과(data/*.csv)로 앱 데이터(frontend/public/*.json)를 만든다.

1) inventory.json  — 우리 재고 (GitHub에 보관되는 원본)
   - A/S 책임자에 'CJ ENM'이 들어간 상품만 대상
   - 처음 보는 상품/옵션만 새로 추가하고 수량은 임의(0~8)로 넣는다
   - 이미 있는 상품·옵션의 수량은 절대 덮어쓰지 않는다 (직접 고친 값 보존)
2) schedule.json   — 편성표 + 우리 재고 보유 여부
"""
import csv
import datetime
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
PUBLIC = os.path.join(ROOT, "frontend", "public")
INV_PATH = os.path.join(PUBLIC, "inventory.json")
SCHED_PATH = os.path.join(PUBLIC, "schedule.json")
KST = datetime.timezone(datetime.timedelta(hours=9))


def read_csv(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def is_cj_enm(as_text):
    return "CJENM" in re.sub(r"\s+", "", (as_text or "")).upper()


def image_url(code, given=""):
    if given:
        return given
    c = str(code)
    return f"https://image.cjonstyle.net/goods_images/{c[:2]}/{c[-3:]}/{c}L.jpg" if len(c) >= 5 else ""


def random_qty(key):
    """같은 단품이면 매번 같은 '임의' 수량이 나오도록 해시로 만든다 (0~8)."""
    return int(hashlib.md5(key.encode()).hexdigest(), 16) % 9


def main():
    now = datetime.datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    sched = read_csv("cj_schedule.csv")
    items = {r["상품코드"]: r for r in read_csv("cj_items.csv")}
    options = {}
    for o in read_csv("cj_item_options.csv"):
        options.setdefault(o["상품코드"], []).append(o)
    images = {r["상품코드"]: r.get("이미지", "") for r in sched if r.get("이미지")}

    # ---------- 1) 재고 ----------
    inv = {"updatedAt": now, "items": {}}
    if os.path.exists(INV_PATH):
        with open(INV_PATH, encoding="utf-8") as f:
            inv = json.load(f)
    inv_items = inv.setdefault("items", {})
    added_items = added_opts = 0
    for code, it in items.items():
        if not is_cj_enm(it.get("A/S 책임자")):
            continue
        rec = inv_items.get(code)
        if rec is None:
            rec = inv_items[code] = {
                "code": code,
                "name": it["상품명"],
                "brand": it["브랜드"],
                "as": it["A/S 책임자"],
                "image": image_url(code, images.get(code, "")),
                "link": f"https://item.cjonstyle.com/item/{code}",
                "addedAt": now,
                "options": [],
            }
            added_items += 1
        have = {o["unitCode"] for o in rec["options"]}
        for o in options.get(code, []):
            unit = o["단품코드"] or f'{code}-{o["옵션명"]}'
            if unit in have:
                continue
            rec["options"].append({
                "unitCode": unit,
                "color": o["색상"] or o["옵션명"] or "단일",
                "size": o["사이즈"] or "-",
                "qty": random_qty(unit),
            })
            have.add(unit)
            added_opts += 1
    inv["updatedAt"] = now
    with open(INV_PATH, "w", encoding="utf-8") as f:
        json.dump(inv, f, ensure_ascii=False, indent=1)

    # ---------- 2) 편성표 ----------
    slots = {}
    for r in sched:
        key = (r["방송시작"], r["채널"], r["프로그램"])
        slot = slots.setdefault(key, {
            "date": r["방송시작"][:10],
            "start": r["방송시작"][11:16],
            "end": r["방송종료"][11:16],
            "channel": r["채널"],
            "program": r["프로그램"],
            "items": [],
        })
        code = r["상품코드"]
        it = items.get(code, {})
        slot["items"].append({
            "code": code,
            "name": r["상품명"],
            "brand": r["브랜드"],
            "type": r["구분"],
            "price": r["판매가"],
            "salePrice": r["할인가"],
            "image": image_url(code, r.get("이미지", "")),
            "as": it.get("A/S 책임자", ""),
            "prev": r.get("이전방송", ""),
            "next": r.get("다음방송", ""),
            "owned": code in inv_items,
        })
    out = sorted(slots.values(), key=lambda s: (s["date"], s["start"], s["channel"]))
    with open(SCHED_PATH, "w", encoding="utf-8") as f:
        json.dump({"updatedAt": now, "slots": out}, f, ensure_ascii=False)

    owned_slots = sum(1 for s in out if any(i["owned"] for i in s["items"]))
    print(f"✅ 재고 상품 {len(inv_items)}개 (새 상품 {added_items}, 새 옵션 {added_opts}) → {INV_PATH}")
    print(f"✅ 편성 {len(out)}개 중 우리 상품 있는 방송 {owned_slots}개 → {SCHED_PATH}")


if __name__ == "__main__":
    main()
