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
| `walk.html` + `src/walk.js` | 建築漫遊：第一人稱 / 環繞；示範殿堂或外部模型 |
| `src/lib/hall.js`、`src/lib/walker.js` | 示範殿堂產生器、第一人稱控制 |
| `tools/stl-to-x3d.mjs` | STL → 簡化 X3D（測試版大樣模型） |

## 轉換 SketchUp 匯出的 STL

原始檔放在 `raw/`（不進 Git），轉出來的檔案放在 `public/models/`：

```bash
node --max-old-space-size=8192 tools/stl-to-x3d.mjs raw/dayang_v8.stl public/models/dayang.x3d --target 900000 --unit 0.01
```

`--unit` 是 STL 的 1 個單位等於幾公尺（公分填 0.01）。轉好後打開 `walk.html?source=ext`。
