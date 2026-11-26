import { create } from 'zustand';
import { apiClient } from '../api/client';
import { readJson, updateJson } from '../api/github';
import { AppState, HistoryLog } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 롯데 앱 useAppStore 와 같은 기능·인터페이스. 저장 위치만 Cloudflare → GitHub 저장소 파일.
//
// 재고 = seed_stock.json(봇이 만든 초기 임의 재고) + db/history.json 의 qty 합계
// seed 는 화면에서 'IN' 이력(id: seed-…)처럼 보이고, 수정하면 ADJUST 이력으로 차이만 기록된다.
// ─────────────────────────────────────────────────────────────────────────────

const P = {
  products: 'db/products.json',
  history: 'db/history.json',
  outfits: 'db/outfits.json',
  notes: 'db/notes.json',
  supplies: 'db/supplies.json',
};

const newId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const isSeed = (id: any) => String(id).startsWith('seed-');

type StockRow = { color: string; size: string; qty: number };

function addToStock(stockMap: Record<string, StockRow[]>, code: string, color: string, size: string, delta: number) {
  if (!delta) return;
  const items = (stockMap[code] || []).map(x => ({ ...x }));
  const idx = items.findIndex(i => i.color === color && i.size === size);
  if (idx !== -1) items[idx].qty = Number(items[idx].qty) + delta;
  else items.push({ color, size, qty: delta });
  stockMap[code] = items;
}

