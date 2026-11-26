"""편성표(cj_schedule.csv)에 나온 상품코드별로 옵션(색상/사이즈/재고)과 정보고시(A/S 책임자 등)를 수집.

결과
  cj_items.csv         상품 1개당 1줄: 색상·사이즈 목록, 옵션 수, 총재고, A/S 책임자, 품질보증기준 ...
  cj_item_options.csv  단품(SKU) 1개당 1줄: 옵션명, 색상, 사이즈, 재고

사용하는 API (상품 상세 화면이 부르는 것과 같음)
  display.cjonstyle.com/c/rest/item/{code}/options.json          옵션(단품) 목록
  display.cjonstyle.com/c/rest/item/{code}/unitItemsStock.json   단품별 재고
  item.cjonstyle.com/api/explain/compliance-info                 상품정보제공고시(A/S 책임자 등)

환경 변수
  CJ_ITEMS_LIMIT  테스트용으로 상품 수 제한 (기본: 전부)
"""
import asyncio
import csv
import datetime
import html
import json
import os
import re

from playwright.async_api import async_playwright

SCHEDULE_CSV = "cj_schedule.csv"
ITEMS_CSV = "cj_items.csv"
OPTIONS_CSV = "cj_item_options.csv"
CHN = "30002002"
KST = datetime.timezone(datetime.timedelta(hours=9))
PAGE_URL = "https://display.cjonstyle.com/m/homeTab/main?hmtabMenuId=H00055"

OPTIONS_URL = ("https://display.cjonstyle.com/c/rest/item/{code}/options.json"
               "?channelCode={chn}&isEmployee=false&inflowCode=I0619&employeeDiscountRate=0")
STOCK_URL = "https://display.cjonstyle.com/c/rest/item/{code}/unitItemsStock.json?channelCode={chn}"
COMPLIANCE_URL = "https://item.cjonstyle.com/api/explain/compliance-info?itemCd={code}&chnCd={chn}"

COLOR_WORDS = ("색상", "컬러", "COLOR", "색")
SIZE_WORDS = ("사이즈", "SIZE", "치수", "크기", "호수")


async def get_json(request, url, sem, referer):
    async with sem:
        for attempt in range(3):
            try:
                r = await request.get(url, headers={"Referer": referer, "Accept": "application/json"}, timeout=30000)
                if r.ok:
                    return await r.json()
            except Exception:
                pass
            await asyncio.sleep(1 + attempt)
    return None


def unwrap(d):
    """{"result": {...}} / {"data": {...}} 같은 껍데기 벗기기."""
    for k in ("result", "data"):
        if isinstance(d, dict) and isinstance(d.get(k), (dict, list)):
            d = d[k]
    return d


def parse_compliance(d):
    """정보고시 항목명 → 내용 dict."""
    out = {}

    def walk(o):
        if isinstance(o, dict):
            name, note = o.get("explItemNm"), o.get("explainNote")
            if name and note is not None:
                txt = html.unescape(re.sub(r"<br\s*/?>", " ", str(note), flags=re.I))
                out[str(name).strip()] = re.sub(r"\s+", " ", txt).strip()
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(d)
    return out


def find_key(info, *words):
    for k, v in info.items():
        if any(w in k for w in words):
            return v
    return ""


def parse_options(d):
    """options.json → (옵션 차원 이름들, 단품 목록)."""
    d = unwrap(d) or {}
    opt_type = d.get("itemOptionType") or {}
    dim_names = [opt_type.get(f"diffId{i}Nm") for i in range(1, 5)]
    units = []
    for u in d.get("unitItems") or []:
        name = (u.get("name") or "").strip()
        units.append({
            "단품코드": u.get("unitItemCode") or u.get("unitCode") or u.get("unitCd") or u.get("uitemCd") or "",
            "옵션명": name,
            "parts": [p.strip() for p in re.split(r"\s*/\s*", name) if p.strip()] if name else [],
            "diff": [u.get(f"diffId{i}") for i in range(1, 5)],
            "판매가": u.get("price") or "",
            "품절": u.get("soldOutYn") or u.get("isSoldOut") or "",
        })
    return dim_names, units


def split_color_size(dim_names, parts):
    """옵션명 'A/B'를 색상/사이즈로 나눈다. 차원 이름에 색상/사이즈가 있으면 그걸 따른다."""
    color = size = ""
    if parts in (["단일상품"], ["단일 상품"], ["단품"]):
        return "", ""
    names = [n or "" for n in dim_names]
    for i, part in enumerate(parts):
        n = names[i] if i < len(names) else ""
        if any(w in n.upper() for w in [w.upper() for w in COLOR_WORDS]):
            color = part
        elif any(w in n.upper() for w in [w.upper() for w in SIZE_WORDS]):
            size = part
    if not color and not size:
        if len(parts) >= 2:
            color, size = parts[0], parts[1]
        elif len(parts) == 1:
            # 숫자/영문 사이즈처럼 보이면 사이즈, 아니면 색상
            if re.fullmatch(r"(FREE|F|XS|S|M|L|XL|XXL|\d{2,3}(\.\d)?|\d?XL|\d{2,3}[A-Z]?)", parts[0].upper()):
                size = parts[0]
            else:
                color = parts[0]
    return color, size


