// =============================================================
// 第一人稱漫遊控制：WASD / 方向鍵移動、滑鼠拖曳轉頭
// -------------------------------------------------------------
// 做法：自己記錄「眼睛位置 + 左右轉角 yaw + 上下仰角 pitch」，
// 每一幀算好之後寫回 <viewpoint> 的 position / orientation 屬性。
// （x3dom 改 viewpoint 的這兩個屬性時，相機會立刻跟著動）
// 單位：公尺。
// =============================================================

/**
 * 把 yaw（繞 Y 軸）+ pitch（繞 X 軸）轉成 X3D 的 orientation（旋轉軸 + 角度）。
 * 數學：先轉 pitch 再轉 yaw，用四元數相乘，最後換成「軸 + 角度」。
 */
function toOrientation(yaw, pitch) {
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2);
  const sx = Math.sin(pitch / 2), cx = Math.cos(pitch / 2);
  // q = qYaw × qPitch
  const w = cy * cx;
  const x = cy * sx, y = sy * cx, z = -sy * sx;
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, w)));
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-6) return '0 1 0 0'; // 沒有旋轉
  return `${x / s} ${y / s} ${z / s} ${angle}`;
}

/**
 * @param {object} opt
 * @param {HTMLElement} opt.viewpoint 要控制的 <viewpoint>
 * @param {HTMLElement} opt.surface   接收滑鼠拖曳的元素（3D 畫面那塊）
 */
export function createWalker({ viewpoint, surface }) {
  const s = {
    pos: [0, 1.6, 10],  // 眼睛位置
    yaw: 0,             // 0 = 看向 -Z
    pitch: 0,
    speed: 2.5,         // 公尺／秒
    eyeHeight: 1.6,
    floorY: 0,
    enabled: true,
  };
  const keys = new Set();
  let anim = null;      // 視點切換的平滑動畫

  // ---- 鍵盤：按下時記住，放開時移除；每一幀檢查哪些鍵被按著 ----
  const isTyping = () => ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  window.addEventListener('keydown', (e) => {
    if (!s.enabled || isTyping()) return;
    keys.add(e.code);
    // 避免方向鍵、空白鍵捲動網頁
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  }, true);
  window.addEventListener('keyup', (e) => keys.delete(e.code), true);
  window.addEventListener('blur', () => keys.clear()); // 切到別的視窗時放開全部

  // ---- 滑鼠拖曳轉頭（第三個參數 true：在 x3dom 攔截之前先收到）----
  // （x3dom 的畫布會擋住事件往上傳，所以 window 上的監聽也用捕獲階段 true）
  let drag = null;
  let lastMoved = false; // 上一次放開滑鼠前有沒有拖曳過
  surface.addEventListener('mousedown', (e) => {
    if (!s.enabled) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.x = e.clientX; drag.y = e.clientY;
    s.yaw -= dx * 0.004;
    s.pitch = Math.max(-1.3, Math.min(1.3, s.pitch - dy * 0.004));
    anim = null;
  }, true);
  window.addEventListener('mouseup', () => {
    lastMoved = drag?.moved ?? false;
    drag = null;
  }, true);

  // ---- 每一幀：依按鍵移動，然後寫回 viewpoint ----
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); // 秒；上限 0.1 避免切回分頁時暴衝
    last = now;
    if (s.enabled) {
      if (anim) stepAnim(now);
      else move(dt);
      apply();
    }
    requestAnimationFrame(tick);
  }

  function move(dt) {
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1; // Shift 加速
    const d = s.speed * run * dt;
    // 面向方向（只看水平，所以往上看時往前走不會飛起來）
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += fx; mz += fz; }
    if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= fx; mz -= fz; }
    if (keys.has('KeyD')) { mx += rx; mz += rz; }
    if (keys.has('KeyA')) { mx -= rx; mz -= rz; }
    if (keys.has('ArrowLeft')) s.yaw += 1.6 * dt;   // 方向鍵左右 = 轉頭
    if (keys.has('ArrowRight')) s.yaw -= 1.6 * dt;
    const len = Math.hypot(mx, mz);
    if (len > 0) { s.pos[0] += (mx / len) * d; s.pos[2] += (mz / len) * d; }
    // Q / E：降低 / 升高視線（想看斗栱細節時很好用）
    if (keys.has('KeyE')) s.eyeHeight += d;
    if (keys.has('KeyQ')) s.eyeHeight = Math.max(0.3, s.eyeHeight - d);
    s.pos[1] = s.floorY + s.eyeHeight; // 「重力」：眼睛永遠在地板上方固定高度
  }

  function apply() {
    viewpoint.setAttribute('position', s.pos.map((v) => v.toFixed(3)).join(' '));
    viewpoint.setAttribute('orientation', toOrientation(s.yaw, s.pitch));
  }

  // 平滑移動到指定視點
  function stepAnim(now) {
    const t = Math.min(1, (now - anim.start) / anim.duration);
    const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const lerp = (a, b) => a + (b - a) * k;
    s.pos = anim.from.pos.map((v, i) => lerp(v, anim.to.pos[i]));
    s.yaw = lerp(anim.from.yaw, anim.to.yaw);
    s.pitch = lerp(anim.from.pitch, anim.to.pitch);
    s.eyeHeight = s.pos[1] - s.floorY;
    if (t >= 1) anim = null;
  }

  requestAnimationFrame(tick);

  return {
    state: s,
    /** 跳到某個視點：{ pos:[x,y,z], yaw, pitch }，y 是眼睛的實際高度 */
    goTo(target, duration = 1000) {
      // 讓 yaw 走最短的方向
      let yaw = target.yaw;
      while (yaw - s.yaw > Math.PI) yaw -= 2 * Math.PI;
      while (yaw - s.yaw < -Math.PI) yaw += 2 * Math.PI;
      anim = {
        start: performance.now(), duration: Math.max(1, duration), // 至少 1ms，避免除以 0
        from: { pos: [...s.pos], yaw: s.yaw, pitch: s.pitch },
        to: { pos: target.pos, yaw, pitch: target.pitch ?? 0 },
      };
    },
    setEnabled(on) { s.enabled = on; keys.clear(); },
    /** 這次滑鼠放開前有沒有拖曳過（用來分辨「點選」和「轉頭」）*/
    get dragged() { return lastMoved; },
  };
}
