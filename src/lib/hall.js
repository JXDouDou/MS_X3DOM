// =============================================================
// 示範殿堂：把 bracket.js 的「一組柱 + 枓栱」排成柱網，再加台基、闌額、屋頂
// -------------------------------------------------------------
// 用途：在還沒拿到 SketchUp 大樣模型之前，先有一棟「可以走進去」的建築。
// 單位一樣是分°；回傳的構件清單格式和 buildParts 相同，所以能直接交給 createScene。
// ⚠ 台基、闌額、屋頂都是簡化的示意形狀。
// =============================================================
import { buildParts } from './bracket.js';
import { box, frustum, bboxSize } from './geometry.js';

/**
 * @param {object} p  bracket.js 的參數，再加上：
 * @param {number} p.baysX 面闊幾間（X 方向）
 * @param {number} p.baysZ 進深幾間（Z 方向）
 * @param {number} p.bay   每間寬度「間廣」（分°）
 */
export function buildHall(p) {
  const { baysX, baysZ, bay } = p;
  const W = baysX * bay; // 柱網總寬（X）
  const D = baysZ * bay; // 柱網總深（Z）
  const parts = [];

  // 先產生一組柱 + 枓栱，當作「樣板」，拿來量高度
  const template = buildParts(p);
  const zhu = template.find((t) => t.id === 'zhu');
  const colTop = zhu.position[1] + p.columnHeight; // 柱頭高度
  const topDou = template.find((t) => t.id === 'jiaohudou-f');
  const eaveY = topDou.position[1] + topDou.size[1]; // 枓栱最上面 = 屋簷高度

  // ---- 1. 台基：比柱網每邊多出 1.2 個柱徑 ----
  const margin = p.columnDiameter * 2.4;
  const platformH = 40;
  parts.push({
    id: 'taiji', name: '台基', type: '基礎', material: '石',
    color: [0.7, 0.68, 0.63],
    mesh: box(W + 2 * margin, platformH, D + 2 * margin),
    position: [0, -platformH, 0], explode: [0, 0, 0],
    note: '建築的基座。這裡簡化成長方塊。',
  });

  // ---- 2. 每個柱位放一組柱 + 枓栱 ----
  for (let i = 0; i <= baysX; i++) {
    for (let j = 0; j <= baysZ; j++) {
      const x = i * bay - W / 2;
      const z = j * bay - D / 2;
      for (const t of buildParts(p)) {
        parts.push({
          ...t,
          id: `${t.id}@${i}-${j}`,             // 每根柱子的構件 id 都要不一樣
          name: `${t.name}（第 ${i + 1} 縫、第 ${j + 1} 列）`,
          position: [t.position[0] + x, t.position[1], t.position[2] + z],
        });
      }
    }
  }

  // ---- 3. 闌額：柱頭之間的橫樑（廣 30 分°、厚 20 分°）----
  const beamH = 30, beamT = 20;
  for (let j = 0; j <= baysZ; j++) {
    for (let i = 0; i < baysX; i++) {
      parts.push(beam(`lane-x@${i}-${j}`, bay, beamT, [(i + 0.5) * bay - W / 2, colTop - beamH, j * bay - D / 2]));
    }
  }
  for (let i = 0; i <= baysX; i++) {
    for (let j = 0; j < baysZ; j++) {
      parts.push(beam(`lane-z@${i}-${j}`, beamT, bay, [i * bay - W / 2, colTop - beamH, (j + 0.5) * bay - D / 2]));
    }
  }
  function beam(id, lx, lz, pos) {
    return {
      id, name: '闌額', type: '額', material: '木',
      color: [0.55, 0.18, 0.13],
      mesh: box(lx, beamH, lz),
      position: pos, explode: [0, 220, 0],
      note: '柱頭之間的橫向構件，「廣兩材」約 30 分°。這裡省略了普拍枋。',
    };
  }

  // ---- 4. 屋頂：四坡（廡殿）示意，出簷 100 分° ----
  const eave = 100;
  const roofW = W + 2 * eave, roofD = D + 2 * eave;
  const ridge = Math.max(W - D, bay * 0.6); // 正脊長度
  const roofH = roofD * 0.32;
  parts.push({
    id: 'roof', name: '屋頂', type: '屋面', material: '瓦',
    color: [0.32, 0.33, 0.36],
    mesh: frustum(roofW, roofD, ridge, 1, roofH),
    position: [0, eaveY, 0], explode: [0, 400, 0],
    note: '四坡頂的簡化示意，沒有舉折曲線與瓦作細節。',
  });

  // 台基、闌額、屋頂也算好包圍盒尺寸（屬性面板要用）
  for (const part of parts) part.size ??= bboxSize(part.mesh);
  return { parts, floorY: 0, size: [W + 2 * margin, D + 2 * margin] };
}
