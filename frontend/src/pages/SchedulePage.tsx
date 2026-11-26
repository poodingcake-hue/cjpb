import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData, totalQty, NO_IMAGE, DAYS, type SlotItem } from '../data';

const SchedulePage = () => {
  const { loading, error, slots, inventory, scheduleUpdatedAt } = useAppData();
  const navigate = useNavigate();
  const dates = useMemo(() => Array.from(new Set(slots.map(s => s.date))).sort(), [slots]);
  const [selDate, setSelDate] = useState('');
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const date = selDate || dates[0] || '';

  const daySlots = useMemo(() => {
    const list = slots.filter(s => s.date === date);
    return showAllSlots ? list : list.filter(s => s.items.some(i => i.owned));
  }, [slots, date, showAllSlots]);

  const toggle = (key: string) => {
    const n = new Set(expanded);
    if (n.has(key)) n.delete(key); else n.add(key);
    setExpanded(n);
  };

  if (loading) return <div id="loading-overlay" style={{ display: 'flex' }}><div className="spinner"></div></div>;
  if (error) return <p className="empty-msg">데이터를 불러오지 못했어요: {error}</p>;

  const card = (it: SlotItem) => {
    const inv = inventory[it.code];
    const q = totalQty(inv);
    return (
      <div key={it.code} className={`p-card ${it.owned ? 'is-owned' : 'is-unowned'}`}
        onClick={it.owned ? () => navigate(`/detail/${it.code}`) : undefined}>
        <div className="p-img-box">
          <img src={it.image || NO_IMAGE} onError={e => { (e.target as HTMLImageElement).src = NO_IMAGE; }} className="p-img" alt={it.name} />
          {it.owned && <span className={`qty-badge ${q === 0 ? 'zero' : ''}`}>재고 {q}</span>}
        </div>
        <div className="p-info">
          <div className="p-brand">{it.brand}</div>
          <div className="p-name">{it.name}</div>
          <div className="p-meta">{it.code}{it.type === '함께방송' ? ' · 함께방송' : ''}</div>
        </div>
      </div>
    );
  };

  return (
    <section className="page-section active" id="page-schedule">
      <div className="date-scroller">
        {dates.map(d => {
          const p = new Date(d);
          return (
            <button key={d} className={`date-btn ${d === date ? 'active' : ''}`}
              onClick={() => { setSelDate(d); setExpanded(new Set()); }}>
              {DAYS[p.getDay()]}<br />{p.getDate()}
            </button>
          );
        })}
      </div>

      <div className="toolbar">
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" id="allSlots" checked={showAllSlots}
            onChange={e => setShowAllSlots(e.target.checked)} />
          <label className="form-check-label" htmlFor="allSlots">우리 상품 없는 방송도 보기</label>
        </div>
        <div className="updated-at">편성 수집 {scheduleUpdatedAt}</div>
      </div>

      {daySlots.length === 0 ? (
        <p className="empty-msg">이 날짜에는 우리 상품(A/S 책임자 CJ ENM) 방송이 없어요.</p>
      ) : daySlots.map(s => {
        const key = `${s.date}|${s.start}|${s.channel}|${s.program}`;
        const owned = s.items.filter(i => i.owned);
        const isOpen = expanded.has(key) || owned.length === 0;
        const list = isOpen ? [...owned, ...s.items.filter(i => !i.owned)] : owned;
        return (
          <div key={key}>
            <div className="time-divider">
              <span>{s.start}~{s.end} <span className="slot-sub">{s.channel} · {s.program}</span></span>
              {owned.length > 0 && owned.length < s.items.length && (
                <button type="button" className={`schedule-more-btn ${expanded.has(key) ? 'active' : ''}`}
                  onClick={() => toggle(key)} title={expanded.has(key) ? '우리 상품만 보기' : `전체 상품 보기 (${s.items.length}개)`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    {expanded.has(key) ? <path d="M14 17.5h7" /> : <path d="M14 17.5h7M17.5 14v7" />}
                  </svg>
                </button>
              )}
            </div>
            <div className="product-grid">{list.map(card)}</div>
          </div>
        );
      })}
    </section>
  );
};

export default SchedulePage;
