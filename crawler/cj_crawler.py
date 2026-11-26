"""CJ온스타일 TV 편성표 크롤러.

모바일 편성표 페이지가 쓰는 API(display-frontapi.cjonstyle.com/schedule/broadcast/list)를
Playwright 브라우저 세션으로 호출해서, 채널별 편성(방송시간·프로그램·상품)을 cj_schedule.csv 로 저장합니다.

환경 변수
  CJ_DAYS   오늘부터 며칠치를 저장할지 (기본: 오늘부터 CJ가 제공하는 마지막 날까지 전부)
  CJ_DATE   특정 날짜만 받을 때 YYYYMMDD (설정하면 CJ_DAYS 무시)

'함께 방송하는 상품'은 편성표 API에 1개만 들어 있어서, 화면의 '더보기'와 같은
schedule/otherItem/list API를 방송마다 추가로 호출해 전체 목록을 받습니다.
"""
import asyncio
import csv
import datetime
import os

from playwright.async_api import async_playwright

PAGE_URL = "https://display.cjonstyle.com/m/homeTab/main?hmtabMenuId=H00055"
API_URL = (
    "https://display-frontapi.cjonstyle.com/schedule/broadcast/list"
    "?broadType=&isPurchaseLive=false&categoryList=&brandList=&programList=&pmType=M"
    "&bdDt={date}&isEmployee=false&includeOpnPreplnYn=Y&menuId=H00055&employeeDiscountRate=0"
)
OTHER_URL = (
    "https://display-frontapi.cjonstyle.com/schedule/otherItem/list"
    "?broadType={broadType}&bdDt={bdDt}&pgmCd={pgmCd}&brandCd={brandCd}&repBrandCd={repBrandCd}"
    "&pmType=M&isEmployee=false&bdTm={bdTm}&includeOpnPreplnYn=Y&menuId=H00055&employeeDiscountRate=0"
)
OUT_CSV = "cj_schedule.csv"
KST = datetime.timezone(datetime.timedelta(hours=9))

CHANNEL_NAMES = {"TV": "CJ온스타일", "PLUS": "CJ온스타일+", "MLC": "CJ온스타일 라이브"}

FIELDS = ["수집시각", "방송일", "채널", "방송시작", "방송종료", "프로그램", "구분",
          "상품코드", "상품명", "브랜드", "판매가", "할인가", "함께방송수", "이전방송", "다음방송", "상품링크", "이미지"]
DATE_LIST_URL = ("https://display-frontapi.cjonstyle.com/schedule/date/list?broadType=&isPurchaseLive=false"
                 "&categoryList=&brandList=&programList=&pmType=M&includeOpnPreplnYn=Y")


def hm(dtm):
    """'2026-11-25T00:45:00' -> '2026-11-25 00:45'"""
    return (dtm or "").replace("T", " ")[:16]


def item_row(item, kind):
    if not item:
        return None
    base = item.get("itemBaseInfo") or {}
    if not base.get("itemCd"):
        return None
    return {
        "구분": kind,
        "상품코드": base.get("itemCd", ""),
        "상품명": (base.get("displayItemName") or base.get("itemNm") or "").strip(),
        "브랜드": base.get("repBrandNm") or item.get("brandNm") or "",
        "판매가": base.get("salePrice") or "",
        "할인가": base.get("custSalePrice") or "",
        "상품링크": (base.get("itemLink") or "").split("?")[0],
        "이미지": ("https:" + base["imgUrlList"][0].split("?")[0]) if base.get("imgUrlList") else "",
    }


def other_query(p, it, bd_dt=None):
    """함께방송 상품 목록 API 파라미터 (화면의 '함께 방송하는 상품 더보기'와 같은 요청)."""
    rep = it.get("repItem") or {}
    base = rep.get("itemBaseInfo") or {}
    return OTHER_URL.format(
        broadType=p.get("broadType") or "",
        bdDt=bd_dt or (p.get("bdDt") or "")[:10].replace("-", ""),
        pgmCd=p.get("pgmCd") or "",
        brandCd=rep.get("brandCd") or "",
        repBrandCd=base.get("repBrandCd") or "",
        bdTm=(p.get("bdStrDtm") or "")[11:16].replace(":", ""),
    )


async def fetch_others(request, urls, sem):
    """urls 를 차례로 시도해서 목록이 나오는 첫 결과를 돌려준다."""
    for url in urls:
        got = await _fetch_one(request, url, sem)
        if got:
            return got
    return None


async def _fetch_one(request, url, sem):
    async with sem:
        for attempt in range(3):
            try:
                r = await request.get(url, headers={"Referer": PAGE_URL, "Accept": "application/json"}, timeout=30000)
                if r.ok:
                    data = await r.json()
                    return ((data or {}).get("result") or {}).get("otherItemList") or []
            except Exception:
                pass
            await asyncio.sleep(1 + attempt)
    return None  # 실패


