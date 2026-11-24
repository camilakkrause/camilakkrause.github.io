(function (GR) {
  'use strict';

const { toCalc, fromCalc, generateTicks, formatTick } = GR.math;
const { store } = GR.state;

class PreviewChart {
  constructor(canvasEl, containerEl) {
    this.canvas = canvasEl;
    this.container = containerEl;
    this.ctx = this.canvas.getContext('2d');
    this.cssWidth = 600;
    this.cssHeight = 200;
    this.dpr = window.devicePixelRatio || 1;
    this.plottedPoints = [];
    this.hoverInfo = null;

    this._bindEvents();
    this._setupResize();
  }

  _setupResize() {
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(this.container);
    }
    this._resize();
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.cssWidth * this.dpr);
    this.canvas.height = Math.round(this.cssHeight * this.dpr);
    this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.plottedPoints.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let best = null;
      let bestDist = 22 * 22;
      for (const item of this.plottedPoints) {
        const dx = item.sx - mx;
        const dy = item.sy - my;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = item;
        }
      }

      if (best) {
        this.hoverInfo = best;
        store.setHoveredPoint({
          type: 'point',
          seriesId: best.seriesId,
          pointId: best.pointId,
          from: 'chart',
        });
      } else {
        this.hoverInfo = null;
        if (store.state.hoveredPoint?.from === 'chart') {
          store.setHoveredPoint(null);
        }
      }
      this.render();
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.hoverInfo = null;
      if (store.state.hoveredPoint?.from === 'chart') {
        store.setHoveredPoint(null);
      }
      this.render();
    });
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const isLight = store.state.theme === 'light';
    const textMuted = isLight ? '#64748b' : '#94a3b8';
    const textPrimary = isLight ? '#0f172a' : '#f1f5f9';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.14)';
    const axisBorder = isLight ? 'rgba(15, 23, 42, 0.28)' : 'rgba(148, 163, 184, 0.32)';

    const transform = store.getCalibrationTransform();
    const xScale = store.state.calibration.xScale;
    const yScale = store.state.calibration.yScale;
    const smoothingActive = store.state.processing.smoothMethod !== 'none';

    const visibleEntries = [];
    for (const s of store.state.series) {
      if (!s.visible) continue;
      const pts = store.getProcessedSeriesPoints(s);
      if (pts.length > 0) {
        visibleEntries.push({ series: s, points: pts });
      }
    }

    this.plottedPoints = [];

    if (!transform.valid || visibleEntries.length === 0) {
      ctx.fillStyle = textMuted;
      ctx.font = '500 13px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const msg = !transform.valid
        ? 'Complete 4-point calibration (X1, X2, Y1, Y2) to preview reconstructed curve.'
        : 'Add or auto-trace data points to inspect the live reconstructed plot.';
      ctx.fillText(msg, this.cssWidth * 0.5, this.cssHeight * 0.5);
      ctx.restore();
      return;
    }

    // Collect bounds in calc-space
    let cXMin = Infinity;
    let cXMax = -Infinity;
    let cYMin = Infinity;
    let cYMax = -Infinity;

    for (const entry of visibleEntries) {
      for (const pt of entry.points) {
        const cx = toCalc(pt.x, xScale);
        const cyRaw = toCalc(pt.yRaw, yScale);
        const cySmooth = smoothingActive ? toCalc(pt.ySmooth, yScale) : cyRaw;

        if (Number.isFinite(cx)) {
          if (cx < cXMin) cXMin = cx;
          if (cx > cXMax) cXMax = cx;
        }
        if (Number.isFinite(cyRaw)) {
          if (cyRaw < cYMin) cYMin = cyRaw;
          if (cyRaw > cYMax) cYMax = cyRaw;
        }
        if (Number.isFinite(cySmooth)) {
          if (cySmooth < cYMin) cYMin = cySmooth;
          if (cySmooth > cYMax) cYMax = cySmooth;
        }
      }
    }

    if (!Number.isFinite(cXMin) || !Number.isFinite(cYMin)) {
      ctx.fillStyle = textMuted;
      ctx.font = '500 13px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Points fall outside valid logarithmic domain (> 0).', this.cssWidth * 0.5, this.cssHeight * 0.5);
      ctx.restore();
      return;
    }

    const spanX = cXMax - cXMin;
    const spanY = cYMax - cYMin;
    const padX = spanX > 1e-12 ? spanX * 0.05 : 1;
    const padY = spanY > 1e-12 ? spanY * 0.08 : 1;

    cXMin -= padX;
    cXMax += padX;
    cYMin -= padY;
    cYMax += padY;

    const mLeft = 64;
    const mRight = 20;
    const mTop = 14;
    const mBottom = 30;
    const plotW = Math.max(40, this.cssWidth - mLeft - mRight);
    const plotH = Math.max(40, this.cssHeight - mTop - mBottom);

    const toSx = (cx) => mLeft + ((cx - cXMin) / (cXMax - cXMin)) * plotW;
    const toSy = (cy) => mTop + plotH - ((cy - cYMin) / (cYMax - cYMin)) * plotH;

    // Gridlines & ticks
    const rXMin = fromCalc(cXMin, xScale);
    const rXMax = fromCalc(cXMax, xScale);
    const rYMin = fromCalc(cYMin, yScale);
    const rYMax = fromCalc(cYMax, yScale);
    const xTicks = generateTicks(rXMin, rXMax, xScale, 7);
    const yTicks = generateTicks(rYMin, rYMax, yScale, 4);

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const xv of xTicks.major) {
      const cx = toCalc(xv, xScale);
      if (!Number.isFinite(cx)) continue;
      const sx = toSx(cx);
      ctx.moveTo(sx, mTop);
      ctx.lineTo(sx, mTop + plotH);
    }
    for (const yv of yTicks.major) {
      const cy = toCalc(yv, yScale);
      if (!Number.isFinite(cy)) continue;
      const sy = toSy(cy);
      ctx.moveTo(mLeft, sy);
      ctx.lineTo(mLeft + plotW, sy);
    }
    ctx.stroke();

    // Frame border
    ctx.strokeStyle = axisBorder;
    ctx.strokeRect(mLeft, mTop, plotW, plotH);

    // Tick labels
    ctx.fillStyle = textMuted;
    ctx.font = '11px "JetBrains Mono", "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const xv of xTicks.major) {
      const cx = toCalc(xv, xScale);
      if (!Number.isFinite(cx)) continue;
      const sx = toSx(cx);
      if (sx < mLeft + 10 || sx > mLeft + plotW - 10) continue;
      ctx.fillText(formatTick(xv, xScale), sx, mTop + plotH + 6);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const yv of yTicks.major) {
      const cy = toCalc(yv, yScale);
      if (!Number.isFinite(cy)) continue;
      const sy = toSy(cy);
      if (sy < mTop + 6 || sy > mTop + plotH - 6) continue;
      ctx.fillText(formatTick(yv, yScale), mLeft - 8, sy);
    }

    // Clip plot area for curves
    ctx.save();
    ctx.beginPath();
    ctx.rect(mLeft, mTop, plotW, plotH);
    ctx.clip();

    const hoveredGlobal = store.state.hoveredPoint;

    for (const entry of visibleEntries) {
      const { series, points } = entry;
      const rawCoords = [];
      const smoothCoords = [];

      for (const pt of points) {
        const cx = toCalc(pt.x, xScale);
        const cyRaw = toCalc(pt.yRaw, yScale);
        const cySm = smoothingActive ? toCalc(pt.ySmooth, yScale) : cyRaw;
        if (!Number.isFinite(cx) || !Number.isFinite(cyRaw)) continue;

        const sx = toSx(cx);
        const syRaw = toSy(cyRaw);
        const sySm = Number.isFinite(cySm) ? toSy(cySm) : syRaw;

        rawCoords.push({ sx, sy: syRaw, pt });
        smoothCoords.push({ sx, sy: sySm, pt });

        this.plottedPoints.push({
          seriesId: series.id,
          seriesName: series.name,
          color: series.color,
          pointId: pt.id,
          sx,
          sy: smoothingActive ? sySm : syRaw,
          x: pt.x,
          yRaw: pt.yRaw,
          ySmooth: pt.ySmooth,
        });
      }

      if (smoothingActive) {
        // Raw points as translucent dots
        ctx.fillStyle = series.color;
        ctx.globalAlpha = 0.38;
        for (const c of rawCoords) {
          ctx.beginPath();
          ctx.arc(c.sx, c.sy, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Smoothed curve as crisp solid line
        ctx.globalAlpha = 1;
        if (smoothCoords.length >= 2) {
          ctx.strokeStyle = series.color;
          ctx.lineWidth = 2.2;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < smoothCoords.length; i += 1) {
            const c = smoothCoords[i];
            if (i === 0) ctx.moveTo(c.sx, c.sy);
            else ctx.lineTo(c.sx, c.sy);
          }
          ctx.stroke();
        }
      } else {
        if (store.state.view.connectPoints && rawCoords.length >= 2) {
          ctx.strokeStyle = series.color;
          ctx.lineWidth = 1.8;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < rawCoords.length; i += 1) {
            const c = rawCoords[i];
            if (i === 0) ctx.moveTo(c.sx, c.sy);
            else ctx.lineTo(c.sx, c.sy);
          }
          ctx.stroke();
        }

        ctx.fillStyle = series.color;
        for (const c of rawCoords) {
          const isHov =
            hoveredGlobal?.seriesId === series.id && hoveredGlobal?.pointId === c.pt.id;
          ctx.beginPath();
          ctx.arc(c.sx, c.sy, isHov ? 4.8 : 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore(); // End plot clip

    // Hover crosshair & floating tooltip
    const activeHover =
      this.hoverInfo ||
      (hoveredGlobal?.type === 'point'
        ? this.plottedPoints.find(
            (p) => p.seriesId === hoveredGlobal.seriesId && p.pointId === hoveredGlobal.pointId
          )
        : null);

    if (activeHover) {
      ctx.save();
      ctx.strokeStyle = activeHover.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(activeHover.sx, mTop);
      ctx.lineTo(activeHover.sx, mTop + plotH);
      ctx.moveTo(mLeft, activeHover.sy);
      ctx.lineTo(mLeft + plotW, activeHover.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(activeHover.sx, activeHover.sy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = activeHover.color;
      ctx.fill();
      ctx.strokeStyle = textPrimary;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const label = smoothingActive
        ? `${activeHover.seriesName} | X: ${formatTick(activeHover.x, xScale)} | Raw: ${formatTick(activeHover.yRaw, yScale)} | Smooth: ${formatTick(activeHover.ySmooth, yScale)}`
        : `${activeHover.seriesName} | X: ${formatTick(activeHover.x, xScale)} | Y: ${formatTick(activeHover.yRaw, yScale)}`;

      ctx.font = '500 11px "JetBrains Mono", "Fira Code", monospace';
      const tw = ctx.measureText(label).width + 14;
      const th = 22;
      const tx = Math.min(this.cssWidth - tw - 8, Math.max(mLeft + 4, activeHover.sx + 10));
      const ty = Math.max(mTop + 4, activeHover.sy - th - 8);

      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(17, 24, 39, 0.94)';
      ctx.strokeStyle = activeHover.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, th, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = textPrimary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx + 7, ty + th * 0.5);
      ctx.restore();
    }

    ctx.restore();
  }
}

GR.chart = { PreviewChart };
})(globalThis.GraphRev = globalThis.GraphRev || {});
