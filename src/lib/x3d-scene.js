// =============================================================
// 場景層：把「構件清單（純資料）」變成 x3dom 看得懂的 DOM 節點
// -------------------------------------------------------------
// x3dom 的運作方式：網頁裡的 <transform>、<shape> 等標籤就是 3D 場景。
// 我們改標籤的屬性（例如 translation），x3dom 會自動重畫。
//
// 結構：
//   <transform id="model" scale="s s s">        ← 分° → 公尺 的換算（材等）
//     <transform data-part="zhu" translation=…>  ← 每個構件一個，負責位置/拆開
//       <shape> … <indexedfaceset> … </shape>   ← 形狀，參數改了就整個換掉
// =============================================================

/** 把網格轉成 <shape> 的 HTML 字串 */
function shapeMarkup(mesh, color) {
  // coordinate 的 point："x y z, x y z, ..."
  const point = mesh.points.map((p) => p.map((v) => +v.toFixed(3)).join(' ')).join(', ');
  // coordIndex：每個面的頂點編號，面與面之間用 -1 隔開
  const coordIndex = mesh.faces.map((f) => f.join(' ') + ' -1').join(' ');
  // 注意：HTML 裡的 x3dom 標籤不能寫成 <box/> 這種自我結束的寫法，一定要有結束標籤
  // creaseAngle：相鄰面夾角小於它就「抹平」光影。圓柱要抹平；方塊設 0，稜角才清楚
  return `
    <shape>
      <appearance>
        <material diffuseColor="${color.join(' ')}" specularColor="0.15 0.15 0.15" shininess="0.2"></material>
      </appearance>
      <indexedfaceset solid="false" creaseAngle="${mesh.smooth ? 1.2 : 0}" coordIndex="${coordIndex}">
        <coordinate point="${point}"></coordinate>
      </indexedfaceset>
    </shape>`;
}

/** 緩動函式：讓動畫頭尾慢、中間快 */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * 建立場景控制器。
 * @param {object} opt
 * @param {HTMLElement} opt.root   放構件的 <transform id="model">
 * @param {(id:string|null)=>void} opt.onPick  點到構件時呼叫
 * @param {(id:string|null)=>void} opt.onHover 滑鼠移入 / 移出構件時呼叫
 */
export function createScene({ root, onPick, onHover }) {
  const nodes = new Map(); // 構件 id → 它的 <transform> 元素
  let parts = [];          // 目前的構件清單
  let explodeT = 0;        // 0 = 組合，1 = 完全拆開
  let selectedId = null;
  let animId = 0;

  // 依 explodeT 算出每個構件的位置
  function applyPositions() {
    for (const part of parts) {
      const el = nodes.get(part.id);
      const pos = part.position.map((v, k) => v + part.explode[k] * explodeT);
      el.setAttribute('translation', pos.join(' '));
    }
  }

  // 被選取的構件發光一點（emissiveColor = 自發光顏色）
  function applyHighlight() {
    for (const [id, el] of nodes) {
      const mat = el.querySelector('material');
      if (mat) mat.setAttribute('emissiveColor', id === selectedId ? '0.35 0.3 0.05' : '0 0 0');
    }
  }

  return {
    /** 換一組構件（參數改了就呼叫）。同 id 的構件會沿用原本的 <transform>。 */
    setParts(newParts) {
      parts = newParts;
      // 新清單裡沒有的構件（例如柱網變小了）要從場景移除
      const keep = new Set(parts.map((p) => p.id));
      for (const [id, el] of nodes) {
        if (!keep.has(id)) { el.remove(); nodes.delete(id); }
      }
      for (const part of parts) {
        let el = nodes.get(part.id);
        if (!el) {
          el = document.createElement('transform');
          el.dataset.part = part.id;
          // x3dom 在點選時會讀元素的 onclick 屬性，所以直接指定函式就行
          el.onclick = () => onPick(part.id);
          el.onmouseover = () => onHover(part.id);
          el.onmouseout = () => onHover(null);
          root.appendChild(el);
          nodes.set(part.id, el);
        }
        // 形狀整個換掉：這就是「依參數重新產生幾何」，不是拉伸
        el.innerHTML = shapeMarkup(part.mesh, part.color);
      }
      applyPositions();
      applyHighlight();
    },

    /** 設定 1 分° = 幾公尺（換材等時呼叫） */
    setScale(metersPerFen) {
      root.setAttribute('scale', `${metersPerFen} ${metersPerFen} ${metersPerFen}`);
    },

    /** 選取某個構件（null = 取消選取） */
    select(id) {
      selectedId = id;
      applyHighlight();
    },

    /** 拆開（target=1）或組合（target=0），用動畫過去 */
    animateExplode(target, duration = 900) {
      cancelAnimationFrame(animId);
      const from = explodeT;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        explodeT = from + (target - from) * easeInOut(t);
        applyPositions();
        if (t < 1) animId = requestAnimationFrame(step);
      };
      animId = requestAnimationFrame(step);
    },

    get exploded() {
      return explodeT > 0.5;
    },
  };
}

/** 產生地面格線（單位公尺，每 1 公尺一條），回傳 <shape> 字串 */
export function gridMarkup(half = 5) {
  const pts = [];
  const idx = [];
  for (let i = -half; i <= half; i++) {
    const n = pts.length;
    pts.push(`${i} 0 ${-half}`, `${i} 0 ${half}`, `${-half} 0 ${i}`, `${half} 0 ${i}`);
    idx.push(`${n} ${n + 1} -1 ${n + 2} ${n + 3} -1`);
  }
  // 線條沒有受光面，要用 emissiveColor 才看得到顏色
  return `
    <shape>
      <appearance><material emissiveColor="0.55 0.55 0.5"></material></appearance>
      <indexedlineset coordIndex="${idx.join(' ')}">
        <coordinate point="${pts.join(', ')}"></coordinate>
      </indexedlineset>
    </shape>`;
}
