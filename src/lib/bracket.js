// =============================================================
// 構件規則：用參數「產生」一組柱 + 簡化的枓栱
// -------------------------------------------------------------
// 所有尺寸都用「分°」（《營造法式》的模數單位）。
//   - 1 材 = 15 分°，「材等」只決定 1 分° 是幾公分。
//   - 所以換材等 = 整組等比例放大縮小；改柱高 = 重新產生柱子的形狀。
// 這個檔案也不碰 DOM，只回傳「構件清單」（純資料）。
//
// ⚠ 尺寸是依《營造法式》常見數字「簡化」的示範，並非精確復原：
//   栱沒有做卷殺、枓沒有做 䫜（凹弧），相交處沒有開卯口。
// =============================================================
import { frustum, box, lathe, translate, merge, bboxSize } from './geometry.js';

/**
 * 枓（dou）：由下到上 欹（下窄上寬的台）+ 平（長方塊）+ 耳（開了槽口的上部）。
 * @param {object} o
 * @param {number} o.len  X 方向長
 * @param {number} o.wid  Z 方向寬
 * @param {number} o.qi   欹 的高度
 * @param {number} o.ping 平 的高度
 * @param {number} o.er   耳 的高度
 * @param {number} o.inset 底部每邊內收多少（「底四面各殺 N 分」）
 * @param {'cross'|'x'} o.slot 槽口方向：cross = 十字開口；x = 只沿 X 方向開口
 */
function dou({ len, wid, qi, ping, er, inset, slot }) {
  const SLOT = 10; // 槽口寬 = 材厚 10 分°（栱就卡在這裡）
  const parts = [
    frustum(len - 2 * inset, wid - 2 * inset, len, wid, qi), // 欹
    translate(box(len, ping, wid), [0, qi, 0]),              // 平
  ];
  const y = qi + ping; // 耳 的底部高度
  if (slot === 'cross') {
    // 十字開口 → 四個角落各留一塊
    const bx = (len - SLOT) / 2, bz = (wid - SLOT) / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(translate(box(bx, er, bz), [sx * (len - bx) / 2, y, sz * (wid - bz) / 2]));
    }
  } else {
    // 順著 X 方向開口 → 前後各留一長條
    const bz = (wid - SLOT) / 2;
    for (const sz of [-1, 1]) {
      parts.push(translate(box(len, er, bz), [0, y, sz * (wid - bz) / 2]));
    }
  }
  return merge(...parts);
}

/**
 * 柱身剖面（[半徑, 高度] 清單），交給 lathe() 轉成柱子。
 * @param {'straight'|'suo'} shape straight = 直柱加收分；suo = 梭柱
 */
function columnProfile({ H, D, shape, taper }) {
  const R = D / 2;
  if (shape === 'straight') {
    // 直柱：柱頭直徑 = 柱腳直徑 ×（1 - 收分）
    return [[R, 0], [R * (1 - taper), H]];
  }
  // 梭柱（依《營造法式》「殺梭柱之法」的簡化理解，⚠ 待與老師確認）：
  //   柱身分三份，下面兩份是直的；上面一份逐漸收小，
  //   收到柱頭直徑 = 櫨枓底寬 24 + 四周各出 4 分° = 32 分°。
  //   → 柱頭大小跟櫨枓「綁在一起」，不是跟柱高等比例，這就是「重新產生」而非「縮放」的原因。
  const topR = Math.min(R, 32 / 2);
  const profile = [[R, 0], [R, (2 * H) / 3]];
  const steps = 8; // 上段切 8 段近似曲線
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const y = (2 * H) / 3 + (H / 3) * t;
    const r = R - (R - topR) * t * t; // 一開始收得慢、越上面收得越快
    profile.push([r, y]);
  }
  return profile;
}

/**
 * 依參數產生整組構件。
 * @param {object} p
 * @param {number} p.columnHeight   柱高（分°）
 * @param {number} p.columnDiameter 柱徑（分°）
 * @param {'straight'|'suo'} p.columnShape 柱形
 * @param {number} p.taper 直柱的收分比例（0～0.2）
 * @returns {Array<object>} 構件清單，每個構件是一筆純資料
 */
