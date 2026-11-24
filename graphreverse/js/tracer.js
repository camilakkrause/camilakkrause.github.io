(function (GR) {
  'use strict';

/**
 * Color-based automatic curve tracing, eyedropper sampling, and click snapping.
 * Works purely against { width, height, data } ImageData buffers.
 */

/**
 * Perceptual weighted Redmean RGB color distance normalized to [0, 255].
 * @param {number} r1
 * @param {number} g1
 * @param {number} b1
 * @param {number} r2
 * @param {number} g2
 * @param {number} b2
 * @returns {number}
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
  const rMean = (r1 + r2) * 0.5;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const raw = Math.sqrt(
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db
  );
  return raw / 3;
}

/**
 * Convert RGB channels (0..255) to a lowercase hex color string.
 */
function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Parse a #rrggbb hex string into { r, g, b }.
 */
function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { r: 29, g: 78, b: 216 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function medianOf(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) * 0.5);
}

/**
 * Sample a pixel color from ImageData.
 * When radius === 0, returns the exact rounded pixel; otherwise uses neighborhood median.
 *
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @param {number} px
 * @param {number} py
 * @param {number} radius
 */
function sampleColorAt(imageData, px, py, radius = 1) {
  if (!imageData || !imageData.data || imageData.width <= 0 || imageData.height <= 0) {
    return { r: 0, g: 0, b: 0, hex: '#000000' };
  }

  const cx = Math.max(0, Math.min(imageData.width - 1, Math.round(px)));
  const cy = Math.max(0, Math.min(imageData.height - 1, Math.round(py)));
  const rInt = Math.max(0, Math.floor(radius));

  if (rInt === 0) {
    const idx = (cy * imageData.width + cx) * 4;
    const r = imageData.data[idx];
    const g = imageData.data[idx + 1];
    const b = imageData.data[idx + 2];
    return { r, g, b, hex: rgbToHex(r, g, b) };
  }

  const rs = [];
  const gs = [];
  const bs = [];
  const xMin = Math.max(0, cx - rInt);
  const xMax = Math.min(imageData.width - 1, cx + rInt);
  const yMin = Math.max(0, cy - rInt);
  const yMax = Math.min(imageData.height - 1, cy + rInt);

  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      const idx = (y * imageData.width + x) * 4;
      if (imageData.data[idx + 3] < 16) continue;
      rs.push(imageData.data[idx]);
      gs.push(imageData.data[idx + 1]);
      bs.push(imageData.data[idx + 2]);
    }
  }

  if (rs.length === 0) {
    return { r: 0, g: 0, b: 0, hex: '#000000' };
  }

  const r = medianOf(rs);
  const g = medianOf(gs);
  const b = medianOf(bs);
  return { r, g, b, hex: rgbToHex(r, g, b) };
}

/**
 * Snap a manually clicked pixel to the nearest contiguous matching color cluster.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @param {number} px
 * @param {number} py
 * @param {{ r: number, g: number, b: number }} targetRgb
 * @param {number} tolerance
 * @param {number} searchRadius
 */
