# CJ PB 재고 앱

롯데 PB 앱(`poodingcake-hue/lotte`)을 **가상착장만 빼고 기능 그대로** 옮긴 CJ온스타일용 앱.
롯데 앱은 Cloudflare Worker(D1/R2)에 저장했지만, 이 앱은 서버 없이 **모든 데이터를 이 저장소 파일로 보관**합니다.

- `frontend/` — 롯데 앱 코드 그대로 (React + Vite + zustand). 저장 계층만 교체:
  - `src/api/github.ts` — GitHub Contents API로 db/*.json 읽기·쓰기 (충돌 시 재시도), 이미지 업로드
  - `src/api/client.ts` — 롯데 `apiClient` 대체 어댑터 (이미지 업로드→uploads/, AI 기능은 미지원 안내)
  - `src/store/useAppStore.ts` — 롯데와 같은 인터페이스, 저장 위치만 GitHub
  - `src/components/TokenButton.tsx` — 저장용 GitHub 토큰 입력 (기기별, localStorage)
- `crawler/` — CJ 편성표·상품 상세 크롤러 (`CJCRAWLING-` 저장소에서 복사)
- `scripts/build_app_data.py` — 크롤링 결과 → `frontend/public/data.json`(상품+편성), `seed_stock.json`(초기 임의 재고)

## 데이터 파일

| 파일 | 누가 쓰나 | 내용 |
|---|---|---|
| `frontend/public/data.json` | 봇 | 롯데와 같은 형식. 편성: 오늘 이후 **TV LIVE(CJ온스타일)만** (CJ온스타일+·라이브쇼 제외), **02:00~05:59 시작 방송 제외**, `channel` 필드에 표시 이름. 상품(isMaster): 그 편성에 나오고 **A/S 책임자에 'CJ ENM' 또는 'CJ온스타일'이 들어간** 상품 (CJ몰 고객센터 등 제외) |
| `frontend/public/seed_stock.json` | 봇 | 초기 임의 재고 0~8. 새 상품·옵션만 추가, **기존 값 절대 변경 안 함** |
| `db/products.json` | 앱 | 상품등록·수정. 자동 상품보다 우선. `deleted: true` 면 숨김 |
| `db/history.json` | 앱 | 재고 이력 (IN / RENT 음수 / RETURN 양수+ref_id / ADJUST) |
| `db/outfits.json`, `db/notes.json`, `db/supplies.json` | 앱 | 착장 / 특이사항 / 준비물. 처음 값은 `scripts/make_sample_data.py`가 롯데 데이터를 참고해 만든 **가상 데이터** (착장자는 가상 이름) |
| `uploads/` | 앱 | 상품 이미지 |

**재고 = seed_stock + SUM(history.qty)** (롯데 규칙과 같음: 재고는 저장하지 않고 이력에서 계산).
seed 행은 화면에 id `seed-…` 인 IN 이력으로 보이고, 수정하면 차이만큼 ADJUST 이력이 추가된다.
롯데 CLAUDE.md의 부호 규약·대여 표시 조건(RENT + ref_id RETURN 없음)이 그대로 적용된다.

## 롯데 앱과 다른 점
- 가상착장 없음
- AI 사이즈표 분석·AI 누끼는 서버(API 키)가 필요해서 미지원 (안내 메시지)
- 날씨 배지 없음 (롯데는 기상청 키를 서버에서 사용)
- 편성표는 시간+채널별로 묶고 시간 옆에 채널(TV LIVE) 배지 표시
- 저장하려면 기기마다 GitHub 토큰(🔒 버튼) 필요. 조회는 토큰 없이 가능

## 자동화

| 워크플로 | 주기 | 하는 일 |
|---|---|---|
| `update.yml` | 하루 4번 (06·11·16·21시 17분 KST) + 수동 | 크롤링(오늘~CJ 제공 마지막 날) → data.json·seed_stock → pull --rebase 후 커밋 |
| `deploy.yml` | push(db/·uploads/ 제외) + update 완료 시 | GitHub Pages 배포 (build/deploy 2개 job) |

CJ API는 공식 공개 API가 아니므로 실행 횟수·동시 요청 수(편성 5, 상세 8)를 늘리지 말 것.
