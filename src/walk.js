// =============================================================
// 建築漫遊頁：示範殿堂（或外部模型）+ 第一人稱 / 環繞 兩種觀看方式
//   參數 → buildHall（規則）→ createScene（畫到 x3dom）
//   鍵盤滑鼠 → createWalker → 改 <viewpoint>
// =============================================================
import caiData from './data/cai-deng.json';
import { buildHall } from './lib/hall.js';
import { createScene, gridMarkup } from './lib/x3d-scene.js';
import { createWalker } from './lib/walker.js';

const $ = (id) => document.getElementById(id);

const state = {
  caiId: 3,
  columnShape: 'suo',
  columnHeight: 300,
  columnDiameter: 42,
  taper: 0.07,
  baysX: 3,      // 面闊三間
  baysZ: 2,      // 進深兩間
  bay: 300,      // 間廣（分°）
  source: 'hall',
};
window.state = state;

let parts = [];
let selectedId = null;
let hall = null;

// ---- 單位 ----
const cai = () => caiData.levels.find((c) => c.id === state.caiId);
const mPerFen = () => ((cai().guangCun / 15) * caiData.cmPerCun) / 100; // 1 分° = 幾公尺
const fenText = (fen) => `${+fen.toFixed(1)} 分°（約 ${(fen * mPerFen()).toFixed(2)} m）`;

// ---- 場景 ----
$('grid').innerHTML = gridMarkup(30);
const scene = createScene({
  root: $('model'),
  onPick: (id) => { if (!walker.dragged) select(id); }, // 拖曳轉頭時不算點選
  onHover: (id) => showTooltip(id),
});
const walker = createWalker({ viewpoint: $('cam'), surface: $('viewport') });

function regenerate() {
  hall = buildHall(state);
  parts = hall.parts;
  scene.setParts(parts);
  scene.setScale(mPerFen());
  // 地面格線放在台基底部
  $('gridRoot').setAttribute('translation', `0 ${(-40 * mPerFen()).toFixed(3)} 0`);
  updateLabels();
  renderViewButtons();
  renderInfo();
}

function updateLabels() {
  $('bxVal').textContent = `${state.baysX} 間`;
  $('bzVal').textContent = `${state.baysZ} 間`;
  $('bayVal').textContent = fenText(state.bay);
  $('hVal').textContent = fenText(state.columnHeight);
  $('spVal').textContent = `${walker.state.speed} m/s`;
}

