import { useEffect, useState } from 'react';

export interface InvOption { unitCode: string; color: string; size: string; qty: number }
export interface InvItem {
  code: string; name: string; brand: string; as: string; image: string; link: string;
  addedAt: string; options: InvOption[];
}
export interface SlotItem {
  code: string; name: string; brand: string; type: string; price: string; salePrice: string;
  image: string; as: string; prev: string; next: string; owned: boolean;
}
export interface Slot { date: string; start: string; end: string; channel: string; program: string; items: SlotItem[] }

export interface AppData {
  loading: boolean;
  error: string;
  inventory: Record<string, InvItem>;
  inventoryUpdatedAt: string;
  slots: Slot[];
  scheduleUpdatedAt: string;
}

const base = import.meta.env.BASE_URL;
let cache: Promise<AppData> | null = null;

function load(): Promise<AppData> {
  const v = Date.now();
  return Promise.all([
    fetch(`${base}inventory.json?v=${v}`).then(r => r.json()),
    fetch(`${base}schedule.json?v=${v}`).then(r => r.json()),
  ]).then(([inv, sch]) => ({
    loading: false,
    error: '',
    inventory: inv.items || {},
    inventoryUpdatedAt: inv.updatedAt || '',
    slots: sch.slots || [],
    scheduleUpdatedAt: sch.updatedAt || '',
  }));
}

const empty: AppData = { loading: true, error: '', inventory: {}, inventoryUpdatedAt: '', slots: [], scheduleUpdatedAt: '' };

export function useAppData(): AppData {
  const [data, setData] = useState<AppData>(empty);
  useEffect(() => {
    if (!cache) cache = load();
    cache.then(setData).catch(e => setData({ ...empty, loading: false, error: String(e) }));
  }, []);
  return data;
}

export const totalQty = (it?: InvItem) => (it ? it.options.reduce((s, o) => s + (o.qty || 0), 0) : 0);

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'FREE', 'F'];
export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const u = s.toUpperCase();
    const i = SIZE_ORDER.indexOf(u);
    if (i >= 0) return 1000 + i;
    const n = parseFloat(u.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 5000 : n;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export const NO_IMAGE =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f8f9fa"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23adb5bd">No Image</text></svg>';

export const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
