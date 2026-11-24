(function (GR) {
  'use strict';

/**
 * Export engine supporting TSV (.txt matching legacy main.py), CSV, JSON,
 * Python/NumPy, and MATLAB snippets, plus file download and clipboard helpers.
 */

function formatExportNumber(val, precision = 6) {
  if (!Number.isFinite(val)) return 'NaN';
  if (val === 0) return (0).toFixed(precision);

  const abs = Math.abs(val);
  const fixedThreshold = Math.pow(10, -Math.min(precision, 4));
  if (abs < fixedThreshold || abs >= 1e9) {
    return val.toExponential(precision);
  }
  const formatted = val.toFixed(precision);
  return formatted === `-0.${'0'.repeat(precision)}` || formatted === '-0'
    ? (0).toFixed(precision)
    : formatted;
}

function escapeCsvCell(text) {
  const s = String(text ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sanitizeIdentifier(name, fallback = 'series') {
  const clean = String(name || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!clean) return fallback;
  return /^\d/.test(clean) ? `s_${clean}` : clean;
}

/**
 * Generate serialized export output for one or all visible series.
 *
 * @param {{
 *   seriesEntries: Array<{ series: any, points: Array<{ x: number, yRaw: number, ySmooth: number }> }>,
 *   calibration: any,
 *   transform: any,
 *   processing: { sortByX: boolean, smoothMethod: string, smoothWindow: number },
 *   options: { scope: 'active'|'all', format: 'tsv'|'csv'|'json'|'python'|'matlab', precision: number, includeHeader: boolean, includeSmoothed: boolean },
 *   imageName?: string
 * }} params
 * @returns {{ content: string, filename: string, mimeType: string }}
 */
function buildExportOutput(params) {
  const {
    seriesEntries,
    calibration,
    transform,
    processing,
    options,
    imageName = 'graph',
  } = params;

  const format = options.format || 'tsv';
  const precision = Math.max(1, Math.min(12, Number(options.precision ?? 6)));
  const includeHeader = options.includeHeader !== false;
  const hasSmoothing = processing?.smoothMethod && processing.smoothMethod !== 'none';
  const includeSmoothed = Boolean(options.includeSmoothed && hasSmoothing);
  const multiSeries = seriesEntries.length > 1;
  const baseName = sanitizeIdentifier(imageName.replace(/\.[^.]+$/, ''), 'digitized_data');

  if (format === 'tsv' || format === 'csv') {
    const sep = format === 'tsv' ? '\t' : ',';
    const lines = [];

    if (includeHeader) {
      const cols = [];
      if (multiSeries) cols.push('series');
      cols.push('x', 'y');
      if (includeSmoothed) cols.push('y_smoothed');
      lines.push(cols.join(sep));
    }

    for (const entry of seriesEntries) {
      const sName = format === 'csv' ? escapeCsvCell(entry.series.name) : entry.series.name;
      for (const pt of entry.points) {
        const row = [];
        if (multiSeries) row.push(sName);
        row.push(formatExportNumber(pt.x, precision));
        row.push(formatExportNumber(pt.yRaw, precision));
        if (includeSmoothed) {
          row.push(formatExportNumber(pt.ySmooth, precision));
        }
        lines.push(row.join(sep));
      }
    }

    return {
      content: lines.join('\n'),
      filename: format === 'tsv' ? `${baseName}_digitized.txt` : `${baseName}_digitized.csv`,
      mimeType: format === 'tsv' ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8',
    };
  }

  if (format === 'json') {
    const payload = {
      sourceImage: imageName,
      exportedAt: new Date().toISOString(),
      calibration: {
        mode: calibration.mode,
        xScale: calibration.xScale,
        yScale: calibration.yScale,
        valid: Boolean(transform?.valid),
      },
      processing: { ...processing },
      series: seriesEntries.map((entry) => ({
        name: entry.series.name,
        color: entry.series.color,
        points: entry.points.map((pt) => {
          const item = {
            x: Number(formatExportNumber(pt.x, precision)),
            y: Number(formatExportNumber(pt.yRaw, precision)),
          };
          if (includeSmoothed) {
            item.ySmoothed = Number(formatExportNumber(pt.ySmooth, precision));
          }
          return item;
        }),
      })),
    };
    return {
      content: JSON.stringify(payload, null, 2),
      filename: `${baseName}_digitized.json`,
      mimeType: 'application/json;charset=utf-8',
    };
  }

  if (format === 'python') {
    const chunks = ['import numpy as np', 'import matplotlib.pyplot as plt', ''];
    const plotCommands = [];

    for (let i = 0; i < seriesEntries.length; i += 1) {
      const entry = seriesEntries[i];
      const varName = sanitizeIdentifier(entry.series.name, `series_${i + 1}`);
      const xs = entry.points.map((p) => formatExportNumber(p.x, precision)).join(', ');
      const ys = entry.points.map((p) => formatExportNumber(p.yRaw, precision)).join(', ');

      chunks.push(`# ${entry.series.name} (${entry.points.length} points)`);
      chunks.push(`${varName}_x = np.array([${xs}])`);
      chunks.push(`${varName}_y = np.array([${ys}])`);
      if (includeSmoothed) {
        const ysm = entry.points.map((p) => formatExportNumber(p.ySmooth, precision)).join(', ');
        chunks.push(`${varName}_y_smooth = np.array([${ysm}])`);
        plotCommands.push(
          `plt.plot(${varName}_x, ${varName}_y_smooth, label=${JSON.stringify(`${entry.series.name} (smoothed)`)})`
        );
      } else {
        plotCommands.push(
          `plt.plot(${varName}_x, ${varName}_y, marker="o", markersize=3, label=${JSON.stringify(entry.series.name)})`
        );
      }
      chunks.push('');
    }

    chunks.push('plt.figure(figsize=(8, 5))');
    chunks.push(...plotCommands);
    if (calibration.xScale === 'log10') chunks.push('plt.xscale("log")');
    if (calibration.yScale === 'log10') chunks.push('plt.yscale("log")');
    chunks.push('plt.grid(True, alpha=0.3)');
    chunks.push('plt.legend()');
    chunks.push('plt.tight_layout()');
    chunks.push('plt.show()');

    return {
      content: chunks.join('\n'),
      filename: `${baseName}_plot.py`,
      mimeType: 'text/x-python;charset=utf-8',
    };
  }

  // MATLAB (.m)
  const mLines = ['% Digitized curve data from GraphRev', 'figure; hold on; grid on;'];
  const legends = [];
  for (let i = 0; i < seriesEntries.length; i += 1) {
    const entry = seriesEntries[i];
    const varName = sanitizeIdentifier(entry.series.name, `series_${i + 1}`);
    const xs = entry.points.map((p) => formatExportNumber(p.x, precision)).join('; ');
    const ys = entry.points.map((p) => formatExportNumber(p.yRaw, precision)).join('; ');
    mLines.push(`${varName}_x = [${xs}];`);
    mLines.push(`${varName}_y = [${ys}];`);
    if (includeSmoothed) {
      const ysm = entry.points.map((p) => formatExportNumber(p.ySmooth, precision)).join('; ');
      mLines.push(`${varName}_y_smooth = [${ysm}];`);
      mLines.push(`plot(${varName}_x, ${varName}_y_smooth, 'LineWidth', 1.6);`);
    } else {
      mLines.push(`plot(${varName}_x, ${varName}_y, '-o', 'MarkerSize', 4);`);
    }
    legends.push(`'${entry.series.name.replace(/'/g, "''")}'`);
    mLines.push('');
  }
  if (calibration.xScale === 'log10') mLines.push("set(gca, 'XScale', 'log');");
  if (calibration.yScale === 'log10') mLines.push("set(gca, 'YScale', 'log');");
  if (legends.length > 0) mLines.push(`legend(${legends.join(', ')});`);

  return {
    content: mLines.join('\n'),
    filename: `${baseName}_plot.m`,
    mimeType: 'text/plain;charset=utf-8',
  };
}

function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

GR.export = {
  formatExportNumber,
  buildExportOutput,
  downloadTextFile,
  copyToClipboard,
};
})(globalThis.GraphRev = globalThis.GraphRev || {});
