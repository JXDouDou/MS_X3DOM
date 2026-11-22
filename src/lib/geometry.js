// =============================================================
// 幾何產生器（純函式，不碰網頁 DOM）
// -------------------------------------------------------------
// 這裡只做「算頂點」：輸入尺寸 → 輸出 { points, faces }。
//   points：頂點座標陣列，例如 [[0,0,0], [1,0,0], ...]
//   faces ：每個面是一串頂點編號，例如 [[0,1,2,3], ...]
// 因為不碰 DOM，之後也能用 Node.js 跑同一份程式，批次輸出 X3D 檔。
//
// 座標約定：Y 軸朝上；單位由呼叫的人決定（本專案用「分°」）。
// 面的頂點順序：從物體「外面」看是逆時針（這樣算出來的法向量朝外，打光才正確）。
// =============================================================

/**
 * 四角台（上下兩個長方形，側面是梯形）。上下一樣大時就是長方體。
 * 底面在 y=0、頂面在 y=h，水平方向置中。
 * @param {number} w0 底面 X 方向長度
 * @param {number} d0 底面 Z 方向長度
 * @param {number} w1 頂面 X 方向長度
 * @param {number} d1 頂面 Z 方向長度
 * @param {number} h  高度
 */
export function frustum(w0, d0, w1, d1, h) {
  const a = w0 / 2, b = d0 / 2, c = w1 / 2, d = d1 / 2;
  const points = [
    // 底面四點（編號 0～3）
    [-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b],
    // 頂面四點（編號 4～7）
    [-c, h, -d], [c, h, -d], [c, h, d], [-c, h, d],
  ];
  const faces = [
    [0, 1, 2, 3], // 底（朝 -Y）
    [4, 7, 6, 5], // 頂（朝 +Y）
    [0, 4, 5, 1], // 朝 -Z
    [1, 5, 6, 2], // 朝 +X
    [2, 6, 7, 3], // 朝 +Z
    [3, 7, 4, 0], // 朝 -X
  ];
  return { points, faces };
}

/** 長方體：frustum 的特例 */
export function box(w, h, d) {
  return frustum(w, d, w, d, h);
}

/**
 * 旋轉體（lathe）：把「半徑-高度」剖面繞 Y 軸轉一圈。
 * 例：profile = [[20, 0], [16, 300]] → 底半徑 20、頂半徑 16、高 300 的圓台（有收分的柱子）。
 * @param {Array<[number, number]>} profile 由下往上的 [半徑, 高度] 清單
 * @param {number} segments 圓周切成幾段（越多越圓）
 */
export function lathe(profile, segments = 32) {
  const points = [];
  const faces = [];
  const n = segments;

  // 1) 側面：每一圈 n 個點
  for (const [r, y] of profile) {
    for (let s = 0; s < n; s++) {
      const t = (2 * Math.PI * s) / n;
      points.push([r * Math.cos(t), y, r * Math.sin(t)]);
    }
  }
  // 相鄰兩圈之間連成四邊形
  for (let i = 0; i < profile.length - 1; i++) {
    for (let s = 0; s < n; s++) {
      const a = i * n + s;               // 下圈、這一格
      const b = i * n + ((s + 1) % n);   // 下圈、下一格
      const c = (i + 1) * n + ((s + 1) % n);
      const d = (i + 1) * n + s;         // 上圈、這一格
      faces.push([a, d, c, b]);          // 這個順序法向量朝外
    }
  }

  // 2) 上下蓋：另外複製一份頂點，讓蓋子的法向量是平的（不會和側面一起被「抹圓」）
  const addCap = (ringIndex, isTop) => {
    const [r, y] = profile[ringIndex];
    const start = points.length;
    const idx = [];
    for (let s = 0; s < n; s++) {
      const t = (2 * Math.PI * s) / n;
      points.push([r * Math.cos(t), y, r * Math.sin(t)]);
      idx.push(start + s);
    }
    faces.push(isTop ? idx.reverse() : idx); // 底蓋朝 -Y，頂蓋反過來朝 +Y
  };
  addCap(0, false);
  addCap(profile.length - 1, true);

  // smooth = true：告訴畫面層這個形狀要「平滑著色」（圓柱側面才不會一條一條的）
  return { points, faces, smooth: true };
}

/** 平移：回傳新的網格，不改原本的 */
export function translate(mesh, [dx, dy, dz]) {
  return {
    points: mesh.points.map(([x, y, z]) => [x + dx, y + dy, z + dz]),
    faces: mesh.faces,
  };
}

/** 合併多個網格成一個（頂點編號要往後挪） */
export function merge(...meshes) {
  const points = [];
  const faces = [];
  for (const m of meshes) {
    const offset = points.length;
    points.push(...m.points);
    for (const f of m.faces) faces.push(f.map((i) => i + offset));
  }
  return { points, faces };
}

/** 網格的包圍盒尺寸 [X 長, Y 高, Z 寬] */
export function bboxSize(mesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.points) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  return max.map((v, k) => v - min[k]);
}