function snapPixelToColor(imageData, px, py, targetRgb, tolerance = 42, searchRadius = 10) {
  if (!imageData || !targetRgb) return { px, py, snapped: false };

  const { width, height, data } = imageData;
  const cx = Math.round(px);
  const cy = Math.round(py);
  const rad = Math.max(1, Math.round(searchRadius));
  const radSq = rad * rad;

  const xMin = Math.max(0, cx - rad);
  const xMax = Math.min(width - 1, cx + rad);
  const yMin = Math.max(0, cy - rad);
  const yMax = Math.min(height - 1, cy + rad);

  let bestX = -1;
  let bestY = -1;
  let bestDistSq = Infinity;

  for (let y = yMin; y <= yMax; y += 1) {
    const dy = y - cy;
    for (let x = xMin; x <= xMax; x += 1) {
      const dx = x - cx;
      const distSq = dx * dx + dy * dy;
      if (distSq > radSq) continue;

      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 16) continue;
      const cDist = colorDistance(data[idx], data[idx + 1], data[idx + 2], targetRgb.r, targetRgb.g, targetRgb.b);
      if (cDist <= tolerance && distSq < bestDistSq) {
        bestDistSq = distSq;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (bestX < 0) return { px, py, snapped: false };

  // Flood-fill tight contiguous neighborhood around (bestX, bestY) for stroke sub-pixel center
  const localClusterRad = 2.5;
  const localClusterRadSq = localClusterRad * localClusterRad;
  const cXMin = Math.max(xMin, bestX - 3);
  const cXMax = Math.min(xMax, bestX + 3);
  const cYMin = Math.max(yMin, bestY - 3);
  const cYMax = Math.min(yMax, bestY + 3);
  const localW = cXMax - cXMin + 1;
  const localH = cYMax - cYMin + 1;
  const visited = new Uint8Array(localW * localH);
  const queue = [[bestX, bestY]];
  visited[(bestY - cYMin) * localW + (bestX - cXMin)] = 1;

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;

  while (queue.length > 0) {
    const [qx, qy] = queue.pop();
    const idx = (qy * width + qx) * 4;
    const cDist = colorDistance(data[idx], data[idx + 1], data[idx + 2], targetRgb.r, targetRgb.g, targetRgb.b);
    const weight = Math.max(0.05, 1 - cDist / (tolerance + 1));

    sumW += weight;
    sumX += qx * weight;
    sumY += qy * weight;

    for (let ny = Math.max(cYMin, qy - 1); ny <= Math.min(cYMax, qy + 1); ny += 1) {
      for (let nx = Math.max(cXMin, qx - 1); nx <= Math.min(cXMax, qx + 1); nx += 1) {
        const vIdx = (ny - cYMin) * localW + (nx - cXMin);
        if (visited[vIdx]) continue;
        const dx = nx - bestX;
        const dy = ny - bestY;
        if (dx * dx + dy * dy > localClusterRadSq) continue;

        const pIdx = (ny * width + nx) * 4;
        if (data[pIdx + 3] < 16) continue;
        const nDist = colorDistance(data[pIdx], data[pIdx + 1], data[pIdx + 2], targetRgb.r, targetRgb.g, targetRgb.b);
        if (nDist <= tolerance) {
          visited[vIdx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }

  if (sumW <= 0) return { px, py, snapped: false };
  return {
    px: sumX / sumW,
    py: sumY / sumW,
    snapped: true,
  };
}

/**
 * Trace a curve automatically across X columns using color similarity.
 *
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @param {{
 *   targetRgb: { r: number, g: number, b: number },
 *   tolerance?: number,
 *   stepPx?: number,
 *   mode?: 'tracked'|'centroid'|'top'|'bottom',
 *   roi?: { x: number, y: number, w: number, h: number } | null,
 *   minRunPx?: number,
 *   maxJumpPx?: number
 * }} options
 * @returns {Array<{ px: number, py: number }>}
 */
function traceCurve(imageData, options) {
  if (!imageData || !imageData.data || !options || !options.targetRgb) {
    return [];
  }

  const { width, height, data } = imageData;
  const targetRgb = options.targetRgb;
  const tolerance = options.tolerance ?? 42;
  const stepPx = Math.max(1, Math.round(options.stepPx ?? 6));
  const mode = options.mode || 'tracked';
  const minRunPx = Math.max(1, Math.round(options.minRunPx ?? 1));
  const maxJumpPx = Math.max(4, options.maxJumpPx ?? 45);

  const roi = options.roi;
  const xStart = roi ? Math.max(0, Math.floor(Math.min(roi.x, roi.x + roi.w))) : 0;
  const xEnd = roi ? Math.min(width - 1, Math.floor(Math.max(roi.x, roi.x + roi.w))) : width - 1;
  const yStart = roi ? Math.max(0, Math.floor(Math.min(roi.y, roi.y + roi.h))) : 0;
  const yEnd = roi ? Math.min(height - 1, Math.floor(Math.max(roi.y, roi.y + roi.h))) : height - 1;

  if (xEnd < xStart || yEnd < yStart) return [];

  if (mode !== 'tracked') {
    const points = [];
    for (let x = xStart; x <= xEnd; x += stepPx) {
      let sumW = 0;
      let sumY = 0;
      let topY = Infinity;
      let bottomY = -Infinity;
      let runLen = 0;

      for (let y = yStart; y <= yEnd; y += 1) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        const dist = alpha >= 16
          ? colorDistance(data[idx], data[idx + 1], data[idx + 2], targetRgb.r, targetRgb.g, targetRgb.b)
          : Infinity;

        if (dist <= tolerance) {
          runLen += 1;
          const weight = Math.max(0.05, 1 - dist / (tolerance + 1));
          sumW += weight;
          sumY += y * weight;
          if (y < topY) topY = y;
          if (y > bottomY) bottomY = y;
        }
      }

      if (runLen >= minRunPx && sumW > 0) {
        let py;
        if (mode === 'top') py = topY;
        else if (mode === 'bottom') py = bottomY;
        else py = sumY / sumW;
        points.push({ px: x, py });
      }
    }
    return points;
  }

  // Tracked mode: collect vertical runs per sampled column, then track continuity
  const columns = [];
  for (let x = xStart; x <= xEnd; x += stepPx) {
    const runs = [];
    let inRun = false;
    let yTop = 0;
    let length = 0;
    let sumW = 0;
    let sumY = 0;

    const flushRun = (yBot) => {
      if (inRun && length >= minRunPx && sumW > 0) {
        runs.push({
          yTop,
          yBottom: yBot,
          length,
          yCenter: sumY / sumW,
          score: sumW,
        });
      }
      inRun = false;
      length = 0;
      sumW = 0;
      sumY = 0;
    };

    for (let y = yStart; y <= yEnd; y += 1) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      const dist = alpha >= 16
        ? colorDistance(data[idx], data[idx + 1], data[idx + 2], targetRgb.r, targetRgb.g, targetRgb.b)
        : Infinity;

      if (dist <= tolerance) {
        const weight = Math.max(0.05, 1 - dist / (tolerance + 1));
        if (!inRun) {
          inRun = true;
          yTop = y;
        }
        length += 1;
        sumW += weight;
        sumY += y * weight;
      } else if (inRun) {
        flushRun(y - 1);
      }
    }
    flushRun(yEnd);

    columns.push({ x, runs });
  }

  if (columns.length === 0) return [];

  // Choose an anchor column & run with strong neighbor continuity (rejects isolated legend dots)
  let anchorCol = -1;
  let anchorRun = null;
  let bestSupport = -1;

  for (let c = 0; c < columns.length; c += 1) {
    const { runs } = columns[c];
    if (runs.length === 0) continue;

    for (const run of runs) {
      let support = runs.length === 1 ? 2 : 0;
      // Check continuity across the next few columns
      let refY = run.yCenter;
      const lookahead = Math.min(columns.length - 1, c + 6);
      for (let k = c + 1; k <= lookahead; k += 1) {
        let matched = null;
        let minDy = Infinity;
        for (const nr of columns[k].runs) {
          const dy = Math.abs(nr.yCenter - refY);
          if (dy <= maxJumpPx && dy < minDy) {
            minDy = dy;
            matched = nr;
          }
        }
        if (matched) {
          support += 2;
          refY = matched.yCenter;
        }
      }
      // Slight preference for earlier anchor and stronger run if tied
      const totalScore = support + Math.min(1, run.score / 10) * 0.25;
      if (totalScore > bestSupport) {
        bestSupport = totalScore;
        anchorCol = c;
        anchorRun = run;
      }
    }

    if (bestSupport >= 8) break;
  }

  if (anchorCol < 0 || !anchorRun) return [];

  const chosen = new Array(columns.length).fill(null);
  chosen[anchorCol] = anchorRun.yCenter;

  // Track forward from anchorCol
  let lastY = anchorRun.yCenter;
  let missedCols = 0;
  for (let c = anchorCol + 1; c < columns.length; c += 1) {
    const runs = columns[c].runs;
    const allowedJump = maxJumpPx * (1 + missedCols * 0.6);
    let bestRun = null;
    let bestDist = Infinity;

    for (const run of runs) {
      const dy = Math.abs(run.yCenter - lastY);
      if (dy <= allowedJump && dy < bestDist) {
        bestDist = dy;
        bestRun = run;
      }
    }

    if (bestRun) {
      chosen[c] = bestRun.yCenter;
      lastY = bestRun.yCenter;
      missedCols = 0;
    } else {
      missedCols += 1;
    }
  }

  // Track backward from anchorCol to recover early points
  lastY = anchorRun.yCenter;
  missedCols = 0;
  for (let c = anchorCol - 1; c >= 0; c -= 1) {
    const runs = columns[c].runs;
    const allowedJump = maxJumpPx * (1 + missedCols * 0.6);
    let bestRun = null;
    let bestDist = Infinity;

    for (const run of runs) {
      const dy = Math.abs(run.yCenter - lastY);
      if (dy <= allowedJump && dy < bestDist) {
        bestDist = dy;
        bestRun = run;
      }
    }

    if (bestRun) {
      chosen[c] = bestRun.yCenter;
      lastY = bestRun.yCenter;
      missedCols = 0;
    } else {
      missedCols += 1;
    }
  }

  const result = [];
  for (let c = 0; c < columns.length; c += 1) {
    if (chosen[c] !== null) {
      result.push({ px: columns[c].x, py: chosen[c] });
    }
  }
  return result;
}

GR.tracer = {
  colorDistance,
  rgbToHex,
  hexToRgb,
  sampleColorAt,
  snapPixelToColor,
  traceCurve,
};
})(globalThis.GraphRev = globalThis.GraphRev || {});