// ---- 預設視點（依建築大小計算，單位公尺）----
/** 站在 pos、看向 target：算出 walker 要的 yaw（左右）和 pitch（上下）*/
function look(pos, target) {
  const [dx, dy, dz] = target.map((v, i) => v - pos[i]);
  return { pos, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
function viewpoints() {
  if (state.source === 'ext' && extMeta) return extViewpoints(extMeta);
  const s = mPerFen();
  const W = state.baysX * state.bay * s, D = state.baysZ * state.bay * s;
  const H = state.columnHeight * s;
  const colTop = (Math.round(state.columnDiameter * 0.5) + state.columnHeight) * s; // 柱頭高度
  return {
    正面: look([0, 1.6, D / 2 + Math.max(6, W * 0.9)], [0, H * 0.6, 0]),
    殿內: look([0, 1.6, D / 2 - 0.8], [0, colTop, -D / 2]),
    簷下仰望: look([W / 2 + 2.5, 1.6, D / 2 + 3], [W / 2, colTop, D / 2]), // 角柱的枓栱
    俯瞰: look([W * 0.9, H * 3 + 6, D / 2 + W * 1.2], [0, 0, 0]),
  };
}
function renderViewButtons() {
  const box = $('viewButtons');
  if (box.childElementCount) return; // 只建一次，點的時候才重新計算位置
  for (const name of Object.keys(viewpoints())) {
    const b = document.createElement('button');
    b.textContent = name;
    b.addEventListener('click', () => {
      setMode('walk');
      walker.goTo(viewpoints()[name]);
    });
    box.appendChild(b);
  }
}

// ---- 觀看模式 ----
function setMode(mode) {
  const walk = mode === 'walk';
  walker.setEnabled(walk);
  // 環繞模式交給 x3dom 內建的 EXAMINE（拖曳旋轉、滾輪縮放）
  $('nav').setAttribute('type', walk ? '"NONE"' : '"EXAMINE"');
  $('modeWalk').classList.toggle('primary', walk);
  $('modeOrbit').classList.toggle('primary', !walk);
  $('hud').textContent = walk ? '第一人稱：W A S D 移動・拖曳轉頭' : '環繞：拖曳旋轉・滾輪縮放';
  if (!walk) $('x3d').runtime?.fitObject(state.source === 'hall' ? $('model') : $('extRoot'), true);
}
$('modeWalk').addEventListener('click', () => setMode('walk'));
$('modeOrbit').addEventListener('click', () => setMode('orbit'));
$('speed').addEventListener('input', (e) => {
  walker.state.speed = Number(e.target.value);
  updateLabels();
});

// ---- 模型來源：示範殿堂 / 外部 X3D ----
// 外部模型由 tools/stl-to-x3d.mjs 轉出：dayang.x3d（形狀）+ dayang.json（尺寸、地板高度）
let extMeta = null;

/** 外部模型的預設視點（單位公尺；模型已置中、地面在 y=0）*/
function extViewpoints(m) {
  const [W, H, D] = m.size;
  const eye = m.floorY + 1.6; // 站在台基上的眼睛高度
  return {
    正面: look([0, 1.6, D / 2 + W * 0.6], [0, H * 0.4, 0]),
    殿內: look([0, eye, D * 0.2], [0, H * 0.45, -D / 2]),
    簷下仰望: look([W * 0.42, eye, D * 0.42], [W * 0.3, H * 0.45, D * 0.3]),
    俯瞰: look([W * 0.9, H * 1.8, D * 1.1], [0, H * 0.3, 0]),
  };
}

async function setSource(src) {
  state.source = src;
  $('hallParams').hidden = src !== 'hall';
  $('opsSection').hidden = src !== 'hall'; // 外部模型是一整塊，不能拆
  $('model').setAttribute('render', String(src === 'hall'));
  $('extRoot').setAttribute('render', String(src === 'ext'));
  $('sourceMsg').textContent = '';
  // 「重力」：示範殿堂的台基頂面在 y=0；外部模型用轉換時推測的地板高度
  walker.state.floorY = src === 'ext' && extMeta ? extMeta.floorY : 0;
  if (src !== 'ext') { walker.goTo(viewpoints().正面); return; }

  if (!extMeta) {
    // 先讀 .json：檔案不存在時，Vite 會回傳網頁本身，所以要確認真的是 JSON
    extMeta = await fetch('./models/dayang.json').then((r) => r.json()).catch(() => null);
    if (!extMeta?.size) {
      extMeta = null;
      $('sourceMsg').textContent = '找不到 public/models/dayang.json，請先用 tools/stl-to-x3d.mjs 轉換。';
      return;
    }
    walker.state.floorY = extMeta.floorY;
    $('sourceMsg').textContent = `載入中…（${extMeta.triangles.toLocaleString()} 個三角形，第一次會等幾秒）`;
    // <inline>：讓 x3dom 自己去下載、解析另一個 X3D 檔
    const inline = document.createElement('inline');
    inline.setAttribute('url', './models/dayang.x3d');
    inline.onload = () => {
      $('sourceMsg').textContent =
        `已載入：${extMeta.size.map((v) => v.toFixed(1)).join(' × ')} 公尺，` +
        `${extMeta.triangles.toLocaleString()} 個三角形（原始 ${extMeta.originalTriangles.toLocaleString()}）。單色測試版，不能點構件。`;
    };
    $('extRoot').appendChild(inline);
  }
  walker.goTo(viewpoints().正面, 0);
}
$('source').addEventListener('change', (e) => setSource(e.target.value));

// ---- 構件資訊 ----
function select(id) {
  selectedId = id;
  scene.select(id);
  renderInfo();
}
function renderInfo() {
  const part = parts.find((p) => p.id === selectedId);
  if (!part) {
    $('info').innerHTML = '<p class="sub">點選構件（不要拖曳）會顯示資訊。</p>';
    return;
  }
  const [x, y, z] = part.size ?? [0, 0, 0];
  $('info').innerHTML = `
    <h3>${part.name}</h3>
    <table>
      <tr><th>類型</th><td>${part.type}</td></tr>
      <tr><th>材料</th><td>${part.material}</td></tr>
      <tr><th>長（X）</th><td>${fenText(x)}</td></tr>
      <tr><th>高（Y）</th><td>${fenText(y)}</td></tr>
      <tr><th>寬（Z）</th><td>${fenText(z)}</td></tr>
    </table>
    <p class="note">${part.note}</p>`;
}

// ---- 滑鼠提示 ----
$('viewport').addEventListener('mousemove', (e) => {
  const r = $('viewport').getBoundingClientRect();
  $('tooltip').style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
}, true);
$('viewport').addEventListener('mouseleave', () => ($('tooltip').hidden = true));
function showTooltip(id) {
  const part = parts.find((p) => p.id === id);
  $('tooltip').hidden = !part;
  if (part) $('tooltip').textContent = part.name.replace(/（.*）/, ''); // 提示只顯示構件名
}

// ---- 參數 ----
for (const c of caiData.levels) $('caiDeng').add(new Option(`${c.name}（${c.guangCun} 寸）`, c.id));
$('caiDeng').value = state.caiId;
$('caiDeng').addEventListener('change', (e) => { state.caiId = Number(e.target.value); regenerate(); });
for (const key of ['baysX', 'baysZ', 'bay', 'columnHeight']) {
  $(key).addEventListener('input', (e) => { state[key] = Number(e.target.value); regenerate(); });
}

$('btnExplode').addEventListener('click', () => {
  const toExplode = !scene.exploded;
  scene.animateExplode(toExplode ? 1 : 0, 1400);
  $('btnExplode').textContent = toExplode ? '組合' : '拆開';
});

// Esc 取消選取
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });

// ---- 開始 ----
regenerate();
walker.goTo(viewpoints().正面, 0);
// 網址加 ?source=ext 就直接開外部模型（例如 walk.html?source=ext）
if (new URLSearchParams(location.search).get('source') === 'ext') {
  $('source').value = 'ext';
  setSource('ext');
}
