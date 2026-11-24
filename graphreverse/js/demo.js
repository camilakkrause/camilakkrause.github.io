(function (GR) {
  'use strict';

/**
 * Programmatic high-DPI demo plot generators so GitHub Pages visitors can try
 * linear calibration, color-based auto-tracing, smoothing, and log-scale plots
 * immediately with zero external asset fetches.
 */

function generateDemoGraph(kind = 'spectroscopy') {
  if (kind === 'bode') {
    return buildBodeDemo();
  }
  return buildSpectroscopyDemo();
}

function buildSpectroscopyDemo() {
  const width = 1200;
  const height = 760;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Crisp academic white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const xLeft = 120;
  const plotW = 980; // 140 nm -> 7 px/nm exact
  const xRight = xLeft + plotW;
  const yTop = 80;
  const plotH = 550; // 1.1 units -> 500 px/unit exact
  const yBottom = yTop + plotH;

  const xMin = 610;
  const xMax = 750;
  const yMin = 0.0;
  const yMax = 1.1;

  const toPxX = (x) => xLeft + ((x - xMin) / (xMax - xMin)) * plotW;
  const toPxY = (y) => yBottom - ((y - yMin) / (yMax - yMin)) * plotH;

  // Minor gridlines
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 615; x <= 745; x += 5) {
    const px = toPxX(x);
    ctx.moveTo(px, yTop);
    ctx.lineTo(px, yBottom);
  }
  for (let y = 0.05; y <= 1.05; y += 0.05) {
    const py = toPxY(y);
    ctx.moveTo(xLeft, py);
    ctx.lineTo(xRight, py);
  }
  ctx.stroke();

  // Major gridlines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let x = 620; x <= 740; x += 20) {
    const px = toPxX(x);
    ctx.moveTo(px, yTop);
    ctx.lineTo(px, yBottom);
  }
  for (let y = 0.0; y <= 1.01; y += 0.2) {
    const py = toPxY(y);
    ctx.moveTo(xLeft, py);
    ctx.lineTo(xRight, py);
  }
  ctx.stroke();

  // Plot border frame
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.strokeRect(xLeft, yTop, plotW, plotH);

  // Ticks and labels
  ctx.fillStyle = '#1e293b';
  ctx.font = '15px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = 620; x <= 740; x += 20) {
    const px = toPxX(x);
    ctx.beginPath();
    ctx.moveTo(px, yBottom);
    ctx.lineTo(px, yBottom + 6);
    ctx.stroke();
    ctx.fillText(String(x), px, yBottom + 12);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = 0.0; y <= 1.01; y += 0.2) {
    const py = toPxY(y);
    ctx.beginPath();
    ctx.moveTo(xLeft - 6, py);
    ctx.lineTo(xLeft, py);
    ctx.stroke();
    ctx.fillText(y.toFixed(1), xLeft - 12, py);
  }

  // Titles
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 20px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Argon-Ion Emission Spectrum — Dual Lorentzian Reference', width * 0.5, 40);

  ctx.font = '600 16px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('Wavelength (nm)', xLeft + plotW * 0.5, yBottom + 56);

  ctx.save();
  ctx.translate(42, yTop + plotH * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Normalized Intensity (a.u.)', 0, 0);
  ctx.restore();

  // Secondary curve: Crimson Gaussian Baseline
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 400; i += 1) {
    const wl = 614 + (i / 400) * 134;
    const val = 0.42 * Math.exp(-Math.pow((wl - 684) / 18, 2)) + 0.04;
    const px = toPxX(wl);
    const py = toPxY(val);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Primary curve: Vivid Blue Dual-Peak Lorentzian with subtle measurement ripple
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  for (let i = 0; i <= 600; i += 1) {
    const wl = 614 + (i / 600) * 134;
    const l1 = 0.99 / (1 + Math.pow((wl - 652.8) / 10.5, 2));
    const l2 = 0.215 / (1 + Math.pow((wl - 715.0) / 13.5, 2));
    const ripple = 0.005 * Math.sin(wl * 0.85) + 0.003 * Math.cos(wl * 1.9);
    const val = Math.max(0.005, l1 + l2 + ripple);
    const px = toPxX(wl);
    const py = toPxY(val);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Legend box (top-right inside plot — tests tracked tracer legend rejection)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(830, 108, 240, 74);
  ctx.strokeRect(830, 108, 240, 74);

  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(846, 132);
  ctx.lineTo(880, 132);
  ctx.stroke();

  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(846, 158);
  ctx.lineTo(880, 158);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '14px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Measured Line Profile', 892, 132);
  ctx.fillText('Thermal Background', 892, 158);

  return {
    demoKey: 'spectroscopy',
    name: 'Argon-Emission-Demo.png',
    width,
    height,
    dataUrl: canvas.toDataURL('image/png'),
    hint: 'Linear X/Y spectroscopy plot. Calibrate X1=620, X2=740, Y1=0, Y2=1 (or click Auto-Calibrate Demo) and run Auto-Trace on the blue curve.',
    targetColorHint: { r: 29, g: 78, b: 216, hex: '#1d4ed8' },
    demoCalibration: {
      mode: 'orthogonal',
      xScale: 'linear',
      yScale: 'linear',
      pins: {
        x1: { px: 190, py: 630, value: 620 },
        x2: { px: 1030, py: 630, value: 740 },
        y1: { px: 120, py: 630, value: 0 },
        y2: { px: 120, py: 130, value: 1 },
      },
    },
  };
}

