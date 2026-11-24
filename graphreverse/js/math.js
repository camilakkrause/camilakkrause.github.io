(function (GR) {
  'use strict';

/**
 * Core mathematical transformations, calibration math, tick generation,
 * smoothing filters, and scientific summary statistics.
 *
 * Pure ES module with zero DOM dependencies so it runs identically in browsers
 * and Node.js unit tests.
 */

/**
 * Parse a numeric input string supporting decimals and scientific notation.
 * @param {string|number} raw
 * @returns {{ ok: boolean, value: number }}
 */
function parseNumericInput(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, value: NaN };
  }
  const str = String(raw ?? '').trim();
  if (!str) {
    return { ok: false, value: NaN };
  }
  const numericPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!numericPattern.test(str)) {
    return { ok: false, value: NaN };
  }
  const value = Number(str);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false, value: NaN };
}

/**
 * Convert a real-world coordinate value into linear calculation space.
 * @param {number} value
 * @param {'linear'|'log10'} scale
 * @returns {number}
 */
function toCalc(value, scale = 'linear') {
  if (!Number.isFinite(value)) return NaN;
  if (scale === 'log10') {
    return value > 0 ? Math.log10(value) : NaN;
  }
  return value;
}

/**
 * Convert a value from linear calculation space back into real-world coordinates.
 * @param {number} calcVal
 * @param {'linear'|'log10'} scale
 * @returns {number}
 */
function fromCalc(calcVal, scale = 'linear') {
  if (!Number.isFinite(calcVal)) return NaN;
  if (scale === 'log10') {
    if (calcVal > 308 || calcVal < -308) return NaN;
    return Math.pow(10, calcVal);
  }
  return calcVal;
}

function isValidPin(pin) {
  return (
    pin != null &&
    Number.isFinite(pin.px) &&
    Number.isFinite(pin.py) &&
    Number.isFinite(pin.value)
  );
}

/**
 * Compute calibration basis vectors, pixel origin, and diagnostics.
 * Supports orthogonal lock (no accidental tilt on screenshots) and full 4-point
 * skewed/rotated affine calibration (matching legacy main.py generalized to log10).
 *
 * @param {{
 *   mode?: 'orthogonal'|'skewed',
 *   xScale?: 'linear'|'log10',
 *   yScale?: 'linear'|'log10',
 *   pins: { x1?: any, x2?: any, y1?: any, y2?: any }
 * }} calib
 */
