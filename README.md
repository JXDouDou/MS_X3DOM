# MS_X3DOM

營造法式數位平台（x3dom 1.8.3 + Vite）。專案背景見 [docs/BACKGROUND.md](docs/BACKGROUND.md)。

## 本機執行

第一次要先安裝套件：

```bash
npm install
```

啟動開發伺服器（改程式會自動重新整理）：

```bash
npm run dev
```

打開 http://localhost:5173 。

## 檔案結構

| 檔案 | 作用 |
|---|---|
| `index.html` | 首頁（入口 hub） |
| `lab.html` + `src/lab.js` | 構件實驗室：調參數、點構件看資訊、拆開／組合 |
| `src/lib/geometry.js` | 幾何產生器（純函式：尺寸 → 頂點和面） |
| `src/lib/bracket.js` | 構件規則：用參數產生柱 + 枓栱（單位：分°） |
| `src/lib/x3d-scene.js` | 把構件資料畫成 x3dom 節點、拆開動畫、選取高亮 |
| `src/data/cai-deng.json` | 材等表 |