export const useAppStore = create<AppState>((set, get) => ({
  allItems: [],
  allStockMap: {},
  allOutfits: [],
  allNotes: [],
  allSupplies: [],
  allHistory: [],
  allWeather: null,
  selDate: null,
  filteredItems: [],
  rentalCart: [],
  isLoading: false,
  error: null,

  invSearchTerm: '',
  invSelectedBrand: '',
  invSelectedCate: '',
  invVisibleCount: 40,

  setAllOutfits: (outfits) => set({ allOutfits: outfits }),
  setAllNotes: (notes) => set({ allNotes: notes }),
  setAllSupplies: (supplies) => set({ allSupplies: supplies }),
  setAllStockMap: (map) => set({ allStockMap: map }),
  setAllHistory: (history) => set({ allHistory: history }),
  setSelDate: (date) => set({ selDate: date }),
  setIsLoading: (v) => set({ isLoading: v }),
  setInvSearchTerm: (v) => set({ invSearchTerm: v }),
  setInvSelectedBrand: (v) => set({ invSelectedBrand: v }),
  setInvSelectedCate: (v) => set({ invSelectedCate: v }),
  setInvVisibleCount: (v) => set({ invVisibleCount: v }),
  addToCart: (item) => set((state) => ({ rentalCart: [...state.rentalCart, item] })),
  clearCart: () => set({ rentalCart: [] }),

  apiClient,

  // 착장/유의사항/부자재 저장 (상품코드 단위로 덮어쓰기)
  saveToBackend: async (fileName: string, data: any, productCode: string) => {
    const code = String(productCode);
    if (fileName === 'outfits.json') {
      const mine = data.filter((o: any) => String(o.code) === code);
      await updateJson<any[]>(P.outfits, [], cur => [...cur.filter(o => String(o.code) !== code), ...mine], `착장 저장 ${code}`);
    } else if (fileName === 'notes.json' || fileName === 'supplies.json') {
      const path = fileName === 'notes.json' ? P.notes : P.supplies;
      const row = data.find((n: any) => String(n.code) === code);
      const text = row ? row.text : '';
      await updateJson<any[]>(path, [], cur => {
        const rest = cur.filter(n => String(n.code) !== code);
        return text ? [...rest, { code, text }] : rest;
      }, `${fileName === 'notes.json' ? '유의사항' : '부자재'} 저장 ${code}`);
    } else {
      throw new Error(`알 수 없는 저장 대상: ${fileName}`);
    }
  },

  // 상품 저장 (등록/수정). 자동 생성 상품보다 우선한다.
  saveProductToBackend: async (newProduct: any) => {
    const code = String(newProduct.code);
    const product = { ...newProduct, code, isMaster: true, deleted: false };
    await updateJson<any[]>(P.products, [], cur => [...cur.filter(p => String(p.code) !== code), product], `상품 저장 ${code}`);
    set(state => {
      const filtered = state.allItems.filter(p => !(p.isMaster && String(p.code) === code));
      return { allItems: [...filtered, product] };
    });
  },

  // 상품 삭제: 상품·이력·착장·유의사항·부자재에서 지우고, 자동 생성 상품이 다시 안 보이게 deleted 표시
  deleteProductFromBackend: async (productCode: string) => {
    const sCode = String(productCode);
    await updateJson<any[]>(P.products, [], cur => [...cur.filter(p => String(p.code) !== sCode), { code: sCode, deleted: true }], `상품 삭제 ${sCode}`);
    await updateJson<any[]>(P.history, [], cur => cur.filter(h => String(h.code) !== sCode), `상품 삭제(이력) ${sCode}`);
    await updateJson<any[]>(P.outfits, [], cur => cur.filter(o => String(o.code) !== sCode), `상품 삭제(착장) ${sCode}`);
    await updateJson<any[]>(P.notes, [], cur => cur.filter(o => String(o.code) !== sCode), `상품 삭제(유의사항) ${sCode}`);
    await updateJson<any[]>(P.supplies, [], cur => cur.filter(o => String(o.code) !== sCode), `상품 삭제(부자재) ${sCode}`);
    set(state => {
      const allItems = state.allItems.filter(p => !(p.isMaster && String(p.code) === sCode));
      const allStockMap = { ...state.allStockMap };
      delete allStockMap[sCode];
      return {
        allItems,
        allStockMap,
        allHistory: state.allHistory.filter(h => String(h.code) !== sCode),
        allOutfits: state.allOutfits.filter(o => String(o.code) !== sCode),
        allNotes: state.allNotes.filter(n => String(n.code) !== sCode),
        allSupplies: state.allSupplies.filter(s => String(s.code) !== sCode),
      };
    });
  },

  // 상품코드 변경: 모든 파일에서 코드를 바꾸고, 초기 임의 재고(seed)는 새 코드의 ADJUST 이력으로 옮긴다
  changeProductCodeInBackend: async (oldCode: string, newCode: string) => {
    const sOld = String(oldCode).trim();
    const sNew = String(newCode).trim();
    if (!sNew || sOld === sNew) throw new Error('새 상품코드를 확인해 주세요.');
    const state = get();
    if (state.allItems.some(i => i.isMaster && String(i.code) === sNew)) throw new Error('이미 있는 상품코드예요.');
    const master = state.allItems.find(i => i.isMaster && String(i.code) === sOld);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const seedMoves: HistoryLog[] = state.allHistory
      .filter(h => isSeed(h.id) && String(h.code) === sOld && Number(h.qty))
      .map(h => ({ id: newId(), code: sNew, color: h.color, size: h.size, type: 'ADJUST', qty: Number(h.qty), actor: '시스템', date: now, note: `상품코드 변경 (${sOld} → ${sNew}) 초기재고 이관` }));

    await updateJson<any[]>(P.products, [], cur => {
      const rest = cur.filter(p => String(p.code) !== sOld && String(p.code) !== sNew);
      const base = cur.find(p => String(p.code) === sOld) || master || { brand: '', name: '', category: '', image: '' };
      return [...rest, { ...base, code: sNew, isMaster: true, deleted: false }, { code: sOld, deleted: true }];
    }, `상품코드 변경 ${sOld} → ${sNew}`);
    await updateJson<any[]>(P.history, [], cur => [...cur.map(h => String(h.code) === sOld ? { ...h, code: sNew } : h), ...seedMoves], `상품코드 변경(이력) ${sOld} → ${sNew}`);
    for (const path of [P.outfits, P.notes, P.supplies]) {
      await updateJson<any[]>(path, [], cur => cur.map(o => String(o.code) === sOld ? { ...o, code: sNew } : o), `상품코드 변경 ${sOld} → ${sNew}`);
    }

    set(s => {
      const allItems = s.allItems.map(item => (item.isMaster && String(item.code) === sOld) ? { ...item, code: sNew } : item);
      const allStockMap = { ...s.allStockMap };
      if (allStockMap[sOld]) { allStockMap[sNew] = allStockMap[sOld]; delete allStockMap[sOld]; }
      const allHistory = [
        ...s.allHistory.filter(h => !(isSeed(h.id) && String(h.code) === sOld)).map(h => String(h.code) === sOld ? { ...h, code: sNew } : h),
        ...seedMoves,
      ];
      const ren = (arr: any[]) => arr.map(o => String(o.code) === sOld ? { ...o, code: sNew } : o);
      return { allItems, allStockMap, allHistory, allOutfits: ren(s.allOutfits), allNotes: ren(s.allNotes), allSupplies: ren(s.allSupplies) };
    });
  },

  // 이력 추가 (입고/대여/반납/조정). 저장된 로그(id 포함)를 같은 순서로 돌려준다.
  saveHistoryToBackend: async (newHistoryLogs: any) => {
    const logsWithIds = newHistoryLogs.map((log: any) => ({ ...log, id: log.id || newId() }));
    await updateJson<any[]>(P.history, [], cur => [...cur, ...logsWithIds], `재고 이력 ${logsWithIds.length}건 (${logsWithIds[0]?.type || ''})`);
    set(state => {
      const stockMap = { ...state.allStockMap };
      logsWithIds.forEach((log: any) => addToStock(stockMap, String(log.code), log.color, log.size, Number(log.qty)));
      return { allHistory: [...state.allHistory, ...logsWithIds], allStockMap: stockMap };
    });
    return logsWithIds;
  },

  // 이력 수정. 초기 임의 재고(seed) 행은 파일이 따로라서 차이만큼 ADJUST 이력을 추가한다.
  updateHistoryInBackend: async (updatedLogs: any) => {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const real = updatedLogs.filter((l: any) => !isSeed(l.id));
    const seedAdjusts = updatedLogs
      .filter((l: any) => isSeed(l.id) && Number(l.deltaQty))
      .map((l: any) => ({ id: newId(), code: l.code, color: l.color, size: l.size, type: 'ADJUST', qty: Number(l.deltaQty), actor: l.actor || '관리자', date: now, note: '초기재고 수정' }));

    await updateJson<any[]>(P.history, [], cur => {
      const next = cur.map(h => {
        const u = real.find((x: any) => String(x.id) === String(h.id));
        if (!u) return h;
        return { ...h, qty: u.qty, date: u.date, note: u.note, actor: u.actor !== undefined ? u.actor : h.actor };
      });
      return [...next, ...seedAdjusts];
    }, `재고 이력 수정 ${updatedLogs.length}건`);

    set(state => {
      const newHistory = [...state.allHistory];
      const stockMap = { ...state.allStockMap };
      updatedLogs.forEach((u: any) => {
        const idx = newHistory.findIndex(h => String(h.id) === String(u.id));
        if (idx !== -1) {
          newHistory[idx] = { ...newHistory[idx], qty: u.qty, date: u.date, note: u.note, actor: u.actor !== undefined ? u.actor : newHistory[idx].actor };
        }
        if (u.deltaQty) addToStock(stockMap, String(u.code), u.color, u.size, Number(u.deltaQty));
      });
      return { allHistory: newHistory, allStockMap: stockMap };
    });
  },

  initApp: async () => {
    set({ isLoading: true, error: null });
    try {
      const ts = Date.now();
      const baseUrl = import.meta.env.BASE_URL;

      // 1) 봇이 만든 정적 데이터 (편성표 + CJ ENM 자동 상품, 초기 임의 재고)
      const [masterData, seed] = await Promise.all([
        fetch(`${baseUrl}data.json?v=${ts}`).then(r => r.json()),
        fetch(`${baseUrl}seed_stock.json?v=${ts}`).then(r => (r.ok ? r.json() : { stock: {} })).catch(() => ({ stock: {} })),
      ]);

      // 2) 앱이 저장한 데이터 (GitHub 저장소 db/)
      const [products, history, outfits, notes, supplies] = await Promise.all([
        readJson<any[]>(P.products, []),
        readJson<any[]>(P.history, []),
        readJson<any[]>(P.outfits, []),
        readJson<any[]>(P.notes, []),
        readJson<any[]>(P.supplies, []),
      ]);

      const deletedCodes = new Set(products.filter(p => p.deleted).map(p => String(p.code)));
      const savedProducts = products.filter(p => !p.deleted).map(p => ({ ...p, isMaster: true }));

      // 재고 = seed + 이력
      const seedDate = seed.updatedAt || '';
      const seedLogs: HistoryLog[] = [];
      const stockMap: Record<string, StockRow[]> = {};
      Object.entries((seed.stock || {}) as Record<string, StockRow[]>).forEach(([code, rows]) => {
        if (deletedCodes.has(String(code))) return;
        rows.forEach(r => {
          addToStock(stockMap, String(code), r.color, r.size, Number(r.qty));
          seedLogs.push({ id: `seed-${code}-${r.color}-${r.size}`, code: String(code), color: r.color, size: r.size, type: 'IN', qty: Number(r.qty), actor: '초기재고(임의)', date: seedDate, note: '자동 생성 임의 수량' });
        });
      });
      history.forEach(h => addToStock(stockMap, String(h.code), h.color, h.size, Number(h.qty)));

      // 상품 = 저장한 상품 우선 + 자동 상품(CJ ENM) + 재고만 있는 상품(미등록)
      const schedules = (masterData.items || []).filter((i: any) => !i.isMaster);
      const autoMasters = (masterData.items || []).filter((i: any) => i.isMaster && !deletedCodes.has(String(i.code)));
      const savedKeys = new Set(savedProducts.map(p => String(p.code)));
      const combinedMasters = [...autoMasters.filter((m: any) => !savedKeys.has(String(m.code))), ...savedProducts];
      const allMasterKeys = new Set(combinedMasters.map(m => String(m.code)));
      const dummyProducts = Object.keys(stockMap)
        .filter(k => !allMasterKeys.has(String(k)) && !deletedCodes.has(String(k)))
        .map(code => ({ code, brand: '미등록', name: '기본 정보가 없는 상품 (재고만 존재)', category: '-', image: '', isMaster: true }));

      let weather = null;
      try {
        const w = await fetch(`${baseUrl}weather.json?v=${ts}`);
        if (w.ok) { const wd = await w.json(); if (wd && wd.hourly) weather = wd; }
      } catch { /* 날씨 없음 */ }

      set({
        allItems: [...combinedMasters, ...dummyProducts, ...schedules],
        allStockMap: stockMap,
        allOutfits: outfits,
        allNotes: notes,
        allSupplies: supplies,
        allHistory: [...seedLogs, ...history],
        allWeather: weather,
        isLoading: false,
      });
    } catch (error) {
      console.error('Initialization error:', error);
      set({ error: 'Failed to load data', isLoading: false });
    }
  },
}));