async def parse(request, data, bd_date, sem):
    rows, stats = [], {"calls": 0, "fail": 0}
    programs = (((data or {}).get("result") or {}).get("programList")) or []

    # 함께방송 목록이 필요한 항목들을 먼저 모아서 병렬로 받는다
    page_dt = bd_date.replace("-", "")
    jobs = {}
    for p in programs:
        for it in p.get("itemList") or []:
            if (it.get("otherItemCnt") or 0) >= 1:
                key = other_query(p, it)
                # 방송일(bdDt)로 먼저, 안 되면 조회 날짜로 다시 시도
                jobs.setdefault(key, [key, other_query(p, it, page_dt)])
    keys = list(jobs)
    results = await asyncio.gather(*(fetch_others(request, jobs[k], sem) for k in keys))
    jobs = dict(zip(keys, results))
    stats["calls"] = len(keys)
    stats["fail"] = sum(1 for v in results if v is None)
    stats["short"] = 0

    for p in programs:
        common = {
            "방송일": bd_date,
            "채널": CHANNEL_NAMES.get(p.get("broadType"), p.get("broadType") or ""),
            "방송시작": hm(p.get("bdStrDtm")),
            "방송종료": hm(p.get("bdEndDtm")),
            "프로그램": p.get("pgmNm") or "",
        }
        for it in p.get("itemList") or []:
            cnt = it.get("otherItemCnt") or 0
            rep = item_row(it.get("repItem"), "대표")
            others = [it.get("otherItem")] if it.get("otherItem") else []
            full = jobs.get(other_query(p, it))
            if full:
                others = full
                if len(full) < cnt:  # 화면 '더보기' 숫자보다 적게 받으면 기록
                    stats["short"] += 1
            seen = {rep["상품코드"]} if rep else set()
            other_rows = []
            for o in others:
                row = item_row(o, "함께방송")
                if row and row["상품코드"] not in seen:
                    seen.add(row["상품코드"])
                    other_rows.append({**common, **row, "함께방송수": ""})
            if rep:
                rows.append({**common, **rep, "함께방송수": len(other_rows)})
            rows.extend(other_rows)
    return rows, stats


def target_dates():
    """저장할 날짜. 기본은 None = 오늘부터 CJ가 제공하는 마지막 날짜까지(아래 main 에서 결정)."""
    if os.environ.get("CJ_DATE"):
        return [os.environ["CJ_DATE"]]
    if os.environ.get("CJ_DAYS"):
        days = int(os.environ["CJ_DAYS"])
        today = datetime.datetime.now(KST).date()
        return [(today + datetime.timedelta(days=i)).strftime("%Y%m%d") for i in range(days)]
    return None


async def main():
    all_rows = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(**p.devices["iPhone 13"], locale="ko-KR", timezone_id="Asia/Seoul")
        page = await context.new_page()
        print(f"🌐 세션 준비: {PAGE_URL}")
        await page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2000)

        sem = asyncio.Semaphore(5)  # 동시에 5개까지만 요청
        targets = target_dates()
        today = datetime.datetime.now(KST).strftime("%Y%m%d")

        # 이전/다음 방송 계산용: CJ가 편성표를 제공하는 날짜 전체(보통 지난 3일 ~ 다음 10일)
        window = list(targets or [today])
        r = await context.request.get(DATE_LIST_URL, headers={"Referer": PAGE_URL})
        if r.ok:
            dl = ((await r.json()) or {}).get("result") or []
            window = sorted(set(window) | {x["bdDtm"] for x in dl if x.get("activeYn") == "Y"})
        if targets is None:  # 기본: 오늘 이후 전부
            targets = [d for d in window if d >= today]
        print(f"🗓️ 저장 날짜 {targets}, 이전/다음 방송 계산 범위 {window[0]}~{window[-1]} ({len(window)}일)")

        window_rows = []
        for d in window:
            resp = await context.request.get(
                API_URL.format(date=d),
                headers={"Referer": PAGE_URL, "Accept": "application/json"},
                timeout=30000,
            )
            if not resp.ok:
                print(f"⚠️ {d}: HTTP {resp.status}")
                continue
            rows, st = await parse(context.request, await resp.json(), f"{d[:4]}-{d[4:6]}-{d[6:]}", sem)
            print(f"📅 {d}: {len(rows)}건 (함께방송 목록 요청 {st['calls']}회, 실패 {st['fail']}회, 개수 부족 {st['short']}회)")
            window_rows.extend(rows)
            if d in targets:
                all_rows.extend(rows)
        await browser.close()

    # 상품코드별 방송 시작시각 목록 → 각 행의 이전/다음 방송
    times = {}
    for r in window_rows:
        times.setdefault(r["상품코드"], set()).add(r["방송시작"])
    for code in times:
        times[code] = sorted(times[code])
    for r in all_rows:
        ts = times.get(r["상품코드"], [])
        r["이전방송"] = max((t for t in ts if t < r["방송시작"]), default="")
        r["다음방송"] = min((t for t in ts if t > r["방송시작"]), default="")

    # 같은 방송 안에서는 '대표 → 그 대표의 함께방송' 순서를 유지 (안정 정렬)
    all_rows.sort(key=lambda r: (r["방송시작"], r["채널"], r["프로그램"]))
    now = datetime.datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    with open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in all_rows:
            w.writerow({"수집시각": now, **r})

    print(f"✅ 총 {len(all_rows)}건 → {OUT_CSV}")
    for r in all_rows[:10]:
        print(f"  {r['방송시작']} [{r['채널']}] {r['프로그램'][:15]} | {r['상품코드']} | {r['상품명'][:30]} | {r['판매가']}")
    if not all_rows:
        raise SystemExit("편성 데이터를 하나도 받지 못했습니다.")


if __name__ == "__main__":
    asyncio.run(main())
