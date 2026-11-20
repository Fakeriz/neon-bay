// Keyboard + mouse input. Tracks held keys, pressed-this-frame edges and the
// mouse position in screen pixels; the game converts it to a world aim point.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function code(e) {
    return e.code;
  }
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(code(e));
    keys.add(code(e));
  });
  window.addEventListener('keyup', (e) => keys.delete(code(e)));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    down(...codes) {
      return codes.some((c) => keys.has(c));
    },
    pressed(...codes) {
      return codes.some((c) => pressed.has(c));
    },
    mouse,
    /** Call once per frame, after the game has read the edges. */
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
    /** Test/driver hook: pretend a key is held or tapped. */
    test: {
      hold(c) {
        keys.add(c);
      },
      release(c) {
        keys.delete(c);
      },
      tap(c) {
        pressed.add(c);
        keys.add(c);
      },
      mouseAt(x, y) {
        mouse.x = x;
        mouse.y = y;
      },
      click() {
        mouse.clicked = true;
        mouse.down = true;
      },
    },
  };
}