function computeCalibration(calib) {
  if (!calib || !calib.pins) {
    return { valid: false, error: 'Missing calibration pins.' };
  }

  const mode = calib.mode === 'skewed' ? 'skewed' : 'orthogonal';
  const xScale = calib.xScale === 'log10' ? 'log10' : 'linear';
  const yScale = calib.yScale === 'log10' ? 'log10' : 'linear';
  const { x1, x2, y1, y2 } = calib.pins;

  if (!isValidPin(x1) || !isValidPin(x2) || !isValidPin(y1) || !isValidPin(y2)) {
    return { valid: false, error: 'Place and assign values to all 4 calibration pins (X1, X2, Y1, Y2).' };
  }

  if (x1.value === x2.value) {
    return { valid: false, error: 'X1 and X2 must have different real-world values.' };
  }
  if (y1.value === y2.value) {
    return { valid: false, error: 'Y1 and Y2 must have different real-world values.' };
  }

  if (xScale === 'log10' && (x1.value <= 0 || x2.value <= 0)) {
    return { valid: false, error: 'Logarithmic X-axis requires strictly positive calibration values (> 0).' };
  }
  if (yScale === 'log10' && (y1.value <= 0 || y2.value <= 0)) {
    return { valid: false, error: 'Logarithmic Y-axis requires strictly positive calibration values (> 0).' };
  }

  const cX1 = toCalc(x1.value, xScale);
  const cX2 = toCalc(x2.value, xScale);
  const cY1 = toCalc(y1.value, yScale);
  const cY2 = toCalc(y2.value, yScale);

  const dCalcX = cX2 - cX1;
  const dCalcY = cY2 - cY1;
  if (!Number.isFinite(dCalcX) || Math.abs(dCalcX) < 1e-12 || !Number.isFinite(dCalcY) || Math.abs(dCalcY) < 1e-12) {
    return { valid: false, error: 'Calibration values are too close to resolve.' };
  }

  const px1 = x1.px;
  const py1 = x1.py;
  const px2 = x2.px;
  const py2 = x2.py;
  const px3 = y1.px;
  const py3 = y1.py;
  const px4 = y2.px;
  const py4 = y2.py;

  let originPx;
  let originCalc;
  let ux;
  let uy;

  if (mode === 'orthogonal') {
    if (Math.abs(px2 - px1) <= 1e-6) {
      return { valid: false, error: 'X1 and X2 must have distinct horizontal positions in Orthogonal mode.' };
    }
    if (Math.abs(py4 - py3) <= 1e-6) {
      return { valid: false, error: 'Y1 and Y2 must have distinct vertical positions in Orthogonal mode.' };
    }

    ux = [(px2 - px1) / dCalcX, 0];
    uy = [0, (py4 - py3) / dCalcY];
    originPx = [(px3 + px4) * 0.5, (py1 + py2) * 0.5];
    originCalc = [
      cX1 + (originPx[0] - px1) / ux[0],
      cY1 + (originPx[1] - py3) / uy[1],
    ];
  } else {
    const vecX = [px2 - px1, py2 - py1];
    const vecY = [px4 - px3, py4 - py3];
    const lenXSq = vecX[0] * vecX[0] + vecX[1] * vecX[1];
    const lenYSq = vecY[0] * vecY[0] + vecY[1] * vecY[1];

    if (lenXSq < 1e-8 || lenYSq < 1e-8) {
      return { valid: false, error: 'Calibration points on an axis cannot be at the exact same pixel.' };
    }

    const den = (px1 - px2) * (py3 - py4) - (py1 - py2) * (px3 - px4);
    if (Math.abs(den) < 1e-9) {
      return { valid: false, error: 'Axes are parallel; cannot compute intersection in Skewed mode.' };
    }

    const cross12 = px1 * py2 - py1 * px2;
    const cross34 = px3 * py4 - py3 * px4;
    const intX = (cross12 * (px3 - px4) - (px1 - px2) * cross34) / den;
    const intY = (cross12 * (py3 - py4) - (py1 - py2) * cross34) / den;

    originPx = [intX, intY];

    const vecIntX = [intX - px1, intY - py1];
    const tX = (vecIntX[0] * vecX[0] + vecIntX[1] * vecX[1]) / lenXSq;
    const valIntX = cX1 + tX * dCalcX;

    const vecIntY = [intX - px3, intY - py3];
    const tY = (vecIntY[0] * vecY[0] + vecIntY[1] * vecY[1]) / lenYSq;
    const valIntY = cY1 + tY * dCalcY;

    originCalc = [valIntX, valIntY];
    ux = [vecX[0] / dCalcX, vecX[1] / dCalcX];
    uy = [vecY[0] / dCalcY, vecY[1] / dCalcY];
  }

  const det = ux[0] * uy[1] - ux[1] * uy[0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return { valid: false, error: 'Degenerate calibration matrix (axes are nearly collinear).' };
  }

  const magX = Math.hypot(ux[0], ux[1]);
  const magY = Math.hypot(uy[0], uy[1]);
  const dotXY = ux[0] * uy[0] + ux[1] * uy[1];
  const cosAngle = Math.max(-1, Math.min(1, dotXY / (magX * magY)));
  const axesAngleDeg = (Math.acos(cosAngle) * 180) / Math.PI;
  const xTiltDeg = (Math.atan2(ux[1], ux[0]) * 180) / Math.PI;

  return {
    valid: true,
    mode,
    xScale,
    yScale,
    originPx,
    originCalc,
    ux,
    uy,
    det,
    xTiltDeg,
    axesAngleDeg,
  };
}

/**
 * Convert image pixel coordinates into calibrated real-world coordinates.
 * @param {ReturnType<typeof computeCalibration>} transform
 * @param {number} px
 * @param {number} py
 * @returns {{ x: number, y: number }}
 */
function pixelToReal(transform, px, py) {
  if (!transform || !transform.valid || !Number.isFinite(px) || !Number.isFinite(py)) {
    return { x: NaN, y: NaN };
  }

  const dpX = px - transform.originPx[0];
  const dpY = py - transform.originPx[1];

  const dcX = (dpX * transform.uy[1] - dpY * transform.uy[0]) / transform.det;
  const dcY = (-dpX * transform.ux[1] + dpY * transform.ux[0]) / transform.det;

  return {
    x: fromCalc(transform.originCalc[0] + dcX, transform.xScale),
    y: fromCalc(transform.originCalc[1] + dcY, transform.yScale),
  };
}

/**
 * Convert calibrated real-world coordinates into image pixel coordinates.
 * @param {ReturnType<typeof computeCalibration>} transform
 * @param {number} x
 * @param {number} y
 * @returns {{ px: number, py: number } | null}
 */
function realToPixel(transform, x, y) {
  if (!transform || !transform.valid) return null;

  const cX = toCalc(x, transform.xScale);
  const cY = toCalc(y, transform.yScale);
  if (!Number.isFinite(cX) || !Number.isFinite(cY)) return null;

  const dcX = cX - transform.originCalc[0];
  const dcY = cY - transform.originCalc[1];

  return {
    px: transform.originPx[0] + dcX * transform.ux[0] + dcY * transform.uy[0],
    py: transform.originPx[1] + dcX * transform.ux[1] + dcY * transform.uy[1],
  };
}

