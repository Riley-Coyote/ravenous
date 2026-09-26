// Keyboard (arrows or WASD), gamepad and touch, all feeding the same named actions.
// Presses queue until a fixed update consumes them, so a tap never gets lost between frames.
// The input also remembers which scheme you're using so every on-screen hint shows your keys.

// code → [action, scheme hint]
const KEYS = {
  ArrowLeft: ['left', 'arrows'], ArrowRight: ['right', 'arrows'], ArrowUp: ['up', 'arrows'], ArrowDown: ['down', 'arrows'],
  KeyA: ['left', 'wasd'], KeyD: ['right', 'wasd'], KeyW: ['up', 'wasd'], KeyS: ['down', 'wasd'],
  Space: ['jump', null], KeyZ: ['jump', 'arrows'], KeyK: ['jump', 'wasd'],
  KeyX: ['fire', 'arrows'], KeyJ: ['fire', 'wasd'],
  KeyC: ['counter', 'arrows'], KeyL: ['counter', 'wasd'],
  KeyV: ['devour', 'arrows'], KeyE: ['devour', 'wasd'],
  KeyF: ['missile', null], KeyQ: ['missile', null], KeyU: ['missile', 'wasd'],
  ShiftLeft: ['dash', null], ShiftRight: ['dash', null], KeyO: ['dash', 'wasd'],
  Escape: ['pause', null], KeyP: ['pause', null], Tab: ['map', null],
  Enter: ['confirm', null], NumpadEnter: ['confirm', null],
  KeyM: ['mute', null],
};

// Standard gamepad layout, by button position (Xbox names).
const PADMAP = {
  0: 'jump', 2: 'fire', 3: 'counter', 1: 'devour', 5: 'missile', 4: 'dash', 7: 'dash', 6: 'missile',
  9: 'pause', 8: 'map', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

export const LABELS = {
  arrows: { move: '← →', aim: '↑ ↓', down: '↓', jump: 'Z', fire: 'X', counter: 'C', devour: 'V', missile: 'F', dash: 'Shift', pause: 'Esc', confirm: 'Enter', map: 'Tab' },
  wasd: { move: 'A D', aim: 'W S', down: 'S', jump: 'Space', fire: 'J', counter: 'L', devour: 'E', missile: 'F', dash: 'Shift', pause: 'Esc', confirm: 'Enter', map: 'Tab' },
  pad: { move: 'Stick', aim: 'Stick ↑↓', down: 'Stick ↓', jump: 'A', fire: 'X', counter: 'Y', devour: 'B', missile: 'RB', dash: 'RT', pause: 'Start', confirm: 'A', map: 'Back' },
  touch: { move: 'Stick', aim: 'Stick ↑↓', down: 'Stick ↓', jump: 'JUMP', fire: 'SHOOT', counter: 'COUNTER', devour: 'DEVOUR', missile: 'MISSILE', dash: 'DASH', pause: 'II', confirm: 'Tap', map: 'MAP' },
};

export class Input {
  constructor() {
    this.keyCodes = new Set();
    this.keyActs = new Set();
    this.padActs = new Set();
    this.touchActs = new Set();
    this.simActs = new Set();
    this.pressedQ = new Set();
    this.releasedQ = new Set();
    this.pressedNow = new Set();
    this.releasedNow = new Set();
    this.lastDevice = 'keyboard';
    this.scheme = 'arrows';
    this.padKind = 'xbox';

    addEventListener('keydown', (e) => {
      const k = KEYS[e.code];
      if (!k) return;
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      this.lastDevice = 'keyboard';
      if (k[1]) this.scheme = k[1];
      if (this.keyCodes.has(e.code)) return;
      this.keyCodes.add(e.code);
      this.press(k[0], this.keyActs);
    });
    addEventListener('keyup', (e) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      this.keyCodes.delete(e.code);
      for (const c of this.keyCodes) if (KEYS[c][0] === k[0]) return;
      this.release(k[0], this.keyActs);
    });
    const clear = () => {
      for (const a of this.keyActs) this.releasedQ.add(a);
      this.keyActs.clear();
      this.keyCodes.clear();
    };
    addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  }

  press(a, set) {
    if (!this.down(a)) this.pressedQ.add(a);
    set.add(a);
  }

  release(a, set) {
    set.delete(a);
    if (!this.down(a)) this.releasedQ.add(a);
  }

  down(a) {
    return this.keyActs.has(a) || this.padActs.has(a) || this.touchActs.has(a) || this.simActs.has(a);
  }
  pressed(a) {
    return this.pressedNow.has(a);
  }
  released(a) {
    return this.releasedNow.has(a);
  }

  // what to print on a keycap for an action, for whatever the player is holding
  label(action) {
    const dev = this.lastDevice === 'pad' ? 'pad' : this.lastDevice === 'touch' ? 'touch' : this.scheme;
    const table = LABELS[dev];
    if (dev === 'pad' && this.padKind === 'ps') {
      const ps = { jump: '✕', fire: '□', counter: '△', devour: '○', missile: 'R1', dash: 'R2', pause: 'Options', confirm: '✕', map: 'Share' };
      if (ps[action]) return ps[action];
    }
    return table[action] || action;
  }

  // Test hook: hold or let go of an action as if a key were pressed.
  simulate(a, isDown) {
    if (isDown) this.press(a, this.simActs);
    else this.release(a, this.simActs);
  }

  setTouch(a, isDown) {
    if (isDown) this.lastDevice = 'touch';
    if (isDown && !this.touchActs.has(a)) this.press(a, this.touchActs);
    else if (!isDown && this.touchActs.has(a)) this.release(a, this.touchActs);
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected && p.mapping === 'standard');
    const next = new Set();
    if (pad) {
      pad.buttons.forEach((b, i) => {
        const a = PADMAP[i];
        if (a && (b.pressed || b.value > 0.5)) next.add(a);
      });
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (ax < -0.4) next.add('left');
      if (ax > 0.4) next.add('right');
      if (ay < -0.55) next.add('up');
      if (ay > 0.55) next.add('down');
      if (next.has('jump')) next.add('confirm');
      if (/054c|playstation|dualsense|dualshock/i.test(pad.id)) this.padKind = 'ps';
      else this.padKind = 'xbox';
    }
    for (const a of next) {
      if (!this.padActs.has(a)) {
        this.press(a, this.padActs);
        this.lastDevice = 'pad';
      }
    }
    for (const a of [...this.padActs]) if (!next.has(a)) this.release(a, this.padActs);
  }

  // Called once per fixed update step.
  beginStep() {
    this.pressedNow = this.pressedQ;
    this.releasedNow = this.releasedQ;
    this.pressedQ = new Set();
    this.releasedQ = new Set();
  }
}
