import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData, totalQty, NO_IMAGE } from '../data';

const InventoryPage = () => {
  const { loading, error, inventory, slots, inventoryUpdatedAt } = useAppData();
  const navigate = useNavigate();
  const [brand, setBrand] = useState('');
  const [term, setTerm] = useState('');
  const [onlyOnAir, setOnlyOnAir] = useState(false);

  const items = useMemo(() => Object.values(inventory), [inventory]);
  const brands = useMemo(() => Array.from(new Set(items.map(i => i.brand).filter(Boolean))).sort(), [items]);

  // 상품코드 → 가장 가까운 편성 (편성표 범위 안)
  const nextBroadcast = useMemo(() => {
    const m: Record<string, string> = {};
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const s of slots) {
      if (s.date < today) continue;
      for (const it of s.items) {
        const when = `${s.date.slice(5).replace('-', '/')} ${s.start}`;
        if (!m[it.code] || when < m[it.code]) m[it.code] = when;
      }
    }
    return m;
  }, [slots]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return items
      .filter(i => !brand || i.brand === brand)
      .filter(i => !onlyOnAir || nextBroadcast[i.code])
      .filter(i => !t || i.name.toLowerCase().includes(t) || i.code.includes(t) || i.brand.toLowerCase().includes(t))
      .sort((a, b) => b.code.localeCompare(a.code, undefined, { numeric: true }));
  }, [items, brand, term, onlyOnAir, nextBroadcast]);

  if (loading) return <div id="loading-overlay" style={{ display: 'flex' }}><div className="spinner"></div></div>;
  if (error) return <p className="empty-msg">데이터를 불러오지 못했어요: {error}</p>;

  const sum = filtered.reduce((s, i) => s + totalQty(i), 0);

  return (
    <section className="page-section active" id="page-inventory">
      <div className="card border-0 shadow-sm p-2 mb-2 rounded-3">
        <div className="row g-2">
          <div className="col-6">
            <select className="form-select form-select-sm border-0 bg-light" value={brand} onChange={e => setBrand(e.target.value)}>
              <option value="">전체 브랜드</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="col-6 d-flex align-items-center">
            <div className="form-check form-switch m-0">
              <input className="form-check-input" type="checkbox" id="onAir" checked={onlyOnAir} onChange={e => setOnlyOnAir(e.target.checked)} />
              <label className="form-check-label small" htmlFor="onAir">방송 예정만</label>
            </div>
          </div>
          <div className="col-12">
            <input type="text" className="form-control form-control-sm border-0 bg-light" placeholder="상품명, 브랜드, 상품코드 검색"
              value={term} onChange={e => setTerm(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="updated-at">상품 {filtered.length}개 · 총 {sum.toLocaleString()}개 · 재고 기준 {inventoryUpdatedAt}</div>

      {filtered.length === 0 ? <p className="empty-msg">검색 결과가 없어요.</p> : (
        <div className="product-grid" style={{ paddingBottom: 20 }}>
          {filtered.map(it => {
            const q = totalQty(it);
            return (
              <div key={it.code} className="p-card" onClick={() => navigate(`/detail/${it.code}`)}>
                <div className="p-img-box">
                  <img src={it.image || NO_IMAGE} onError={e => { (e.target as HTMLImageElement).src = NO_IMAGE; }} className="p-img" alt={it.name} />
                  <span className={`qty-badge ${q === 0 ? 'zero' : ''}`}>재고 {q}</span>
                </div>
                <div className="p-info">
                  <div className="p-brand">{it.brand}</div>
                  <div className="p-name">{it.name}</div>
                  <div className="p-meta">{nextBroadcast[it.code] ? `📺 ${nextBroadcast[it.code]}` : it.code}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default InventoryPage;