/**
 * Generate major and minor axis tick values for linear or log10 ranges.
 * @param {number} minVal
 * @param {number} maxVal
 * @param {'linear'|'log10'} scale
 * @param {number} targetCount
 * @returns {{ major: number[], minor: number[] }}
 */
function generateTicks(minVal, maxVal, scale = 'linear', targetCount = 6) {
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal === maxVal) {
    return { major: [], minor: [] };
  }

  const lo = Math.min(minVal, maxVal);
  const hi = Math.max(minVal, maxVal);

  if (scale === 'log10') {
    if (hi <= 0) return { major: [], minor: [] };
    const loPos = lo > 0 ? lo : hi * 1e-12;
    const minExp = Math.floor(Math.log10(loPos));
    const maxExp = Math.ceil(Math.log10(hi));
    const decadeSpan = maxExp - minExp;
    const expStep = decadeSpan > 12 ? Math.ceil(decadeSpan / Math.max(3, targetCount)) : 1;

    const major = [];
    const minor = [];
    const majorSet = new Set();

    for (let e = minExp; e <= maxExp; e += expStep) {
      const val = Math.pow(10, e);
      if (val >= loPos * (1 - 1e-9) && val <= hi * (1 + 1e-9)) {
        major.push(val);
        majorSet.add(e);
      }
    }

    if (decadeSpan <= 5) {
      for (let e = minExp - 1; e <= maxExp; e += 1) {
        const base = Math.pow(10, e);
        for (let m = 2; m <= 9; m += 1) {
          const val = m * base;
          if (val >= loPos * (1 - 1e-9) && val <= hi * (1 + 1e-9)) {
            minor.push(val);
          }
        }
      }
    }

    return { major, minor };
  }

  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return { major: [], minor: [] };

  const count = Math.max(2, targetCount);
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10;
  const step = niceNorm * mag;

  const startIdx = Math.ceil(lo / step - 1e-9);
  const endIdx = Math.floor(hi / step + 1e-9);
  const major = [];

  for (let i = startIdx; i <= endIdx; i += 1) {
    const raw = i * step;
    const cleaned = Math.abs(raw) < step * 1e-10 ? 0 : Number(raw.toPrecision(12));
    major.push(cleaned);
  }

  const subdivisions = niceNorm === 2 ? 4 : 5;
  const minorStep = step / subdivisions;
  const minor = [];
  const minorStart = Math.ceil(lo / minorStep - 1e-9);
  const minorEnd = Math.floor(hi / minorStep + 1e-9);

  for (let i = minorStart; i <= minorEnd; i += 1) {
    if (i % subdivisions === 0) continue;
    const raw = i * minorStep;
    const cleaned = Math.abs(raw) < step * 1e-10 ? 0 : Number(raw.toPrecision(12));
    minor.push(cleaned);
  }

  return { major, minor };
}

/**
 * Format a numeric tick label concisely.
 * @param {number} val
 * @param {'linear'|'log10'} scale
 * @returns {string}
 */
function formatTick(val, scale = 'linear') {
  if (!Number.isFinite(val)) return '';
  if (Math.abs(val) < 1e-12) return '0';

  const abs = Math.abs(val);
  if (scale === 'log10' && val > 0) {
    const exp = Math.log10(val);
    const roundedExp = Math.round(exp);
    if (Math.abs(exp - roundedExp) < 1e-6) {
      if (roundedExp >= -3 && roundedExp <= 3) {
        return String(Number(val.toPrecision(6)));
      }
      return `1e${roundedExp}`;
    }
  }

  if (abs >= 1e5 || abs < 1e-3) {
    return val.toExponential(2).replace(/(\.\d*?[1-9])0+e/, '$1e').replace(/\.0+e/, 'e');
  }
  return String(Number(val.toPrecision(5)));
}

/**
 * Return a shallow-copied array sorted by x ascending if sortByX is true.
 * @template {{ x: number }} T
 * @param {T[]} points
 * @param {boolean} sortByX
 * @returns {T[]}
 */
function sortPoints(points, sortByX = true) {
  if (!Array.isArray(points)) return [];
  const copy = points.slice();
  if (sortByX) {
    copy.sort((a, b) => a.x - b.x);
  }
  return copy;
}

/**
 * Centered moving average with adaptive symmetric boundary shrinking.
 * @param {number[]} ys
 * @param {number} windowSize
 * @returns {number[]}
 */
