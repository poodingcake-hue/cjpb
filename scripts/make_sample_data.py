"""가상 특이사항·준비물·착장 데이터 만들기 (한 번만 돌리는 스크립트).

롯데 PB 앱의 실제 데이터(notes/supplies/outfits)를 참고해서 비슷한 문구·형식으로 만든다.
- 문구는 롯데 데이터의 줄들을 모아 상품별로 무작위로 섞어서 쓴다
- 착장자 이름은 실제 사람이 아닌 가상의 이름을 쓴다
- 이미 db/*.json 에 있는 상품코드는 건드리지 않는다 (사용자가 입력한 값 보존)

사용: python scripts/make_sample_data.py <롯데 저장소 경로>
"""
import json
import os
import random
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOTTE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "src", "lotte")
HOSTS = ["지민", "서연", "하린", "수아", "예린", "다은", "채원", "윤아"]  # 가상의 이름


def load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def main():
    lotte_notes = load(os.path.join(LOTTE, "notes.json"), [])
    lotte_supplies = load(os.path.join(LOTTE, "supplies.json"), [])
    lotte_outfits = load(os.path.join(LOTTE, "outfits.json"), [])

    # 문구 풀: 특이사항은 줄 단위, 준비물은 항목 단위
    # 롯데 브랜드명·특정 상품 전용 문구(예: '메인호스트:블랙,…')는 CJ 상품에 안 맞아서 뺀다
    lotte_data = load(os.path.join(LOTTE, "frontend", "public", "data.json"), {})
    brands = [b for b in lotte_data.get("brands", []) if len(b) >= 2] + ["네미루", "네메르", "롯데"]

    def generic(t):
        return (not any(b in t for b in brands) and ":" not in t and "호스트" not in t
                and not re.search(r"\d{6,}", t))

    note_lines = sorted({ln.strip() for n in lotte_notes for ln in str(n.get("text", "")).split("\n")
                         if 4 <= len(ln.strip()) <= 60 and generic(ln)})
    supply_items = sorted({t.strip() for s in lotte_supplies for t in re.split(r"[/&,]", str(s.get("text", "")))
                           if t.strip() and generic(t)})
    # 착장 사이즈 형식 (예: 모델S, S+3, 55)
    model_prefix = sum(1 for o in lotte_outfits if str(o.get("size", "")).startswith("모델")) / max(1, len(lotte_outfits))

    data = load(os.path.join(ROOT, "frontend", "public", "data.json"), {"items": []})
    masters = [i for i in data["items"] if i.get("isMaster")]

    notes = load(os.path.join(ROOT, "db", "notes.json"), [])
    supplies = load(os.path.join(ROOT, "db", "supplies.json"), [])
    outfits = load(os.path.join(ROOT, "db", "outfits.json"), [])
    has_note = {str(n["code"]) for n in notes}
    has_supply = {str(s["code"]) for s in supplies}
    has_outfit = {str(o["code"]) for o in outfits}

    added = {"notes": 0, "supplies": 0, "outfits": 0}
    for m in masters:
        code = str(m["code"])
        rnd = random.Random(f"cjpb-sample-{code}")  # 같은 상품이면 매번 같은 결과
        sizes = [s.strip() for s in str(m.get("sizes", "")).split(",") if s.strip()]

        if code not in has_note and note_lines and rnd.random() < 0.6:
            text = "\n".join(rnd.sample(note_lines, k=min(len(note_lines), rnd.randint(1, 3))))
            notes.append({"code": code, "text": text})
            added["notes"] += 1

        if code not in has_supply and supply_items and rnd.random() < 0.35:
            text = "/".join(rnd.sample(supply_items, k=min(len(supply_items), rnd.randint(1, 2))))
            supplies.append({"code": code, "text": text})
            added["supplies"] += 1

        if code not in has_outfit and sizes and rnd.random() < 0.7:
            for host in rnd.sample(HOSTS, k=rnd.randint(1, 3)):
                size = rnd.choice(sizes[: max(1, len(sizes) // 2 + 1)])  # 작은 쪽 사이즈 위주
                if rnd.random() < model_prefix:
                    size = f"모델{size}"
                elif rnd.random() < 0.15:
                    size = f"{size}+{rnd.choice([3, 5])}"
                outfits.append({"code": code, "host": host, "size": size})
                added["outfits"] += 1

    save(os.path.join(ROOT, "db", "notes.json"), notes)
    save(os.path.join(ROOT, "db", "supplies.json"), supplies)
    save(os.path.join(ROOT, "db", "outfits.json"), outfits)
    print(f"✅ 상품 {len(masters)}개 기준 — 특이사항 +{added['notes']}, 준비물 +{added['supplies']}, 착장 +{added['outfits']}건")
    print(f"   (참고한 롯데 데이터: 특이사항 문구 {len(note_lines)}줄, 준비물 {len(supply_items)}종, 착장 {len(lotte_outfits)}건)")


if __name__ == "__main__":
    main()
