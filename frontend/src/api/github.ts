// GitHub 저장소를 "DB"처럼 쓰는 저장 계층.
// 롯데 앱은 Cloudflare Worker(D1/R2)에 저장했지만, CJ PB 앱은 모든 데이터를 이 저장소의 파일로 보관한다.
//
//   db/products.json   등록·수정한 상품 (자동 생성 상품보다 우선)
//   db/history.json    재고 이력 (IN/RENT/RETURN/ADJUST) — 재고는 seed_stock + 이력 합계로 계산
//   db/outfits.json    착장 내역
//   db/notes.json      유의사항
//   db/supplies.json   부자재 메모
//   uploads/*          상품 이미지
//
// 읽기: 토큰이 있으면 GitHub API(항상 최신), 없으면 raw.githubusercontent.com(최대 몇 분 캐시)
// 쓰기: GitHub 토큰(Contents 쓰기 권한) 필요. 기기마다 한 번 입력하면 이 브라우저에 저장된다.

export const GH_REPO: string = (import.meta.env.VITE_GH_REPO as string) || 'poodingcake-hue/cjpb';
export const GH_BRANCH = 'main';
const TOKEN_KEY = 'cjpb_github_token';
const API = 'https://api.github.com';

export const getToken = (): string => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t: string) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* 저장 불가 브라우저 */ }
};

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const h: Record<string, string> = { 'X-GitHub-Api-Version': '2022-11-28', ...extra };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
};

// ---- UTF-8 ↔ base64 ----
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64(bytes);
}
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 토큰이 이 저장소에 쓰기 권한이 있는지 확인 */
export async function checkToken(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${API}/repos/${GH_REPO}`, {
      headers: { Authorization: `Bearer ${token.trim()}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (res.status === 401) return { ok: false, message: '토큰이 올바르지 않거나 만료됐어요.' };
    if (res.status === 404) return { ok: false, message: `이 토큰으로는 ${GH_REPO} 저장소에 접근할 수 없어요.` };
    const d = await res.json();
    if (!d.permissions?.push) return { ok: false, message: '읽기만 가능한 토큰이에요. Contents 쓰기(Read and write) 권한이 필요해요.' };
    return { ok: true, message: '연결됐어요.' };
  } catch (e) {
    return { ok: false, message: '확인 중 오류: ' + String(e) };
  }
}

/** 파일 읽기 (없으면 fallback) */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    let text: string;
    if (getToken()) {
      const res = await fetch(`${API}/repos/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}&t=${Date.now()}`, {
        headers: authHeaders({ Accept: 'application/vnd.github.raw+json' }),
        cache: 'no-store',
      });
      if (res.status === 404) return fallback;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } else {
      const res = await fetch(`https://raw.githubusercontent.com/${GH_REPO}/${GH_BRANCH}/${path}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) return fallback;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    }
    return text.trim() ? JSON.parse(text) : fallback;
  } catch (e) {
    console.warn(`[github] ${path} 읽기 실패`, e);
    return fallback;
  }
}

async function getFile(path: string): Promise<{ sha: string | null; text: string }> {
  const res = await fetch(`${API}/repos/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}&t=${Date.now()}`, {
    headers: authHeaders({ Accept: 'application/vnd.github+json' }),
    cache: 'no-store',
  });
  if (res.status === 404) return { sha: null, text: '' };
  if (!res.ok) throw new Error(`GitHub 읽기 실패 (${res.status})`);
  const d = await res.json();
  if (d.encoding === 'base64' && d.content) return { sha: d.sha, text: base64ToUtf8(d.content) };
  // 1MB 넘는 파일은 content 가 비어 있어서 raw 로 다시 받는다
  const raw = await fetch(`${API}/repos/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}&t=${Date.now()}`, {
    headers: authHeaders({ Accept: 'application/vnd.github.raw+json' }),
    cache: 'no-store',
  });
  return { sha: d.sha, text: await raw.text() };
}

function requireToken() {
  if (getToken()) return;
  throw new Error('저장하려면 GitHub 토큰이 필요해요. 화면 오른쪽 위 🔑 버튼에서 토큰을 먼저 설정해 주세요.');
}

/**
 * JSON 파일을 읽어서 mutate 로 바꾼 뒤 커밋한다.
 * 다른 사람이 그사이 같은 파일을 바꿨으면(409/422) 최신 내용으로 다시 읽어서 재시도한다.
 */
export async function updateJson<T>(path: string, fallback: T, mutate: (data: T) => T, message: string): Promise<T> {
  requireToken();
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { sha, text } = await getFile(path);
    const current: T = text.trim() ? JSON.parse(text) : structuredClone(fallback);
    const next = mutate(current);
    const body: Record<string, unknown> = {
      message,
      content: utf8ToBase64(JSON.stringify(next, null, 1) + '\n'),
      branch: GH_BRANCH,
    };
    if (sha) body.sha = sha;
    const res = await fetch(`${API}/repos/${GH_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: authHeaders({ Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (res.ok) return next;
    if (res.status === 409 || res.status === 422) {
      lastErr = new Error(`충돌 (${res.status})`);
      await new Promise(r => setTimeout(r, 400 + Math.random() * 800));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('GitHub 토큰 권한이 없어요. 🔑 버튼에서 토큰을 다시 설정해 주세요.');
    }
    throw new Error(`GitHub 저장 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('GitHub 저장 실패');
}

/** 이미지 같은 파일 올리기 → 바로 쓸 수 있는 URL 반환 */
export async function uploadBinary(file: Blob, name: string): Promise<string> {
  requireToken();
  const safe = name.replace(/[^\w.\-가-힣]/g, '_');
  const path = `uploads/${new Date().toISOString().slice(0, 10)}/${Date.now()}_${safe}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const res = await fetch(`${API}/repos/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: authHeaders({ Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message: `이미지 업로드 ${safe}`, content: bytesToBase64(bytes), branch: GH_BRANCH }),
  });
  if (!res.ok) throw new Error(`이미지 업로드 실패 (${res.status})`);
  return `https://raw.githubusercontent.com/${GH_REPO}/${GH_BRANCH}/${path}`;
}

/** 외부 이미지를 base64(dataURL)로 (화면 캡처용). 상대 서버가 막으면 실패 */
export async function imageToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
