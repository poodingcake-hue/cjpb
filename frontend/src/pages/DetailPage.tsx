import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppData, totalQty, sortSizes, NO_IMAGE, DAYS } from '../data';

const DetailPage = () => {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { loading, error, inventory, slots } = useAppData();
  const item = inventory[code];

  const { colors, sizes, grid } = useMemo(() => {
    const opts = item?.options || [];
    const colors = Array.from(new Set(opts.map(o => o.color)));
    const sizes = sortSizes(Array.from(new Set(opts.map(o => o.size))));
    const grid: Record<string, Record<string, number | undefined>> = {};
    for (const o of opts) {
      grid[o.color] = grid[o.color] || {};
      grid[o.color][o.size] = (grid[o.color][o.size] || 0) + (o.qty || 0);
    }
    return { colors, sizes, grid };
  }, [item]);

  const broadcasts = useMemo(
    () => slots.filter(s => s.items.some(i => i.code === code)),
    [slots, code],
  );
  const info = broadcasts.flatMap(s => s.items).find(i => i.code === code);

  if (loading) return <div id="loading-overlay" style={{ display: 'flex' }}><div className="spinner"></div></div>;
  if (error) return <p className="empty-msg">데이터를 불러오지 못했어요: {error}</p>;
  if (!item) return <p className="empty-msg">재고에 없는 상품이에요 ({code}). <a href="#" onClick={e => { e.preventDefault(); navigate(-1); }}>돌아가기</a></p>;

  const colTotal = (s: string) => colors.reduce((t, c) => t + (grid[c][s] || 0), 0);
  const rowTotal = (c: string) => sizes.reduce((t, s) => t + (grid[c][s] || 0), 0);

  return (
    <section className="page-section active" id="page-detail" style={{ paddingBottom: 30 }}>
      <button className="btn btn-sm btn-light mb-2" onClick={() => navigate(-1)}>← 뒤로</button>
      <div className="detail-head">
        <img src={item.image || NO_IMAGE} onError={e => { (e.target as HTMLImageElement).src = NO_IMAGE; }} alt={item.name} />
        <div>
          <div className="p-brand">{item.brand}</div>
          <div className="title">{item.name}</div>
          <div className="kv"><b>상품코드</b>{item.code}</div>
          <div className="kv"><b>A/S</b>{item.as}</div>
          {info?.price && <div className="kv"><b>판매가</b>{Number(info.price).toLocaleString()}원{info.salePrice && info.salePrice !== info.price ? ` → ${Number(info.salePrice).toLocaleString()}원` : ''}</div>}
          <div className="kv"><a href={item.link} target="_blank" rel="noreferrer">CJ온스타일에서 보기 ↗</a></div>
        </div>
      </div>

      <h6 className="fw-bold">컬러 · 사이즈별 재고 <span className="text-primary">총 {totalQty(item)}개</span></h6>
      <div style={{ overflowX: 'auto' }}>
        <table className="matrix">
          <thead>
            <tr><th>컬러</th>{sizes.map(s => <th key={s}>{s}</th>)}<th className="total">합계</th></tr>
          </thead>
          <tbody>
            {colors.map(c => (
              <tr key={c}>
                <th>{c}</th>
                {sizes.map(s => {
                  const v = grid[c][s];
                  return <td key={s} className={!v ? 'zero' : ''}>{v === undefined ? '' : v}</td>;
                })}
                <td className="total">{rowTotal(c)}</td>
              </tr>
            ))}
            <tr><th className="total">합계</th>{sizes.map(s => <td key={s} className="total">{colTotal(s)}</td>)}<td className="total">{totalQty(item)}</td></tr>
          </tbody>
        </table>
      </div>

      <h6 className="fw-bold mt-4">편성 ({broadcasts.length}회)</h6>
      {broadcasts.length === 0 ? <p className="text-muted small">수집된 편성표 범위 안에 방송이 없어요.</p> : (
        <ul className="bc-list">
          {broadcasts.map(s => {
            const d = new Date(s.date);
            return (
              <li key={`${s.date}${s.start}${s.channel}`}>
                <span className="when">{s.date.slice(5).replace('-', '/')}({DAYS[d.getDay()]}) {s.start}</span>
                <span>{s.channel} · {s.program}</span>
              </li>
            );
          })}
        </ul>
      )}
      {info && (info.prev || info.next) && (
        <div className="kv mt-2"><b>이전 방송</b>{info.prev || '-'} <b className="ms-3">다음 방송</b>{info.next || '-'}</div>
      )}
    </section>
  );
};

export default DetailPage;