function movingAverage(ys, windowSize = 5) {
  if (!Array.isArray(ys)) return [];
  const n = ys.length;
  if (n < 3) return ys.slice();

  let w = Math.max(3, Math.floor(windowSize) | 1);
  if (w > n) {
    w = n % 2 === 0 ? n - 1 : n;
  }
  if (w < 3) return ys.slice();

  const half = Math.floor(w / 2);
  const out = new Array(n);

  for (let i = 0; i < n; i += 1) {
    const radius = Math.min(half, i, n - 1 - i);
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) {
      sum += ys[i + k];
    }
    out[i] = sum / (2 * radius + 1);
  }
  return out;
}

/**
 * Degree-2/3 Savitzky-Golay smoothing filter with antisymmetric endpoint reflection.
 * Preserves constant, linear, and quadratic signals in the interior without peak flattening.
 * @param {number[]} ys
 * @param {number} windowSize
 * @returns {number[]}
 */
function savitzkyGolay(ys, windowSize = 7) {
  if (!Array.isArray(ys)) return [];
  const n = ys.length;
  if (n < 5) return ys.slice();

  const desiredHalf = Math.max(2, Math.floor((Math.max(5, Math.floor(windowSize)) - 1) / 2));
  const m = Math.min(desiredHalf, n - 1);
  if (m < 2) return ys.slice();

  const denom = (2 * m - 1) * (2 * m + 1) * (2 * m + 3);
  const c0 = 3 * m * m + 3 * m - 1;
  const weights = new Array(2 * m + 1);
  for (let k = -m; k <= m; k += 1) {
    weights[k + m] = (3 * (c0 - 5 * k * k)) / denom;
  }

  const getSample = (idx) => {
    if (idx < 0) return 2 * ys[0] - ys[-idx];
    if (idx >= n) return 2 * ys[n - 1] - ys[2 * (n - 1) - idx];
    return ys[idx];
  };

  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    let acc = 0;
    for (let k = -m; k <= m; k += 1) {
      acc += weights[k + m] * getSample(i + k);
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Apply configured smoothing to real-world points without mutating input objects.
 * @param {Array<{ x: number, y: number }>} realPoints
 * @param {{ method?: 'none'|'moving_avg'|'savitzky_golay', windowSize?: number }} options
 */
function applySmoothing(realPoints, options = {}) {
  if (!Array.isArray(realPoints) || realPoints.length === 0) return [];
  const method = options.method || 'none';
  const windowSize = options.windowSize ?? 7;
  const ys = realPoints.map((pt) => pt.y);

  let smoothed;
  if (method === 'moving_avg') {
    smoothed = movingAverage(ys, windowSize);
  } else if (method === 'savitzky_golay') {
    smoothed = savitzkyGolay(ys, windowSize);
  } else {
    smoothed = ys;
  }

  return realPoints.map((pt, idx) => ({
    ...pt,
    yRaw: pt.y,
    ySmooth: smoothed[idx],
  }));
}

/**
 * Compute scientific statistics and trapezoidal integral for processed points.
 * @param {Array<{ x: number, y?: number, yRaw?: number, ySmooth?: number }>} processedPoints
 * @param {boolean} useSmoothed
 */
function computeStats(processedPoints, useSmoothed = false) {
  const valid = (processedPoints || [])
    .map((pt) => {
      const yVal = useSmoothed && Number.isFinite(pt.ySmooth)
        ? pt.ySmooth
        : Number.isFinite(pt.yRaw)
          ? pt.yRaw
          : pt.y;
      return { x: pt.x, y: yVal };
    })
    .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));

  if (valid.length === 0) {
    return {
      count: 0,
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
      peakX: null,
      peakY: null,
      meanY: null,
      area: null,
    };
  }

  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let peakX = valid[0].x;
  let peakY = valid[0].y;
  let sumY = 0;

  for (const pt of valid) {
    if (pt.x < xMin) xMin = pt.x;
    if (pt.x > xMax) xMax = pt.x;
    if (pt.y < yMin) yMin = pt.y;
    if (pt.y > yMax) {
      yMax = pt.y;
      peakX = pt.x;
      peakY = pt.y;
    }
    sumY += pt.y;
  }

  const sorted = valid.slice().sort((a, b) => a.x - b.x);
  let area = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const dx = sorted[i + 1].x - sorted[i].x;
    area += 0.5 * (sorted[i].y + sorted[i + 1].y) * dx;
  }

  return {
    count: valid.length,
    xMin,
    xMax,
    yMin,
    yMax,
    peakX,
    peakY,
    meanY: sumY / valid.length,
    area,
  };
}

GR.math = {
  parseNumericInput,
  toCalc,
  fromCalc,
  computeCalibration,
  pixelToReal,
  realToPixel,
  generateTicks,
  formatTick,
  sortPoints,
  movingAverage,
  savitzkyGolay,
  applySmoothing,
  computeStats,
};
})(globalThis.GraphRev = globalThis.GraphRev || {});