def uniq(seq):
    seen, out = set(), []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


async def collect(request, item, sem, debug):
    code = item["상품코드"]
    referer = f"https://item.cjonstyle.com/nfront/item/{code}?channelCode={CHN}"
    opt_d, stock_d, comp_d = await asyncio.gather(
        get_json(request, OPTIONS_URL.format(code=code, chn=CHN), sem, referer),
        get_json(request, STOCK_URL.format(code=code, chn=CHN), sem, referer),
        get_json(request, COMPLIANCE_URL.format(code=code, chn=CHN), sem, referer),
    )
    if debug:
        print("── 디버그 options.json:", json.dumps(opt_d, ensure_ascii=False)[:2500])
        print("── 디버그 compliance:", json.dumps(comp_d, ensure_ascii=False)[:1500])

    dim_names, units = parse_options(opt_d) if opt_d else ([], [])
    stock_map = {}
    for s in (unwrap(stock_d) or {}).get("unitItemsStock", []) if isinstance(unwrap(stock_d), dict) else []:
        stock_map[str(s.get("unitItemCode"))] = s.get("stock")

    opt_rows = []
    for u in units:
        color, size = split_color_size(dim_names, u["parts"])
        opt_rows.append({
            "상품코드": code, "상품명": item["상품명"], "단품코드": u["단품코드"], "옵션명": u["옵션명"],
            "색상": color, "사이즈": size,
            "재고": stock_map.get(str(u["단품코드"]), ""), "판매가": u["판매가"],
        })

    info = parse_compliance(comp_d) if comp_d else {}
    stocks = [r["재고"] for r in opt_rows if isinstance(r["재고"], int)]
    row = {
        "상품코드": code,
        "상품명": item["상품명"],
        "브랜드": item["브랜드"],
        "옵션수": len(opt_rows),
        "색상(옵션)": ", ".join(uniq(r["색상"] for r in opt_rows)),
        "사이즈(옵션)": ", ".join(uniq(r["사이즈"] for r in opt_rows)),
        "총재고": sum(stocks) if stocks else "",
        "A/S 책임자": find_key(info, "A/S", "AS 책임", "AS책임") or find_key(info, "소비자상담", "소비자 상담", "상담 관련"),
        "품질보증기준": find_key(info, "품질보증"),
        "제조자/수입자": find_key(info, "제조자", "수입자", "제조사"),
        "제조국": find_key(info, "제조국", "원산지"),
        "정보고시 색상": find_key(info, *COLOR_WORDS),
        "정보고시 치수": find_key(info, "치수", "사이즈", "크기", "용량"),
        "상품링크": f"https://item.cjonstyle.com/item/{code}",
        "_ok": bool(opt_d) and bool(comp_d),
    }
    return row, opt_rows


async def main():
    with open(SCHEDULE_CSV, encoding="utf-8-sig") as f:
        sched = list(csv.DictReader(f))
    items, seen = [], set()
    for r in sched:
        if r["상품코드"] and r["상품코드"] not in seen:
            seen.add(r["상품코드"])
            items.append(r)
    limit = int(os.environ.get("CJ_ITEMS_LIMIT", "0") or 0)
    if limit:
        items = items[:limit]
    print(f"🧾 상품 {len(items)}개 상세 수집 시작")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(**p.devices["iPhone 13"], locale="ko-KR", timezone_id="Asia/Seoul")
        page = await ctx.new_page()
        await page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1500)

        sem = asyncio.Semaphore(8)
        results = await asyncio.gather(*(collect(ctx.request, it, sem, i == 0) for i, it in enumerate(items)))
        await browser.close()

    now = datetime.datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    item_rows = [r for r, _ in results]
    opt_rows = [o for _, opts in results for o in opts]
    fail = sum(1 for r in item_rows if not r.pop("_ok"))

    with open(ITEMS_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["수집시각"] + list(item_rows[0].keys()))
        w.writeheader()
        for r in item_rows:
            w.writerow({"수집시각": now, **r})
    with open(OPTIONS_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["수집시각", "상품코드", "상품명", "단품코드", "옵션명", "색상", "사이즈", "재고", "판매가"])
        w.writeheader()
        for r in opt_rows:
            w.writerow({"수집시각": now, **r})

    with_as = sum(1 for r in item_rows if r["A/S 책임자"])
    print(f"✅ 상품 {len(item_rows)}개 → {ITEMS_CSV} (A/S 책임자 있음 {with_as}개, 일부 실패 {fail}개)")
    print(f"✅ 단품 {len(opt_rows)}개 → {OPTIONS_CSV}")
    for r in item_rows[:8]:
        print(f"  {r['상품코드']} | {r['상품명'][:22]} | 색상[{r['색상(옵션)'][:30]}] 사이즈[{r['사이즈(옵션)'][:30]}] | AS: {r['A/S 책임자'][:40]}")


if __name__ == "__main__":
    asyncio.run(main())
