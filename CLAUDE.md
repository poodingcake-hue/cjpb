# CJ PB 재고 앱

CJ온스타일 편성표와 우리(PB) 재고를 맞춰 보는 앱. 롯데 PB 앱(`poodingcake-hue/lotte`)의 화면 껍데기를 복사했고,
서버(Cloudflare 등) 없이 **모든 데이터를 이 저장소 파일로 보관**합니다.

- `frontend/` — React + Vite, GitHub Pages 배포. `public/inventory.json`, `public/schedule.json` 을 읽기만 함
- `crawler/` — CJ 편성표·상품 상세 크롤러 (`CJCRAWLING-` 저장소에서 복사)
- `scripts/build_app_data.py` — 크롤링 결과(`data/*.csv`)로 앱 데이터 생성
- `data/` — 크롤링 원본 CSV

## 재고 규칙 (`frontend/public/inventory.json`)

- 대상: **A/S 책임자에 "CJ ENM"이 들어간 상품만** (공백·대소문자 무시, ㈜ 유무 무관)
- 처음 보는 상품·옵션만 자동 추가, 수량은 **임의 값 0~8** (단품코드 해시라 다시 돌려도 같은 값)
- 이미 있는 상품·옵션의 수량은 **절대 덮어쓰지 않음** → 수량은 이 파일을 직접 고치면 됨
- 편성에서 사라진 상품도 재고에서 지우지 않음

## 자동화

| 워크플로 | 주기 | 하는 일 |
|---|---|---|
| `update.yml` | 하루 4번 (06·11·16·21시 17분 KST) + 수동 | 크롤링 → 앱 데이터 → 커밋 |
| `deploy.yml` | push + update 완료 시 | GitHub Pages 배포 |

CJ API는 공식 공개 API가 아니므로 실행 횟수·동시 요청 수(편성 5, 상세 8)를 늘리지 말 것.
