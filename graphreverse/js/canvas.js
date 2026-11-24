(function (GR) {
  'use strict';

const {
  pixelToReal,
  realToPixel,
  generateTicks,
  toCalc,
  fromCalc,
  sortPoints,
  formatTick,
} = GR.math;
const { sampleColorAt, snapPixelToColor } = GR.tracer;
const { store, nextId } = GR.state;

const MIN_SCALE = 0.1;
const MAX_SCALE = 40;

class GraphCanvas {
  constructor(opts) {
    this.stageEl = opts.stageEl;
    this.canvas = opts.canvasEl;
    this.ctx = this.canvas.getContext('2d');
    this.loupeEl = opts.loupeEl;
    this.loupeCanvas = opts.loupeCanvasEl;
    this.loupeCtx = this.loupeCanvas ? this.loupeCanvas.getContext('2d') : null;
    this.loupeZoomBadge = opts.loupeZoomBadge;
    this.loupeColorChip = opts.loupeColorChip;
    this.loupePixelText = opts.loupePixelText;

    this.onPinPlaced = opts.onPinPlaced || (() => {});
    this.onCursorMove = opts.onCursorMove || (() => {});
    this.onZoomChange = opts.onZoomChange || (() => {});

    this.imgEl = null;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    this.cachedImageData = null;
    this.loadedDataUrl = null;

    this.cssWidth = 800;
    this.cssHeight = 500;
    this.dpr = window.devicePixelRatio || 1;

    this.viewport = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };

    this.cursor = {
      inside: false,
      sx: 0,
      sy: 0,
      px: 0,
      py: 0,
    };

    this.spaceDown = false;
    this.drag = null; // { kind: 'pan'|'pin'|'point'|'roi', ... }
    this._rafPending = false;

    this._bindEvents();
    this._setupResizeObserver();
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this._resize());
      this.resizeObserver.observe(this.stageEl);
    }
    this._resize();
  }

  _resize() {
    const rect = this.stageEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const prevW = this.cssWidth;
    const prevH = this.cssHeight;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(this.cssWidth * this.dpr);
    this.canvas.height = Math.round(this.cssHeight * this.dpr);

    if (this.loupeCanvas) {
      const lSize = 168;
      this.loupeCanvas.width = Math.round(lSize * this.dpr);
      this.loupeCanvas.height = Math.round(lSize * this.dpr);
    }

    if (this.imgEl && prevW > 0 && prevH > 0) {
      this.viewport.offsetX += (this.cssWidth - prevW) * 0.5;
      this.viewport.offsetY += (this.cssHeight - prevH) * 0.5;
    }

    this.requestRender();
  }

  setSpacePan(active) {
    this.spaceDown = Boolean(active);
    this._updateCursorClass();
  }

  _updateCursorClass() {
    const tool = store.state.tool;
    let cursor = 'crosshair';
    if (this.drag?.kind === 'pan') cursor = 'grabbing';
    else if (this.spaceDown || tool === 'pan') cursor = 'grab';
    else if (tool === 'eyedropper') cursor = 'cell';
    else if (tool === 'roi') cursor = 'crosshair';
    this.canvas.style.cursor = cursor;
  }

  syncImageFromStore(fit = false) {
    const imgState = store.state.image;
    if (!imgState || !imgState.dataUrl) {
      this.imgEl = null;
      this.cachedImageData = null;
      this.loadedDataUrl = null;
      this.requestRender();
      return;
    }

    if (this.loadedDataUrl === imgState.dataUrl && this.imgEl) {
      if (fit) this.fitToView();
      else this.requestRender();
      return;
    }

    const img = new Image();
    img.onload = () => {
      this.imgEl = img;
      this.loadedDataUrl = imgState.dataUrl;
      this.offscreenCanvas.width = img.naturalWidth;
      this.offscreenCanvas.height = img.naturalHeight;
      this.offscreenCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
      this.offscreenCtx.drawImage(img, 0, 0);
      try {
        this.cachedImageData = this.offscreenCtx.getImageData(
          0,
          0,
          img.naturalWidth,
          img.naturalHeight
        );
      } catch {
        this.cachedImageData = null;
      }
      this.fitToView();
    };
    img.src = imgState.dataUrl;
  }

  getImageData() {
    return this.cachedImageData;
  }

  screenToImage(sx, sy) {
    return {
      px: (sx - this.viewport.offsetX) / this.viewport.scale,
      py: (sy - this.viewport.offsetY) / this.viewport.scale,
    };
  }

  imageToScreen(px, py) {
    return {
      sx: px * this.viewport.scale + this.viewport.offsetX,
      sy: py * this.viewport.scale + this.viewport.offsetY,
    };
  }

  fitToView(padding = 36) {
    if (!this.imgEl) return;
    const iw = this.imgEl.naturalWidth;
    const ih = this.imgEl.naturalHeight;
    if (!iw || !ih) return;

    const availW = Math.max(80, this.cssWidth - padding * 2);
    const availH = Math.max(80, this.cssHeight - padding * 2);
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(availW / iw, availH / ih)));

    this.viewport.scale = scale;
    this.viewport.offsetX = (this.cssWidth - iw * scale) * 0.5;
    this.viewport.offsetY = (this.cssHeight - ih * scale) * 0.5;

    this.onZoomChange(scale);
    this.requestRender();
  }

  zoomAt(sx, sy, factor) {
    if (!this.imgEl) return;
    const prevScale = this.viewport.scale;
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevScale * factor));
    if (nextScale === prevScale) return;

    const { px, py } = this.screenToImage(sx, sy);
    this.viewport.scale = nextScale;
    this.viewport.offsetX = sx - px * nextScale;
    this.viewport.offsetY = sy - py * nextScale;

    this.onZoomChange(nextScale);
    this.requestRender();
  }

  zoomByCenter(factor) {
    this.zoomAt(this.cssWidth * 0.5, this.cssHeight * 0.5, factor);
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointerleave', () => {
      this.cursor.inside = false;
      this.onCursorMove({ inside: false });
      this._renderLoupe();
      this.requestRender();
    });
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => this._onContextMenu(e));
  }

  _getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
    };
  }

  _hitTestPin(sx, sy, radius = 11) {
    const pins = store.state.calibration.pins;
    const rSq = radius * radius;
    let best = null;
    let bestD = Infinity;
    for (const key of ['x1', 'x2', 'y1', 'y2']) {
      const pin = pins[key];
      if (!pin) continue;
      const pos = this.imageToScreen(pin.px, pin.py);
      const dx = pos.sx - sx;
      const dy = pos.sy - sy;
      const d = dx * dx + dy * dy;
      if (d <= rSq && d < bestD) {
        bestD = d;
        best = key;
      }
    }
    return best;
  }

  _hitTestActivePoint(sx, sy, radius = 11) {
    const active = store.getActiveSeries();
    if (!active || !active.visible) return null;
    const rSq = radius * radius;
    let best = null;
    let bestD = Infinity;
    for (const pt of active.points) {
      const pos = this.imageToScreen(pt.px, pt.py);
      const dx = pos.sx - sx;
      const dy = pos.sy - sy;
      const d = dx * dx + dy * dy;
      if (d <= rSq && d < bestD) {
        bestD = d;
        best = { seriesId: active.id, pointId: pt.id };
      }
    }
    return best;
  }

  _onWheel(e) {
    if (!this.imgEl) return;
    e.preventDefault();
    const { sx, sy } = this._getCanvasCoords(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.zoomAt(sx, sy, factor);
  }

  _onPointerDown(e) {
    if (!this.imgEl) return;
    const { sx, sy } = this._getCanvasCoords(e);
    const { px, py } = this.screenToImage(sx, sy);

    // Middle-click or Space+drag or Pan tool
    if (e.button === 1 || ((this.spaceDown || store.state.tool === 'pan') && e.button === 0)) {
      e.preventDefault();
      this.drag = {
        kind: 'pan',
        pointerId: e.pointerId,
        startSx: sx,
        startSy: sy,
        origOffsetX: this.viewport.offsetX,
        origOffsetY: this.viewport.offsetY,
        moved: false,
      };
      this.canvas.setPointerCapture?.(e.pointerId);
      this._updateCursorClass();
      return;
    }

    if (e.button !== 0) return;

    const tool = store.state.tool;

    // ROI drag tool
    if (tool === 'roi') {
      const clampedX = Math.max(0, Math.min(this.imgEl.naturalWidth, px));
      const clampedY = Math.max(0, Math.min(this.imgEl.naturalHeight, py));
      this.drag = {
        kind: 'roi',
        pointerId: e.pointerId,
        startSx: sx,
        startSy: sy,
        startPx: clampedX,
        startPy: clampedY,
        moved: false,
      };
      this.canvas.setPointerCapture?.(e.pointerId);
      return;
    }

    // Check draggable handle hit-test (pins or active points)
    if (tool === 'calibrate' || tool === 'pick') {
      const hitPin = tool === 'calibrate'
        ? this._hitTestPin(sx, sy)
        : null;
      const hitPt = tool === 'pick'
        ? this._hitTestActivePoint(sx, sy)
        : null;
      const fallbackPin = !hitPt && tool === 'pick' ? this._hitTestPin(sx, sy, 9) : null;

      if (hitPin || fallbackPin) {
        const pinKey = hitPin || fallbackPin;
        const pin = store.state.calibration.pins[pinKey];
        this.drag = {
          kind: 'pin',
          pointerId: e.pointerId,
          pinKey,
          startSx: sx,
          startSy: sy,
          origPx: pin.px,
          origPy: pin.py,
          historyPushed: false,
          moved: false,
        };
        store.state.selectedPoint = { type: 'pin', pinKey };
        this.canvas.setPointerCapture?.(e.pointerId);
        this.requestRender();
        return;
      }

      if (hitPt) {
        const active = store.getActiveSeries();
        const pt = active?.points.find((p) => p.id === hitPt.pointId);
        if (pt) {
          this.drag = {
            kind: 'point',
            pointerId: e.pointerId,
            seriesId: hitPt.seriesId,
            pointId: hitPt.pointId,
            startSx: sx,
            startSy: sy,
            origPx: pt.px,
            origPy: pt.py,
            historyPushed: false,
            moved: false,
          };
          store.state.selectedPoint = { type: 'point', ...hitPt };
          this.canvas.setPointerCapture?.(e.pointerId);
          store.emit('selection');
          this.requestRender();
          return;
        }
      }
    }

    // Immediate non-drag click actions for calibrate, pick, eyedropper
    this.drag = {
      kind: 'click',
      pointerId: e.pointerId,
      tool,
      startSx: sx,
      startSy: sy,
      px,
      py,
      moved: false,
    };
  }

  _onPointerMove(e) {
    if (!this.imgEl) return;
    const { sx, sy } = this._getCanvasCoords(e);
    const rect = this.canvas.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    const { px, py } = this.screenToImage(sx, sy);
    this.cursor = { inside, sx, sy, px, py };

    if (this.drag) {
      const dist = Math.hypot(sx - this.drag.startSx, sy - this.drag.startSy);
      if (dist > 2.5) this.drag.moved = true;

      if (this.drag.kind === 'pan') {
        this.viewport.offsetX = this.drag.origOffsetX + (sx - this.drag.startSx);
        this.viewport.offsetY = this.drag.origOffsetY + (sy - this.drag.startSy);
        this.requestRender();
        return;
      }

      if (this.drag.kind === 'pin' && this.drag.moved) {
        if (!this.drag.historyPushed) {
          store.pushHistory();
          this.drag.historyPushed = true;
        }
        const pin = store.state.calibration.pins[this.drag.pinKey];
        if (pin) {
          pin.px = px;
          pin.py = py;
          store._invalidateCalibCache();
          store.emit('state');
        }
      } else if (this.drag.kind === 'point' && this.drag.moved) {
        if (!this.drag.historyPushed) {
          store.pushHistory();
          this.drag.historyPushed = true;
        }
        const s = store.state.series.find((item) => item.id === this.drag.seriesId);
        const pt = s?.points.find((p) => p.id === this.drag.pointId);
        if (pt) {
          pt.px = px;
          pt.py = py;
          store.emit('state');
        }
      } else if (this.drag.kind === 'roi') {
        const clampedX = Math.max(0, Math.min(this.imgEl.naturalWidth, px));
        const clampedY = Math.max(0, Math.min(this.imgEl.naturalHeight, py));
        store.state.tracer.roi = {
          x: Math.min(this.drag.startPx, clampedX),
          y: Math.min(this.drag.startPy, clampedY),
          w: Math.abs(clampedX - this.drag.startPx),
          h: Math.abs(clampedY - this.drag.startPy),
        };
        this.requestRender();
      }
    } else if (inside) {
      // Hover detection for active points
      const hitPt = this._hitTestActivePoint(sx, sy, 10);
      if (hitPt) {
        store.setHoveredPoint({ type: 'point', ...hitPt, from: 'canvas' });
      } else if (store.state.hoveredPoint?.from === 'canvas') {
        store.setHoveredPoint(null);
      }
    }

    if (inside) {
      const transform = store.getCalibrationTransform();
      const real = transform.valid ? pixelToReal(transform, px, py) : { x: NaN, y: NaN };
      this.onCursorMove({ inside: true, px, py, real });
      this._positionLoupe(sx, sy);
    } else {
      this.onCursorMove({ inside: false });
    }

    this._renderLoupe();
    this.requestRender();
  }

  _onPointerUp(e) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    try {
      this.canvas.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    this._updateCursorClass();

    if (drag.kind === 'pan') {
      this.requestRender();
      return;
    }

    if (drag.kind === 'pin') {
      if (drag.moved) {
        store.scheduleAutoSave();
        store.emit('state');
      } else {
        // Clicking an existing pin opens its inline value editor
        const pin = store.state.calibration.pins[drag.pinKey];
        if (pin) {
          const scr = this.imageToScreen(pin.px, pin.py);
          this.onPinPlaced(drag.pinKey, scr.sx, scr.sy);
        }
      }
      return;
    }

    if (drag.kind === 'point') {
      if (drag.moved) {
        store.scheduleAutoSave();
      }
      store.emit('state');
      return;
    }

    if (drag.kind === 'roi') {
      const roi = store.state.tracer.roi;
      if (!roi || roi.w < 4 || roi.h < 4) {
        store.state.tracer.roi = null;
      }
      store.scheduleAutoSave();
      store.emit('state');
      return;
    }

    if (drag.kind === 'click' && !drag.moved) {
      const { sx, sy } = this._getCanvasCoords(e);
      const { px, py } = this.screenToImage(sx, sy);

      if (drag.tool === 'calibrate') {
        const pinKey = store.state.calibStep || 'x1';
        store.pushHistory();
        const existingVal = store.state.calibration.pins[pinKey]?.value ?? null;
        store.state.calibration.pins[pinKey] = {
          px,
          py,
          value: existingVal,
        };
        store.state.selectedPoint = { type: 'pin', pinKey };
        store._invalidateCalibCache();
        store.scheduleAutoSave();
        store.emit('state');
        this.onPinPlaced(pinKey, sx, sy);
        return;
      }

      if (drag.tool === 'pick') {
        const active = store.getActiveSeries();
        if (!active) return;

        let finalPx = px;
        let finalPy = py;
        if (store.state.tracer.snapToColor && this.cachedImageData) {
          const snapped = snapPixelToColor(
            this.cachedImageData,
            px,
            py,
            store.state.tracer.targetRgb,
            store.state.tracer.tolerance,
            store.state.tracer.snapRadius
          );
          finalPx = snapped.px;
          finalPy = snapped.py;
        }

        store.pushHistory();
        const pt = { id: nextId('pt'), px: finalPx, py: finalPy };
        active.points.push(pt);
        store.state.selectedPoint = { type: 'point', seriesId: active.id, pointId: pt.id };
        store.scheduleAutoSave();
        store.emit('state');
        return;
      }

      if (drag.tool === 'eyedropper') {
        if (!this.cachedImageData) return;
        const sampled = sampleColorAt(this.cachedImageData, px, py, 0);
        store.state.tracer.targetRgb = { r: sampled.r, g: sampled.g, b: sampled.b };
        store.state.tracer.targetHex = sampled.hex;
        store.scheduleAutoSave();
        store.emit('state');
        store.notify(`Picked curve color ${sampled.hex}`, 'success');
      }
    }
  }

  _onContextMenu(e) {
    if (!this.imgEl) return;
    e.preventDefault();
    const { sx, sy } = this._getCanvasCoords(e);
    const active = store.getActiveSeries();
    if (!active || !active.points.length) return;

    const hit = this._hitTestActivePoint(sx, sy, 26);
    if (!hit) return;

    store.pushHistory();
    active.points = active.points.filter((p) => p.id !== hit.pointId);
    if (
      store.state.selectedPoint?.type === 'point' &&
      store.state.selectedPoint.pointId === hit.pointId
    ) {
      store.state.selectedPoint = null;
    }
    store.scheduleAutoSave();
    store.emit('state');
  }

  _positionLoupe(sx, sy) {
    if (!this.loupeEl) return;
    const flipLeft = sx > this.cssWidth - 230 && sy < 240;
    this.loupeEl.classList.toggle('loupe-left', flipLeft);
  }

  requestRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.render();
      this._renderLoupe();
    });
  }

  render() {
    this._updateCursorClass();
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    if (!this.imgEl) {
      ctx.restore();
      return;
    }

    const iw = this.imgEl.naturalWidth;
    const ih = this.imgEl.naturalHeight;
    const { scale, offsetX, offsetY } = this.viewport;
    const view = store.state.view;

    // 1. Base Image with CSS view filters isolated from overlays
    ctx.save();
    ctx.filter = `brightness(${view.brightness}%) contrast(${view.contrast}%) invert(${view.invert ? 1 : 0})`;
    ctx.globalAlpha = Math.max(0.05, Math.min(1, view.imageOpacity / 100));
    ctx.imageSmoothingEnabled = scale < 3;
    ctx.drawImage(this.imgEl, offsetX, offsetY, iw * scale, ih * scale);
    ctx.restore();

    // Subtle image frame
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, iw * scale, ih * scale);

    const transform = store.getCalibrationTransform();

    // 2. Calibrated grid & axis lines (clipped inside image box)
    if (transform.valid) {
      this._drawCalibratedOverlays(ctx, transform, iw, ih, view.showGrid);
    }

    // 3. ROI Selection box
    if (store.state.tracer.roi) {
      const roi = store.state.tracer.roi;
      const topLeft = this.imageToScreen(roi.x, roi.y);
      const rw = roi.w * scale;
      const rh = roi.h * scale;
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(topLeft.sx, topLeft.sy, rw, rh);
      ctx.strokeRect(topLeft.sx, topLeft.sy, rw, rh);
      ctx.restore();
    }

    // 4. Data Series polylines & markers
    this._drawSeries(ctx);

    // 5. Auto-tracer preview points
    if (store.state.tracer.previewPoints.length > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.strokeStyle = '#0b0f17';
      ctx.lineWidth = 1;
      for (const pt of store.state.tracer.previewPoints) {
        const s = this.imageToScreen(pt.px, pt.py);
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Calibration Pins
    this._drawPins(ctx);

    // 7. Live calibrated axis-projected cursor crosshairs
    if (this.cursor.inside && transform.valid && store.state.tool !== 'pan') {
      this._drawAxisCrosshairs(ctx, transform, this.cursor.px, this.cursor.py);
    }

    ctx.restore();
  }

  _drawCalibratedOverlays(ctx, transform, iw, ih, showGrid) {
    const { offsetX, offsetY, scale } = this.viewport;
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, iw * scale, ih * scale);
    ctx.clip();

    const corners = [
      [0, 0],
      [iw, 0],
      [0, ih],
      [iw, ih],
    ];

    // Calculate bounds in linear calc-space so log10 never explodes at image borders
    let cXMin = Infinity;
    let cXMax = -Infinity;
    let cYMin = Infinity;
    let cYMax = -Infinity;

    for (const [cx, cy] of corners) {
      const dpX = cx - transform.originPx[0];
      const dpY = cy - transform.originPx[1];
      const dcX = (dpX * transform.uy[1] - dpY * transform.uy[0]) / transform.det;
      const dcY = (-dpX * transform.ux[1] + dpY * transform.ux[0]) / transform.det;
      const cX = transform.originCalc[0] + dcX;
      const cY = transform.originCalc[1] + dcY;
      if (cX < cXMin) cXMin = cX;
      if (cX > cXMax) cXMax = cX;
      if (cY < cYMin) cYMin = cY;
      if (cY > cYMax) cYMax = cY;
    }

    if (transform.xScale === 'log10') {
      const pinX1 = toCalc(store.state.calibration.pins.x1.value, 'log10');
      const pinX2 = toCalc(store.state.calibration.pins.x2.value, 'log10');
      const loPin = Math.min(pinX1, pinX2) - 2;
      const hiPin = Math.max(pinX1, pinX2) + 2;
      cXMin = Math.max(cXMin, loPin);
      cXMax = Math.min(cXMax, hiPin);
    }
    if (transform.yScale === 'log10') {
      const pinY1 = toCalc(store.state.calibration.pins.y1.value, 'log10');
      const pinY2 = toCalc(store.state.calibration.pins.y2.value, 'log10');
      const loPin = Math.min(pinY1, pinY2) - 2;
      const hiPin = Math.max(pinY1, pinY2) + 2;
      cYMin = Math.max(cYMin, loPin);
      cYMax = Math.min(cYMax, hiPin);
    }

    const rXMin = fromCalc(cXMin, transform.xScale);
    const rXMax = fromCalc(cXMax, transform.xScale);
    const rYMin = fromCalc(cYMin, transform.yScale);
    const rYMax = fromCalc(cYMax, transform.yScale);

    if (showGrid && Number.isFinite(rXMin) && Number.isFinite(rXMax) && Number.isFinite(rYMin) && Number.isFinite(rYMax)) {
      const xTicks = generateTicks(rXMin, rXMax, transform.xScale, 6);
      const yTicks = generateTicks(rYMin, rYMax, transform.yScale, 6);

      const drawGridLines = (ticks, axis, isMinor) => {
        ctx.strokeStyle = isMinor ? 'rgba(56, 189, 248, 0.08)' : 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = isMinor ? 0.75 : 1;
        ctx.beginPath();
        for (const t of ticks) {
          const pA = axis === 'x' ? realToPixel(transform, t, rYMin) : realToPixel(transform, rXMin, t);
          const pB = axis === 'x' ? realToPixel(transform, t, rYMax) : realToPixel(transform, rXMax, t);
          if (!pA || !pB) continue;
          const sA = this.imageToScreen(pA.px, pA.py);
          const sB = this.imageToScreen(pB.px, pB.py);
          ctx.moveTo(sA.sx, sA.sy);
          ctx.lineTo(sB.sx, sB.sy);
        }
        ctx.stroke();
      };

      drawGridLines(xTicks.minor, 'x', true);
      drawGridLines(yTicks.minor, 'y', true);
      drawGridLines(xTicks.major, 'x', false);
      drawGridLines(yTicks.major, 'y', false);
    }

    // Draw fitted X and Y axis lines extended across image bounds
    const diag = Math.hypot(iw, ih) * 2;
    const uxMag = Math.hypot(transform.ux[0], transform.ux[1]) || 1;
    const uyMag = Math.hypot(transform.uy[0], transform.uy[1]) || 1;
    const dirX = [transform.ux[0] / uxMag, transform.ux[1] / uxMag];
    const dirY = [transform.uy[0] / uyMag, transform.uy[1] / uyMag];

    const origScreen = this.imageToScreen(transform.originPx[0], transform.originPx[1]);

    // X-axis line
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    const xA = this.imageToScreen(
      transform.originPx[0] - dirX[0] * diag,
      transform.originPx[1] - dirX[1] * diag
    );
    const xB = this.imageToScreen(
      transform.originPx[0] + dirX[0] * diag,
      transform.originPx[1] + dirX[1] * diag
    );
    ctx.moveTo(xA.sx, xA.sy);
    ctx.lineTo(xB.sx, xB.sy);
    ctx.stroke();

    // Y-axis line
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.78)';
    ctx.beginPath();
    const yA = this.imageToScreen(
      transform.originPx[0] - dirY[0] * diag,
      transform.originPx[1] - dirY[1] * diag
    );
    const yB = this.imageToScreen(
      transform.originPx[0] + dirY[0] * diag,
      transform.originPx[1] + dirY[1] * diag
    );
    ctx.moveTo(yA.sx, yA.sy);
    ctx.lineTo(yB.sx, yB.sy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Virtual origin intersection marker
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(origScreen.sx, origScreen.sy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  _drawSeries(ctx) {
    const transform = store.getCalibrationTransform();
    const activeId = store.state.activeSeriesId;
    const selected = store.state.selectedPoint;
    const hovered = store.state.hoveredPoint;
    const connect = store.state.view.connectPoints;
    const sortByX = store.state.processing.sortByX;

    for (const s of store.state.series) {
      if (!s.visible || s.points.length === 0) continue;
      const isActive = s.id === activeId;
      ctx.save();
      ctx.globalAlpha = isActive ? 1 : 0.65;

      let ordered = s.points;
      if (connect && sortByX && transform.valid) {
        const mapped = s.points.map((pt) => {
          const real = pixelToReal(transform, pt.px, pt.py);
          return { ...pt, x: real.x };
        });
        ordered = sortPoints(mapped, true);
      }

      if (connect && ordered.length >= 2) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = isActive ? 2 : 1.5;
        ctx.beginPath();
        for (let i = 0; i < ordered.length; i += 1) {
          const p = this.imageToScreen(ordered[i].px, ordered[i].py);
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }

      for (const pt of s.points) {
        const p = this.imageToScreen(pt.px, pt.py);
        const isSel =
          selected?.type === 'point' &&
          selected.seriesId === s.id &&
          selected.pointId === pt.id;
        const isHov =
          hovered?.type === 'point' &&
          hovered.seriesId === s.id &&
          hovered.pointId === pt.id;

        if (isSel || isHov) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 9.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fill();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, isSel || isHov ? 5.5 : 4.2, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = '#0b0f17';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  _drawPins(ctx) {
    const pins = store.state.calibration.pins;
    const selected = store.state.selectedPoint;
    const labels = {
      x1: { title: 'X1', color: '#38bdf8' },
      x2: { title: 'X2', color: '#38bdf8' },
      y1: { title: 'Y1', color: '#34d399' },
      y2: { title: 'Y2', color: '#34d399' },
    };

    for (const key of ['x1', 'x2', 'y1', 'y2']) {
      const pin = pins[key];
      if (!pin) continue;

      const { sx, sy } = this.imageToScreen(pin.px, pin.py);
      const meta = labels[key];
      const isSel = selected?.type === 'pin' && selected.pinKey === key;

      ctx.save();
      if (isSel) {
        ctx.beginPath();
        ctx.arc(sx, sy, 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(248, 250, 252, 0.22)';
        ctx.fill();
      }

      // Target ring & crosshair
      ctx.strokeStyle = '#0b0f17';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 7.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 7.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx - 12, sy);
      ctx.lineTo(sx - 4, sy);
      ctx.moveTo(sx + 4, sy);
      ctx.lineTo(sx + 12, sy);
      ctx.moveTo(sx, sy - 12);
      ctx.lineTo(sx, sy - 4);
      ctx.moveTo(sx, sy + 4);
      ctx.lineTo(sx, sy + 12);
      ctx.stroke();

      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Pill label offset to top-right
      const valText = Number.isFinite(pin.value) ? ` ${formatTick(pin.value, key.startsWith('x') ? store.state.calibration.xScale : store.state.calibration.yScale)}` : ' ?';
      const labelText = `${meta.title}:${valText}`;
      ctx.font = '600 11px "JetBrains Mono", "Fira Code", monospace';
      const textW = ctx.measureText(labelText).width;
      const boxW = textW + 10;
      const boxH = 18;
      const bx = sx + 11;
      const by = sy - 24;

      ctx.fillStyle = 'rgba(11, 15, 23, 0.88)';
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, bx + 5, by + boxH * 0.5 + 0.5);

      ctx.restore();
    }
  }

  _drawAxisCrosshairs(ctx, transform, px, py) {
    const uxMag = Math.hypot(transform.ux[0], transform.ux[1]) || 1;
    const uyMag = Math.hypot(transform.uy[0], transform.uy[1]) || 1;
    const dirX = [transform.ux[0] / uxMag, transform.ux[1] / uxMag];
    const dirY = [transform.uy[0] / uyMag, transform.uy[1] / uyMag];
    const len = 4000;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const x1 = this.imageToScreen(px - dirX[0] * len, py - dirX[1] * len);
    const x2 = this.imageToScreen(px + dirX[0] * len, py + dirX[1] * len);
    const y1 = this.imageToScreen(px - dirY[0] * len, py - dirY[1] * len);
    const y2 = this.imageToScreen(px + dirY[0] * len, py + dirY[1] * len);

    ctx.beginPath();
    ctx.moveTo(x1.sx, x1.sy);
    ctx.lineTo(x2.sx, x2.sy);
    ctx.moveTo(y1.sx, y1.sy);
    ctx.lineTo(y2.sx, y2.sy);
    ctx.stroke();
    ctx.restore();
  }

  _renderLoupe() {
    if (!this.loupeEl || !this.loupeCtx) return;
    const show = Boolean(this.imgEl && store.state.view.showLoupe && this.cursor.inside);
    this.loupeEl.classList.toggle('hidden', !show);
    if (!show) return;

    const lSize = 168;
    const zoom = Math.max(2, Math.min(16, Number(store.state.view.loupeZoom || 6)));
    const ctx = this.loupeCtx;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, lSize, lSize);

    const srcSpan = lSize / zoom;
    const srcX = this.cursor.px - srcSpan * 0.5;
    const srcY = this.cursor.py - srcSpan * 0.5;

    ctx.save();
    const view = store.state.view;
    ctx.filter = `brightness(${view.brightness}%) contrast(${view.contrast}%) invert(${view.invert ? 1 : 0})`;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.imgEl, srcX, srcY, srcSpan, srcSpan, 0, 0, lSize, lSize);
    ctx.restore();

    const toLoupe = (px, py) => ({
      lx: (px - srcX) * zoom,
      ly: (py - srcY) * zoom,
    });

    // Draw pins and active series markers in loupe
    for (const s of store.state.series) {
      if (!s.visible) continue;
      for (const pt of s.points) {
        const { lx, ly } = toLoupe(pt.px, pt.py);
        if (lx < -10 || ly < -10 || lx > lSize + 10 || ly > lSize + 10) continue;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = '#0b0f17';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    const pins = store.state.calibration.pins;
    for (const key of ['x1', 'x2', 'y1', 'y2']) {
      const pin = pins[key];
      if (!pin) continue;
      const { lx, ly } = toLoupe(pin.px, pin.py);
      if (lx < -12 || ly < -12 || lx > lSize + 12 || ly > lSize + 12) continue;
      ctx.strokeStyle = key.startsWith('x') ? '#38bdf8' : '#34d399';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(lx, ly, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Center 1px contrasting crosshair
    const mid = lSize * 0.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, lSize);
    ctx.moveTo(0, mid);
    ctx.lineTo(lSize, mid);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, lSize);
    ctx.moveTo(0, mid);
    ctx.lineTo(lSize, mid);
    ctx.stroke();

    ctx.restore();

    if (this.loupeZoomBadge) {
      this.loupeZoomBadge.textContent = `${zoom}×`;
    }
    if (this.loupePixelText) {
      this.loupePixelText.textContent = `${Math.round(this.cursor.px)}, ${Math.round(this.cursor.py)}`;
    }
    if (this.loupeColorChip && this.cachedImageData) {
      const sampled = sampleColorAt(this.cachedImageData, this.cursor.px, this.cursor.py, 0);
      this.loupeColorChip.style.backgroundColor = sampled.hex;
      this.loupeColorChip.title = sampled.hex;
    }
  }
}

GR.canvas = { GraphCanvas };
})(globalThis.GraphRev = globalThis.GraphRev || {});
