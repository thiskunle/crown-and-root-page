(() => {
  "use strict";

  const hero = document.querySelector("[data-hero]");
  const stage = document.querySelector("[data-stage]");
  const canvas = document.querySelector("[data-film]");
  const slider = document.querySelector("[data-scrub]");
  const rail = document.querySelector("[data-rail]");
  const hint = document.querySelector("[data-hint]");
  const stopButtons = [...document.querySelectorAll("[data-stop]")];
  const ctx = canvas.getContext("2d", { alpha: false });

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const hasMouse = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const smallScreen = matchMedia("(max-width: 760px)").matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  const useSmallSet = smallScreen || !hasMouse || saveData;
  const FRAME_COUNT = useSmallSet ? 48 : 96;
  const FRAME_DIR = useSmallSet ? "m" : "d";
  const REST = 0.728; // The oil pouring: a dark, calm frame for the headline.
  const INTRO_MS = 5200;
  const MAX_TILT_Y = 5;
  const MAX_TILT_X = 3.5;
  const EASE_FILM = 0.14;
  const EASE_TILT = 0.09;

  const frames = new Array(FRAME_COUNT).fill(null);
  const state = {
    target: REST,
    progress: REST,
    tiltX: 0,
    tiltY: 0,
    targetTiltX: 0,
    targetTiltY: 0,
    drawn: -1,
    introStart: 0,
    inIntro: false,
    visible: true,
    running: false,
  };

  /* Coarse frames load first so the film works early; the rest fill the gaps. */
  function loadOrder() {
    const order = [];
    const seen = new Set();
    for (let stride = 16; stride >= 1; stride = Math.floor(stride / 2)) {
      for (let i = 0; i < FRAME_COUNT; i += stride) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    if (!seen.has(FRAME_COUNT - 1)) order.push(FRAME_COUNT - 1);
    return saveData ? order.filter((i) => i % 4 === 0) : order;
  }

  function loadFrames() {
    const queue = loadOrder();
    const restFrame = Math.round(REST * (FRAME_COUNT - 1));
    queue.unshift(restFrame);
    let active = 0;
    let coarseLeft = queue.filter((i) => i % 8 === 0).length;
    const next = () => {
      while (active < 6 && queue.length) {
        const index = queue.shift();
        if (frames[index]) continue;
        active += 1;
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          frames[index] = img;
          active -= 1;
          if (index === restFrame) {
            state.drawn = -1;
            wake();
          }
          if (index % 8 === 0) {
            coarseLeft -= 1;
            if (coarseLeft <= 0) maybeStartIntro();
          }
          next();
        };
        img.onerror = () => {
          active -= 1;
          next();
        };
        img.src = `assets/film/${FRAME_DIR}/${String(index).padStart(2, "0")}.webp`;
      }
    };
    next();
  }

  function nearestFrame(index) {
    if (frames[index]) return frames[index];
    for (let offset = 1; offset < FRAME_COUNT; offset += 1) {
      if (frames[index - offset]) return frames[index - offset];
      if (frames[index + offset]) return frames[index + offset];
    }
    return null;
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.min(Math.round(canvas.offsetWidth * scale), 1800);
    canvas.height = Math.min(Math.round(canvas.offsetHeight * scale), 1400);
    state.drawn = -1;
    if (box.width) wake();
  }

  function draw() {
    const index = Math.round(state.progress * (FRAME_COUNT - 1));
    const img = nearestFrame(index);
    if (!img || img === state.drawn) return;
    const cover = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const width = img.naturalWidth * cover;
    const height = img.naturalHeight * cover;
    ctx.drawImage(img, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    state.drawn = img;
  }

  function applyTilt() {
    stage.style.transform = `rotateX(${state.tiltX.toFixed(3)}deg) rotateY(${state.tiltY.toFixed(3)}deg)`;
  }

  function syncControls() {
    const value = Math.round(state.progress * 1000);
    if (Number(slider.value) !== value) slider.value = String(value);
    let activeIndex = 0;
    let best = Infinity;
    stopButtons.forEach((button, i) => {
      const distance = Math.abs(Number(button.dataset.stop) - state.progress);
      if (distance < best) {
        best = distance;
        activeIndex = i;
      }
    });
    stopButtons.forEach((button, i) => {
      if (i === activeIndex) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    slider.setAttribute("aria-valuetext", stopButtons[activeIndex].textContent);
  }

  function frame(now) {
    state.running = false;
    if (!state.visible) return;

    if (state.inIntro) {
      const t = Math.min((now - state.introStart) / INTRO_MS, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      state.target = REST * eased;
      state.progress = state.target;
      if (t >= 1) state.inIntro = false;
    } else {
      state.progress += (state.target - state.progress) * EASE_FILM;
      if (Math.abs(state.target - state.progress) < 0.0005) state.progress = state.target;
    }

    state.tiltX += (state.targetTiltX - state.tiltX) * EASE_TILT;
    state.tiltY += (state.targetTiltY - state.tiltY) * EASE_TILT;

    draw();
    applyTilt();
    syncControls();

    const settled =
      !state.inIntro &&
      state.progress === state.target &&
      Math.abs(state.targetTiltX - state.tiltX) < 0.01 &&
      Math.abs(state.targetTiltY - state.tiltY) < 0.01;
    if (!settled) wake();
  }

  function wake() {
    if (state.running || !state.visible) return;
    state.running = true;
    requestAnimationFrame(frame);
  }

  function takeControl(progress) {
    state.inIntro = false;
    state.target = Math.min(1, Math.max(0, progress));
    wake();
  }

  /* The film plays once on arrival, then the visitor is in control. */
  function maybeStartIntro() {
    if (reduceMotion.matches || state.introPlayed) return;
    state.introPlayed = true;
    state.inIntro = true;
    state.introStart = performance.now();
    state.progress = 0;
    wake();
  }

  /* Mouse: left to right plays the film, and the scene tilts toward the cursor. */
  function handlePointer(event) {
    if (event.pointerType === "touch" || !state.visible || reduceMotion.matches) return;
    const heroBox = hero.getBoundingClientRect();
    if (event.clientY < heroBox.top || event.clientY > heroBox.bottom) return;
    const box = slider.getBoundingClientRect();
    takeControl((event.clientX - box.left) / box.width);
    const nx = (event.clientX - heroBox.left) / heroBox.width - 0.5;
    const ny = (event.clientY - heroBox.top) / heroBox.height - 0.5;
    state.targetTiltY = nx * 2 * MAX_TILT_Y;
    state.targetTiltX = -ny * 2 * MAX_TILT_X;
    wake();
  }

  function resetTilt() {
    state.targetTiltX = 0;
    state.targetTiltY = 0;
    wake();
  }

  slider.addEventListener("input", () => takeControl(Number(slider.value) / 1000));
  stopButtons.forEach((button) => {
    button.addEventListener("click", () => takeControl(Number(button.dataset.stop)));
  });
  window.addEventListener("pointermove", handlePointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", resetTilt);

  hint.textContent = hasMouse && !reduceMotion.matches
    ? "Move your mouse to play the film."
    : "Drag the slider to play the film.";

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    if (state.visible) wake();
  }).observe(hero);

  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) {
      state.inIntro = false;
      resetTilt();
    }
  });

  resize();
  syncControls();
  loadFrames();

  /* Second scene: the uses tilt as one plane, with the middle item nearest the viewer. */
  const tiltArea = document.querySelector("[data-tilt-area]");
  const tilt = document.querySelector("[data-tilt]");
  if (tiltArea && tilt && hasMouse && !reduceMotion.matches) {
    const current = { x: 0, y: 0, tx: 0, ty: 0, running: false };
    const step = () => {
      current.x += (current.tx - current.x) * 0.08;
      current.y += (current.ty - current.y) * 0.08;
      tilt.style.transform = `rotateX(${current.x.toFixed(3)}deg) rotateY(${current.y.toFixed(3)}deg)`;
      if (Math.abs(current.tx - current.x) > 0.01 || Math.abs(current.ty - current.y) > 0.01) {
        requestAnimationFrame(step);
      } else {
        current.running = false;
      }
    };
    const start = () => {
      if (!current.running) {
        current.running = true;
        requestAnimationFrame(step);
      }
    };
    tiltArea.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const box = tiltArea.getBoundingClientRect();
      current.ty = ((event.clientX - box.left) / box.width - 0.5) * 12;
      current.tx = -((event.clientY - box.top) / box.height - 0.5) * 8;
      start();
    }, { passive: true });
    tiltArea.addEventListener("pointerleave", () => {
      current.tx = 0;
      current.ty = 0;
      start();
    });
  }
})();
