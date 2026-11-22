// =============================================================
// 構件實驗室頁面的「接線」：把介面、規則、場景串起來
//   介面（滑桿、按鈕） → buildParts（規則，產生構件資料） → createScene（畫到 x3dom）
// =============================================================
import caiData from './data/cai-deng.json';
import { buildParts } from './lib/bracket.js';
import { createScene, gridMarkup } from './lib/x3d-scene.js';

// ---- 小工具：用 id 拿元素 ----
const $ = (id) => document.getElementById(id);

// ---- 目前的參數（集中放一個物件，方便除錯：在 Console 打 state 就看得到）----
const state = {
  caiId: 3,              // 預設三等材
  columnShape: 'suo',
  columnHeight: 300,     // 分°
  columnDiameter: 42,    // 分°
  taper: 0.07,
};
window.state = state;    // 讓你在瀏覽器 Console 裡可以直接看

let parts = [];          // 目前的構件清單
let selectedId = null;

// ---- 單位換算 ----
const cai = () => caiData.levels.find((c) => c.id === state.caiId);
/** 1 分° = 幾公分 */
const cmPerFen = () => (cai().guangCun / 15) * caiData.cmPerCun;
/** 分° → 「N 分°（約 M cm）」的文字 */
const fenText = (fen) => `${+fen.toFixed(1)} 分°（約 ${(fen * cmPerFen()).toFixed(1)} cm）`;

// ---- 建立場景 ----
$('grid').innerHTML = gridMarkup(5);
const scene = createScene({
  root: $('model'),
  onPick: (id) => select(id),
  onHover: (id) => showTooltip(id),
});

// ---- 重新產生：參數一變就跑一次 ----
function regenerate() {
  parts = buildParts(state);
  scene.setParts(parts);
  scene.setScale(cmPerFen() / 100); // 公分 → 公尺
  updateLabels();
  renderInfo(); // 尺寸變了，資訊面板也要更新
}

function updateLabels() {
  $('caiInfo').textContent =
    `材廣 ${cai().guangCun} 寸，1 分° ≈ ${cmPerFen().toFixed(2)} cm。用途：${cai().use}`;
  $('hVal').textContent = fenText(state.columnHeight);
  $('dVal').textContent = fenText(state.columnDiameter);
  $('tVal').textContent = `${Math.round(state.taper * 100)}%`;
  // 收分滑桿只對直柱有意義
  $('taperField').hidden = state.columnShape !== 'straight';
}

// ---- 屬性面板（BIM 式資訊）----
function select(id) {
  selectedId = id;
  scene.select(id);
  renderInfo();
}

function renderInfo() {
  const part = parts.find((p) => p.id === selectedId);
  if (!part) {
    $('info').innerHTML = '<p class="sub">點選場景中的構件，這裡會顯示它的資訊。</p>';
    return;
  }
  const [x, y, z] = part.size;
  // 用表格列出屬性；之後要加欄位（例如彩畫等級）就在這裡加一列
  //<tr><th>頂點數</th><td>${part.mesh.points.length}</td></tr>
  $('info').innerHTML = `
    <h3>${part.name}</h3>
    <table>
      <tr><th>類型</th><td>${part.type}</td></tr>
      <tr><th>材料</th><td>${part.material}</td></tr>
      <tr><th>長（X）</th><td>${fenText(x)}</td></tr>
      <tr><th>高（Y）</th><td>${fenText(y)}</td></tr>
      <tr><th>寬（Z）</th><td>${fenText(z)}</td></tr>
      <tr><th>材等</th><td>${cai().name}</td></tr>
    </table>
    <p class="note">${part.note}</p>`;
}

// ---- 滑鼠移到構件上時顯示名稱 ----
let mouse = { x: 0, y: 0 };
// 第三個參數 true = 「捕獲階段」：事件往下傳到畫布之前就先被我們收到。
// （x3dom 的畫布會攔住滑鼠事件，不讓它往上冒泡，所以一般寫法收不到）
$('viewport').addEventListener('mousemove', (e) => {
  const r = $('viewport').getBoundingClientRect();
  mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  $('tooltip').style.transform = `translate(${mouse.x + 14}px, ${mouse.y + 14}px)`;
}, true);
$('viewport').addEventListener('mouseleave', () => ($('tooltip').hidden = true));
function showTooltip(id) {
  const part = parts.find((p) => p.id === id);
  $('tooltip').hidden = !part;
  if (part) $('tooltip').textContent = part.name;
}

// ---- 介面事件 ----
// 材等選單
for (const c of caiData.levels) {
  $('caiDeng').add(new Option(`${c.name}（${c.guangCun} 寸）`, c.id));
}
$('caiDeng').value = state.caiId;
$('caiDeng').addEventListener('change', (e) => {
  state.caiId = Number(e.target.value);
  regenerate();
});

$('columnShape').addEventListener('change', (e) => {
  state.columnShape = e.target.value;
  regenerate();
});

// 三個滑桿：'input' 事件 = 拖動時就一直觸發（'change' 要放開才觸發）
$('columnHeight').addEventListener('input', (e) => {
  state.columnHeight = Number(e.target.value);
  regenerate();
});
$('columnDiameter').addEventListener('input', (e) => {
  state.columnDiameter = Number(e.target.value);
  regenerate();
});
$('taper').addEventListener('input', (e) => {
  state.taper = Number(e.target.value) / 100;
  regenerate();
});

// 拆開 / 組合
$('btnExplode').addEventListener('click', () => {
  const toExplode = !scene.exploded;
  scene.animateExplode(toExplode ? 1 : 0);
  $('btnExplode').textContent = toExplode ? '組合' : '拆開';
});

// 重設視角：fitObject = 讓相機把指定的物體框進畫面
// （不用 showAll，因為它會連 10 公尺的地面格線一起框進去，構件就變很小）
const fit = () => $('x3d').runtime?.fitObject($('model'), true);
$('btnFit').addEventListener('click', fit);

$('btnRandom').addEventListener('click', () => {
  state.columnHeight = Math.round((Math.random() * 450 + 150) / 5) * 5; // 150~600 分°，取整數
  $('columnHeight').value = state.columnHeight;
  regenerate();
});

// Esc 取消選取
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') select(null);
  if (e.key === 'e') $('btnExplode').click();// 快捷鍵 e = 拆開 / 組合
  if (e.key === 'h') document.querySelector('.panel').classList.toggle('collapsed');// 快捷鍵 h = 隱藏 / 顯示資訊面板
});

// ---- 第一次畫面 ----
regenerate();
// x3dom 初始化完成後會呼叫 x3dom.runtime.ready
x3dom.runtime.ready = () => fit();
