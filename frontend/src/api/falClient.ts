// 롯데 앱은 Cloudflare 서버를 거쳐 fal.ai(누끼)를 호출했지만, CJ PB 앱은 서버 없이 GitHub에만 데이터를 둡니다.
// 그래서 AI 누끼 기능은 쓸 수 없습니다. 호출하면 안내 메시지와 함께 실패합니다.
export async function removeBackground(_imageDataUrl: string): Promise<string> {
  throw new Error('CJ PB 앱에서는 AI 누끼(배경 제거)를 지원하지 않아요. 서버가 없는 GitHub 저장 방식이라 외부 AI를 부를 수 없어요.');
}