export function buildParts(p) {
  const H = p.columnHeight;
  const D = p.columnDiameter;

  // ---- 各構件的高度位置（由下往上疊）----
  const baseH = Math.round(D * 0.5);   // 柱礎高（簡化）
  const yCol = baseH;                  // 柱腳
  const yLuDou = yCol + H;             // 櫨枓底 = 柱頭
  const yGong = yLuDou + 8 + 4;        // 栱底 = 櫨枓的 欹8 + 平4（栱卡在耳的槽口裡）
  const yOnNiDao = yGong + 15;         // 泥道栱頂（單材 15）
  const yOnHua = yGong + 21;           // 華栱頂（足材 21）

  const sanDou = () => dou({ len: 16, wid: 14, qi: 4, ping: 2, er: 4, inset: 2, slot: 'x' });
  const jiaoHuDou = () => dou({ len: 18, wid: 16, qi: 4, ping: 2, er: 4, inset: 2, slot: 'cross' });

  const parts = [
    {
      id: 'zhuchu', name: '柱礎', type: '基礎', material: '石',
      color: [0.62, 0.62, 0.6],
      mesh: frustum(2 * D, 2 * D, 1.6 * D, 1.6 * D, baseH),
      position: [0, 0, 0], explode: [0, 0, 0],
      note: '「方倍柱之徑」：柱礎寬約為柱徑的兩倍。這裡簡化成四角台。',
    },
    {
      id: 'zhu', name: '柱', type: '柱', material: '木',
      color: [0.6, 0.16, 0.12], // 朱紅
      mesh: lathe(columnProfile({ H, D, shape: p.columnShape, taper: p.taper })),
      position: [0, yCol, 0], explode: [0, 0, 0],
      note: p.columnShape === 'suo'
        ? '梭柱：上三分之一逐漸收小，柱頭直徑對齊櫨枓底（32 分°）。'
        : '直柱：柱頭依收分比例縮小。',
    },
    {
      id: 'ludou', name: '櫨枓', type: '枓', material: '木',
      color: [0.72, 0.52, 0.3],
      mesh: dou({ len: 32, wid: 32, qi: 8, ping: 4, er: 8, inset: 4, slot: 'cross' }),
      position: [0, yLuDou, 0], explode: [0, 50, 0],
      note: '「長廣各三十二分，高二十分」：耳八、平四、欹八，底四面各殺四分。十字開口承栱。',
    },
    {
      id: 'nidaogong', name: '泥道栱', type: '栱', material: '木',
      color: [0.78, 0.62, 0.38],
      mesh: box(62, 15, 10),
      position: [0, yGong, 0], explode: [0, 100, 0],
      note: '「長六十二分」，單材（高 15 分°、厚 10 分°），沿面闊方向。實物兩端有卷殺，這裡省略。',
    },
    {
      id: 'huagong', name: '華栱', type: '栱', material: '木',
      color: [0.82, 0.66, 0.42],
      mesh: box(10, 21, 72),
      position: [0, yGong, 0], explode: [0, 150, 0],
      note: '「長七十二分」，足材（高 21 分°），沿進深方向出跳。和泥道栱十字相交（實物有卯口，這裡省略）。',
    },
    {
      id: 'sandou-l', name: '散枓（左）', type: '枓', material: '木',
      color: [0.72, 0.52, 0.3],
      mesh: sanDou(),
      position: [-23, yOnNiDao, 0], explode: [-40, 200, 0],
      note: '「長十六分，廣十四分，高十分」，順身開口，放在泥道栱端。',
    },
    {
      id: 'sandou-r', name: '散枓（右）', type: '枓', material: '木',
      color: [0.72, 0.52, 0.3],
      mesh: sanDou(),
      position: [23, yOnNiDao, 0], explode: [40, 200, 0],
      note: '「長十六分，廣十四分，高十分」，順身開口，放在泥道栱端。',
    },
    {
      id: 'jiaohudou-f', name: '交互枓（外）', type: '枓', material: '木',
      color: [0.72, 0.52, 0.3],
      mesh: jiaoHuDou(),
      position: [0, yOnHua, 28], explode: [0, 200, 45],
      note: '「長十八分，廣十六分」，十字開口，放在華栱跳頭。',
    },
    {
      id: 'jiaohudou-b', name: '交互枓（內）', type: '枓', material: '木',
      color: [0.72, 0.52, 0.3],
      mesh: jiaoHuDou(),
      position: [0, yOnHua, -28], explode: [0, 200, -45],
      note: '「長十八分，廣十六分」，十字開口，放在華栱裡跳。',
    },
  ];

  // 幫每個構件算好包圍盒尺寸（屬性面板要用）
  for (const part of parts) part.size = bboxSize(part.mesh);
  return parts;
}
