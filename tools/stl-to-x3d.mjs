// =============================================================
// STL → 簡化後的 X3D（給漫遊頁的測試版用）
// -------------------------------------------------------------
// 用法：
//   node --max-old-space-size=8192 tools/stl-to-x3d.mjs raw/dayang_v8.stl public/models/dayang.x3d --target 900000 --unit 0.01
//
//   --target 目標三角形數（預設 900000）
//   --unit   STL 的 1 單位 = 幾公尺（公分 = 0.01，公釐 = 0.001，英吋 = 0.0254）
//
// 步驟：
//   1. 讀二進位 STL（每個三角形 50 bytes：法向量 + 3 個頂點 + 2 bytes 保留）
//   2. 合併重複頂點（STL 每個三角形各存一份頂點，相鄰三角形的同一點會重複很多次）
//   3. 用 meshoptimizer 簡化到目標三角形數
//   4. 座標換成「公尺、Y 朝上、水平置中、地面在 y=0」
//   5. 依空間位置切成多塊（每塊頂點 < 65535，x3dom 處理起來比較順，也方便只畫看得到的部分）
//   6. 寫出 X3D，另外寫一個 .json 記錄尺寸和推測的地板高度
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

// ---------- 讀參數 ----------
const args = process.argv.slice(2);
const [inPath, outPath] = args;
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const TARGET = opt('target', 900000);
const UNIT = opt('unit', 0.01);
if (!inPath || !outPath) {
  console.error('用法：node tools/stl-to-x3d.mjs <輸入.stl> <輸出.x3d> [--target N] [--unit 0.01]');
  process.exit(1);
}
const t0 = Date.now();
const log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...m);

// ---------- 1. 讀 STL ----------
const buf = fs.readFileSync(inPath);
const triCount = buf.readUInt32LE(80);
if (84 + triCount * 50 !== buf.length) throw new Error('看起來不是二進位 STL（大小對不上）');
log(`讀入 ${triCount.toLocaleString()} 個三角形`);

// ---------- 2. 合併重複頂點 ----------
// 做法：自己寫一個「雜湊表」（hash table）。
// 把座標四捨五入到 0.01 單位（公分模型 = 0.1 公釐），座標相同就視為同一點。
const Q = 100; // 1 / 0.01
const cap = 1 << 26; // 雜湊表格數（要比頂點數大不少）
const mask = cap - 1;
const table = new Int32Array(cap).fill(-1); // 格子 → 頂點編號
const qpos = new Int32Array(triCount * 3 * 3); // 合併後頂點的整數座標（最多不會超過這麼多）
const pos = new Float32Array(triCount * 3 * 3);
let vertCount = 0;
const indices = new Uint32Array(triCount * 3);

for (let t = 0; t < triCount; t++) {
  const base = 84 + t * 50 + 12; // 跳過法向量 12 bytes
  for (let j = 0; j < 3; j++) {
    const x = buf.readFloatLE(base + j * 12);
    const y = buf.readFloatLE(base + j * 12 + 4);
    const z = buf.readFloatLE(base + j * 12 + 8);
    const qx = Math.round(x * Q), qy = Math.round(y * Q), qz = Math.round(z * Q);
    let h = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) & mask;
    let id;
    for (;;) {
      id = table[h];
      if (id === -1) { // 空格：新頂點
        id = vertCount++;
        table[h] = id;
        qpos[id * 3] = qx; qpos[id * 3 + 1] = qy; qpos[id * 3 + 2] = qz;
        pos[id * 3] = x; pos[id * 3 + 1] = y; pos[id * 3 + 2] = z;
        break;
      }
      if (qpos[id * 3] === qx && qpos[id * 3 + 1] === qy && qpos[id * 3 + 2] === qz) break; // 找到同一點
      h = (h + 1) & mask; // 被別人佔了，往下一格找
    }
    indices[t * 3 + j] = id;
  }
}
log(`合併後剩 ${vertCount.toLocaleString()} 個頂點（原本 ${(triCount * 3).toLocaleString()} 個）`);

// 拿掉「退化三角形」（兩個點合併成同一點，面積變成 0）
let k = 0;
for (let t = 0; t < triCount; t++) {
  const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
  if (a !== b && b !== c && a !== c) {
    indices[k++] = a; indices[k++] = b; indices[k++] = c;
  }
}
const cleanIdx = indices.slice(0, k);
const positions = pos.slice(0, vertCount * 3);
log(`去掉退化三角形後：${(k / 3).toLocaleString()} 個三角形`);

// ---------- 3. 簡化 ----------
await MeshoptSimplifier.ready;
let target = Math.min(TARGET * 3, cleanIdx.length);
let [simp, err] = MeshoptSimplifier.simplify(cleanIdx, positions, 3, target, 0.01, ['Prune']);
log(`simplify：${(simp.length / 3).toLocaleString()} 個三角形，誤差 ${(err * 100).toFixed(3)}%`);
if (simp.length > target * 1.3) {
  // 模型由很多小零件組成時，一般簡化會卡住減不下去，改用「粗略簡化」（把相近的點直接合併）
  [simp, err] = MeshoptSimplifier.simplifySloppy(cleanIdx, positions, 3, null, target, 0.02);
  log(`改用 simplifySloppy：${(simp.length / 3).toLocaleString()} 個三角形，誤差 ${(err * 100).toFixed(3)}%`);
}

