"""크롤링 결과(data/*.csv)로 앱이 읽는 정적 데이터를 만든다. (봇 전용 파일)

frontend/public/data.json        롯데 앱과 같은 형식: items = 상품(isMaster) + 편성(isMaster=false)
                                 - 편성: 오늘 이후, TV LIVE(CJ온스타일)·라이브쇼(CJ온스타일 라이브)만
                                 - 상품: 위 편성에 나오고 A/S 책임자에 'CJ'가 들어간 상품
frontend/public/seed_stock.json  초기 임의 재고 {상품코드: [{color,size,qty}]}
                                 - 처음 보는 상품·옵션만 추가(0~8 임의), 기존 값은 절대 바꾸지 않음

앱에서 저장하는 데이터(db/*.json)는 이 스크립트가 건드리지 않는다.
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
DATA_JSON = os.path.join(PUBLIC, "data.json")
SEED_JSON = os.path.join(PUBLIC, "seed_stock.json")
KST = datetime.timezone(datetime.timedelta(hours=9))

CATEGORY_RULES = [
    ("아우터", r"코트|자켓|재킷|점퍼|다운|패딩|베스트|조끼|케이프|무스탕|블루종|트렌치|아우터|사파리"),
    ("팬츠", r"팬츠|슬랙스|데님|바지|진\b|조거|레깅스"),
    ("하의", r"스커트|치마"),
    ("상의", r"니트|가디건|블라우스|셔츠|티셔츠|\b티\b|탑|풀오버|스웨터|맨투맨|후디|원피스|터틀"),
]


def read_csv(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


# 편성표에 보여줄 채널 (CJ온스타일+ 는 제외) → 화면 표시 이름
CHANNELS = {"CJ온스타일": "TV LIVE", "CJ온스타일 라이브": "라이브쇼"}


def is_ours(as_text):
    """A/S 책임자에 'CJ'가 들어가면 우리 상품 (CJ ENM, CJ온스타일 고객센터, CJ몰 등)."""
    return "CJ" in re.sub(r"\s+", "", (as_text or "")).upper()


def image_url(code, given=""):
    if given:
        return given
    c = str(code)
    return f"https://image.cjonstyle.net/goods_images/{c[:2]}/{c[-3:]}/{c}L.jpg" if len(c) >= 5 else ""


def guess_category(name):
    for cat, pat in CATEGORY_RULES:
        if re.search(pat, name or ""):
            return cat
    return "잡화"


def random_qty(key):
    """같은 단품이면 매번 같은 '임의' 수량 (0~8)."""
    return int(hashlib.md5(key.encode()).hexdigest(), 16) % 9


def uniq(seq):
    seen, out = set(), []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def main():
    now = datetime.datetime.now(KST)
    stamp = now.strftime("%Y-%m-%d %H:%M")
    today = now.strftime("%Y-%m-%d")

    sched = [r for r in read_csv("cj_schedule.csv") if r["채널"] in CHANNELS]
    on_air = {r["상품코드"] for r in sched}
    items = {r["상품코드"]: r for r in read_csv("cj_items.csv")}
    options = {}
    for o in read_csv("cj_item_options.csv"):
        options.setdefault(o["상품코드"], []).append(o)
    sched_img = {r["상품코드"]: r.get("이미지", "") for r in sched if r.get("이미지")}
    price = {r["상품코드"]: r.get("할인가") or r.get("판매가") for r in sched}

    # 이전 data.json 의 상품도 유지 (편성에서 사라져도 재고 상품은 계속 보이게)
    old_masters = {}
    if os.path.exists(DATA_JSON):
        with open(DATA_JSON, encoding="utf-8") as f:
            for it in json.load(f).get("items", []):
                if it.get("isMaster"):
                    old_masters[str(it["code"])] = it

    seed = {"updatedAt": stamp, "stock": {}}
    if os.path.exists(SEED_JSON):
        with open(SEED_JSON, encoding="utf-8") as f:
            seed = json.load(f)
    stock = seed.setdefault("stock", {})

    masters = dict(old_masters)
    new_items = new_opts = 0
    for code, it in items.items():
        if code not in on_air or not is_ours(it.get("A/S 책임자")):
            continue
        opts = options.get(code, [])
        colors = uniq(o["색상"] or o["옵션명"] for o in opts)
        sizes = uniq(o["사이즈"] for o in opts)
        if code not in masters:
            new_items += 1
        masters[code] = {
            "code": code,
            "image": image_url(code, sched_img.get(code, "")),
            "brand": it["브랜드"],
            "name": it["상품명"],
            "category": (old_masters.get(code) or {}).get("category") or guess_category(it["상품명"]),
            "colors": ",".join(colors),
            "sizes": ", ".join(sizes),
            "location": (old_masters.get(code) or {}).get("location", ""),
            "as": it["A/S 책임자"],
            "price": price.get(code) or "",
            "dateKey": None,
            "isMaster": True,
        }
        rows = stock.setdefault(code, [])
        have = {(r["color"], r["size"]) for r in rows}
        for o in opts:
            color = o["색상"] or o["옵션명"] or "단일"
            size = o["사이즈"] or "FREE"
            if (color, size) in have:
                continue
            rows.append({"color": color, "size": size, "qty": random_qty(o["단품코드"] or f"{code}-{color}-{size}")})
            have.add((color, size))
            new_opts += 1
    seed["updatedAt"] = seed.get("updatedAt") or stamp

    # 편성 (오늘 이후, 같은 시각·같은 상품은 1번만)
    schedules, seen = [], set()
    for r in sorted(sched, key=lambda x: (x["방송시작"], x["채널"])):
        date = r["방송시작"][:10]
        if date < today:
            continue
        key = (r["방송시작"], r["상품코드"])
        if key in seen:
            continue
        seen.add(key)
        schedules.append({
            "code": r["상품코드"],
            "image": image_url(r["상품코드"], r.get("이미지", "")),
            "brand": r["브랜드"],
            "name": r["상품명"],
            "category": "",
            "colors": "",
            "sizes": "",
            "date": r["방송시작"][:16],
            "endDate": r["방송종료"][:16],
            "dateKey": date,
            "channel": CHANNELS[r["채널"]],
            "program": r["프로그램"],
            "location": "-",
            "isMaster": False,
        })

    master_list = sorted(masters.values(), key=lambda m: m["code"], reverse=True)
    data = {
        "updatedAt": stamp,
        "brands": sorted({m["brand"] for m in master_list if m["brand"]}),
        "categories": sorted({m["category"] for m in master_list if m["category"]}),
        "dates": sorted({s["dateKey"] for s in schedules}),
        "items": master_list + schedules,
    }
    with open(DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    with open(SEED_JSON, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=1)

    owned = {m["code"] for m in master_list}
    print(f"✅ 상품 {len(master_list)}개 (새 상품 {new_items}) · 초기재고 새 옵션 {new_opts}개 → {SEED_JSON}")
    print(f"✅ 편성 {len(schedules)}건 ({data['dates'][0] if data['dates'] else '-'} ~ {data['dates'][-1] if data['dates'] else '-'}), "
          f"우리 상품 편성 {sum(1 for s in schedules if s['code'] in owned)}건 → {DATA_JSON}")


if __name__ == "__main__":
    main()
