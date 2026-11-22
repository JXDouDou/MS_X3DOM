// Vite 設定檔
// 「多頁面」模式：每個 .html 是一個獨立頁面，build 時都要列在 input 裡。
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // 用相對路徑，部署到 GitHub Pages 的子路徑（/MS_X3DOM/）時才不會找不到檔案
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'), // 首頁（入口 hub）
        lab: resolve(import.meta.dirname, 'lab.html'),     // 構件實驗室
        walk: resolve(import.meta.dirname, 'walk.html'),   // 建築漫遊
      },
    },
  },
});
