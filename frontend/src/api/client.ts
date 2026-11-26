// 롯데 앱의 apiClient(Cloudflare Worker)를 대신하는 얇은 어댑터.
// 페이지 코드는 롯데 앱 그대로 두고, 요청 종류별로 GitHub 저장소 기반 동작으로 바꿔준다.
import { uploadBinary, imageToDataUrl } from './github';

type Resp = { data: any };

export const apiClient = {
  async post(_url: string, body: any, _config?: any): Promise<Resp> {
    // 1) 이미지 업로드 (롯데: R2) → GitHub 저장소 uploads/ 폴더
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const file = body.get('file');
      if (!(file instanceof Blob)) return { data: { success: false, message: '파일이 없어요.' } };
      try {
        const name = (file as File).name || `image_${Date.now()}.webp`;
        const imageUrl = await uploadBinary(file, name);
        return { data: { success: true, imageUrl } };
      } catch (e: any) {
        return { data: { success: false, message: e?.message || String(e) } };
      }
    }

    const type = body?.type;
    // 2) 외부 이미지 → base64 (롯데: 서버 프록시) → 브라우저에서 직접 시도
    if (type === 'proxy_image') {
      try {
        return { data: { success: true, base64: await imageToDataUrl(body.data.imageUrl) } };
      } catch (e: any) {
        return { data: { success: false, message: '이미지 서버가 직접 불러오기를 막았어요: ' + (e?.message || e) } };
      }
    }
    // 3) AI 사이즈표 분석 (롯데: 서버의 AI 키 사용) → 서버가 없어서 지원 안 함
    if (type === 'analyze_size_chart') {
      return { data: { success: false, message: 'CJ PB 앱은 서버 없이 GitHub에만 저장해서 AI 사이즈표 분석을 쓸 수 없어요. 사이즈는 직접 입력해 주세요.' } };
    }
    throw new Error(`지원하지 않는 요청이에요: ${type}`);
  },
  async get(): Promise<Resp> {
    throw new Error('apiClient.get 은 사용하지 않아요 (useAppStore.initApp 이 GitHub에서 직접 읽어요).');
  },
};

export const GAS_WEB_APP_URL = '';
