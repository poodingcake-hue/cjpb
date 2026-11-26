import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getToken, setToken, checkToken, GH_REPO } from '../api/github';

// 저장(쓰기)용 GitHub 토큰 설정. 롯데 앱의 Cloudflare 서버 대신 GitHub 저장소에 바로 저장하기 위해 필요하다.
const TokenButton = () => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const has = !!getToken();

  const save = async () => {
    setBusy(true);
    const r = await checkToken(value);
    setBusy(false);
    setMsg(r.message);
    if (r.ok) {
      setToken(value);
      setTimeout(() => window.location.reload(), 600);
    }
  };

  const modal = open && createPortal(
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOpen(false)}>
      <div className="card p-3 shadow" style={{ width: 'min(92vw, 440px)', borderRadius: 14 }} onClick={e => e.stopPropagation()}>
        <h6 className="fw-bold mb-2">저장 권한 (GitHub 토큰)</h6>
        <p className="small text-muted mb-2" style={{ lineHeight: 1.5 }}>
          조회는 토큰 없이 돼요. 입고·대여·반납·상품등록처럼 <b>저장</b>하려면 이 기기에서 한 번만 토큰을 넣어주세요.
          토큰은 이 브라우저에만 저장돼요.
        </p>
        <ol className="small text-muted ps-3 mb-2" style={{ lineHeight: 1.6 }}>
          <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">토큰 만들기 페이지</a> 열기</li>
          <li>Repository access → <b>Only select repositories</b> → <code>{GH_REPO.split('/')[1]}</code></li>
          <li>Permissions → Repository → <b>Contents: Read and write</b></li>
          <li>Generate token → 복사해서 아래에 붙여넣기</li>
        </ol>
        <input type="password" className="form-control form-control-sm mb-2" placeholder="github_pat_…" value={value} onChange={e => setValue(e.target.value)} />
        {msg && <div className="small mb-2" style={{ color: msg.includes('연결') ? '#198754' : '#dc3545' }}>{msg}</div>}
        <div className="d-flex gap-2 justify-content-end">
          {has && <button className="btn btn-sm btn-outline-danger me-auto" onClick={() => { setToken(''); window.location.reload(); }}>토큰 지우기</button>}
          <button className="btn btn-sm btn-light" onClick={() => setOpen(false)}>닫기</button>
          <button className="btn btn-sm btn-primary" disabled={!value.trim() || busy} onClick={save}>{busy ? '확인 중…' : '저장'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button type="button" className="nav-item" title={has ? '저장 가능 (토큰 설정됨)' : '읽기 전용 — 저장하려면 토큰 설정'}
        onClick={() => { setOpen(true); setMsg(''); }} style={{ opacity: has ? 1 : 0.55 }}>
        {has ? '🔑' : '🔒'}
      </button>
      {modal}
    </>
  );
};

export default TokenButton;
