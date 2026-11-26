import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 주소가 https://<계정>.github.io/<저장소이름>/ 이라서 base 가 저장소 이름이어야 합니다.
// 배포 워크플로가 VITE_BASE 를 저장소 이름으로 넣어줍니다.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/cjpb/',
})