// ---------- 4. 座標轉換：公尺、Y 朝上、置中 ----------
// STL（SketchUp）是 Z 朝上；X3D 是 Y 朝上 → (x, y, z) 變成 (x, z, -y)
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < simp.length; i++) {
  const v = simp[i];
  for (let a = 0; a < 3; a++) {
    const c = positions[v * 3 + a];
    if (c < min[a]) min[a] = c;
    if (c > max[a]) max[a] = c;
  }
}
const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, z0 = min[2];
const toX3D = (v) => [
  (positions[v * 3] - cx) * UNIT,
  (positions[v * 3 + 2] - z0) * UNIT,
  -(positions[v * 3 + 1] - cy) * UNIT,
];
const sizeM = [(max[0] - min[0]) * UNIT, (max[2] - min[2]) * UNIT, (max[1] - min[1]) * UNIT];
log(`尺寸（公尺）：寬 ${sizeM[0].toFixed(2)}、高 ${sizeM[1].toFixed(2)}、深 ${sizeM[2].toFixed(2)}`);

// ---------- 推測地板高度 ----------
// 找「朝上的水平面」面積最大的高度（只看下面 30%），通常就是台基頂面或地面
const binSize = 0.05; // 5 公分一格
const floorBins = new Map();
const triN = simp.length / 3;
for (let t = 0; t < triN; t++) {
  const A = toX3D(simp[t * 3]), B = toX3D(simp[t * 3 + 1]), C = toX3D(simp[t * 3 + 2]);
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
  const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const len = Math.hypot(nx, ny, nz);
  if (len === 0) continue;
  const y = (A[1] + B[1] + C[1]) / 3;
  if (Math.abs(ny / len) > 0.98 && y < sizeM[1] * 0.3) {
    const bin = Math.round(y / binSize);
    floorBins.set(bin, (floorBins.get(bin) ?? 0) + len / 2);
  }
}
let floorY = 0, best = 0;
for (const [bin, area] of floorBins) if (area > best) { best = area; floorY = bin * binSize; }
log(`推測地板高度：${floorY.toFixed(2)} 公尺`);

// ---------- 5. 依空間位置切塊 ----------
// 先用三角形重心排序（沿最長的水平軸，再分層），讓鄰近的三角形放在一起
const order = Array.from({ length: triN }, (_, i) => i);
const cen = new Float32Array(triN * 3);
for (let t = 0; t < triN; t++) {
  for (let j = 0; j < 3; j++) {
    const p = toX3D(simp[t * 3 + j]);
    cen[t * 3] += p[0] / 3; cen[t * 3 + 1] += p[1] / 3; cen[t * 3 + 2] += p[2] / 3;
  }
}
// 用 3D 格子編號排序：格子 4 公尺見方
const cell = 4;
const key = (t) => {
  const gx = Math.floor((cen[t * 3] + sizeM[0]) / cell);
  const gy = Math.floor(cen[t * 3 + 1] / cell);
  const gz = Math.floor((cen[t * 3 + 2] + sizeM[2]) / cell);
  return (gx * 1000 + gz) * 100 + gy;
};
const keys = new Float64Array(triN);
for (let t = 0; t < triN; t++) keys[t] = key(t);
order.sort((a, b) => keys[a] - keys[b]);

const MAXV = 65000;
const chunks = [];
let cur = null;
for (const t of order) {
  if (!cur || cur.map.size > MAXV - 3) {
    cur = { map: new Map(), idx: [] };
    chunks.push(cur);
  }
  for (let j = 0; j < 3; j++) {
    const v = simp[t * 3 + j];
    let local = cur.map.get(v);
    if (local === undefined) { local = cur.map.size; cur.map.set(v, local); }
    cur.idx.push(local);
  }
}
log(`切成 ${chunks.length} 塊`);

// ---------- 6. 寫出 X3D ----------
const fmt = (n) => {
  const s = n.toFixed(3);
  return s === '-0.000' ? '0' : s.replace(/\.?0+$/, '') || '0'; // 1.500 → 1.5，省空間
};
const out = fs.createWriteStream(outPath);
out.write(`<?xml version="1.0" encoding="UTF-8"?>
<X3D profile="Immersive" version="3.3">
<head>
  <meta name="title" content="北科大大樣（簡化測試版）"/>
  <meta name="source" content="${path.basename(inPath)}，原始 ${triCount} 個三角形，簡化後 ${triN} 個"/>
</head>
<Scene>
<Group DEF="dayang">
`);
chunks.forEach((c, i) => {
  const pts = new Array(c.map.size);
  for (const [v, local] of c.map) pts[local] = toX3D(v).map(fmt).join(' ');
  // 材質只定義一次（DEF），其他塊用 USE 共用
  const appearance = i === 0
    ? '<Appearance DEF="mat"><Material diffuseColor="0.58 0.47 0.38" specularColor="0.08 0.08 0.08"/></Appearance>'
    : '<Appearance USE="mat"/>';
  out.write(`<Shape>${appearance}<IndexedTriangleSet solid="false" index="${c.idx.join(' ')}">` +
    `<Coordinate point="${pts.join(' ')}"/></IndexedTriangleSet></Shape>\n`);
});
out.write('</Group>\n</Scene>\n</X3D>\n');
await new Promise((r) => out.end(r));

const meta = {
  source: path.basename(inPath),
  originalTriangles: triCount,
  triangles: triN,
  chunks: chunks.length,
  size: sizeM.map((v) => +v.toFixed(3)), // [寬 X, 高 Y, 深 Z]（公尺）
  floorY: +floorY.toFixed(3),
  note: '單色、依 STL 簡化的測試版；沒有構件名稱與顏色',
};
fs.writeFileSync(outPath.replace(/\.x3d$/, '.json'), JSON.stringify(meta, null, 2));
log(`完成：${outPath}（${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB）`);