function buildBodeDemo() {
  const width = 1200;
  const height = 760;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const xLeft = 130;
  const plotW = 960; // 4 decades (10^1..10^5) -> 240 px/decade exact
  const xRight = xLeft + plotW;
  const yTop = 80;
  const plotH = 550; // -40..+15 dB -> 10 px/dB exact
  const yBottom = yTop + plotH;

  const logMin = 1; // 10^1 = 10
  const logMax = 5; // 10^5 = 100000
  const yMin = -40;
  const yMax = 15;

  const toPxX = (freq) => xLeft + ((Math.log10(freq) - logMin) / (logMax - logMin)) * plotW;
  const toPxY = (db) => yBottom - ((db - yMin) / (yMax - yMin)) * plotH;

  // Logarithmic vertical minor gridlines
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let exp = 1; exp < 5; exp += 1) {
    for (let m = 2; m <= 9; m += 1) {
      const px = toPxX(m * Math.pow(10, exp));
      ctx.moveTo(px, yTop);
      ctx.lineTo(px, yBottom);
    }
  }
  for (let db = -35; db <= 10; db += 5) {
    if (db % 10 === 0) continue;
    const py = toPxY(db);
    ctx.moveTo(xLeft, py);
    ctx.lineTo(xRight, py);
  }
  ctx.stroke();

  // Major gridlines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let exp = 1; exp <= 5; exp += 1) {
    const px = toPxX(Math.pow(10, exp));
    ctx.moveTo(px, yTop);
    ctx.lineTo(px, yBottom);
  }
  for (let db = -40; db <= 10; db += 10) {
    const py = toPxY(db);
    ctx.moveTo(xLeft, py);
    ctx.lineTo(xRight, py);
  }
  ctx.stroke();

  // Border frame
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.strokeRect(xLeft, yTop, plotW, plotH);

  // Axis ticks & labels
  ctx.fillStyle = '#1e293b';
  ctx.font = '15px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelsX = ['10', '100', '1k', '10k', '100k'];
  for (let exp = 1; exp <= 5; exp += 1) {
    const px = toPxX(Math.pow(10, exp));
    ctx.beginPath();
    ctx.moveTo(px, yBottom);
    ctx.lineTo(px, yBottom + 6);
    ctx.stroke();
    ctx.fillText(labelsX[exp - 1], px, yBottom + 12);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let db = -40; db <= 10; db += 10) {
    const py = toPxY(db);
    ctx.beginPath();
    ctx.moveTo(xLeft - 6, py);
    ctx.lineTo(xLeft, py);
    ctx.stroke();
    ctx.fillText(String(db), xLeft - 12, py);
  }

  // Titles
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 20px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('2nd-Order Low-Pass Filter Frequency Response (Semi-Log)', width * 0.5, 40);

  ctx.font = '600 16px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('Frequency (Hz) — Log10 Scale', xLeft + plotW * 0.5, yBottom + 56);

  ctx.save();
  ctx.translate(44, yTop + plotH * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Magnitude Gain (dB)', 0, 0);
  ctx.restore();

  const biquadDb = (f, fc, zeta) => {
    const r = f / fc;
    const t1 = 1 - r * r;
    const t2 = 2 * zeta * r;
    const mag = 1 / Math.sqrt(t1 * t1 + t2 * t2);
    return 20 * Math.log10(mag);
  };

  // Secondary curve: Damped reference (Amber)
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 500; i += 1) {
    const logF = logMin + (i / 500) * (logMax - logMin);
    const f = Math.pow(10, logF);
    const db = biquadDb(f, 800, 0.707);
    if (db < yMin) continue;
    const px = toPxX(f);
    const py = toPxY(db);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  // Primary curve: Resonant response (Emerald)
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  started = false;
  for (let i = 0; i <= 500; i += 1) {
    const logF = logMin + (i / 500) * (logMax - logMin);
    const f = Math.pow(10, logF);
    const db = biquadDb(f, 1200, 0.22);
    if (db < yMin) continue;
    const px = toPxX(f);
    const py = toPxY(db);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  // Legend
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(830, 108, 232, 74);
  ctx.strokeRect(830, 108, 232, 74);

  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(846, 132);
  ctx.lineTo(880, 132);
  ctx.stroke();

  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(846, 158);
  ctx.lineTo(880, 158);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '14px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Resonant (ζ = 0.22)', 892, 132);
  ctx.fillText('Butterworth (ζ = 0.71)', 892, 158);

  return {
    demoKey: 'bode',
    name: 'Filter-Frequency-Response-Demo.png',
    width,
    height,
    dataUrl: canvas.toDataURL('image/png'),
    hint: 'Semi-log Bode plot (X = Log10 10..100000 Hz, Y = Linear -40..10 dB). Try Auto-Calibrate Demo or set X Scale = Log10!',
    targetColorHint: { r: 5, g: 150, b: 105, hex: '#059669' },
    demoCalibration: {
      mode: 'orthogonal',
      xScale: 'log10',
      yScale: 'linear',
      pins: {
        x1: { px: 130, py: 630, value: 10 },
        x2: { px: 1090, py: 630, value: 100000 },
        y1: { px: 130, py: 630, value: -40 },
        y2: { px: 130, py: 130, value: 10 },
      },
    },
  };
}

GR.demo = { generateDemoGraph };
})(globalThis.GraphRev = globalThis.GraphRev || {});
