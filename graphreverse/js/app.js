(function (GR) {
  'use strict';

const {
  parseNumericInput,
  computeStats,
  formatTick,
} = GR.math;
const { traceCurve, hexToRgb } = GR.tracer;
const { store, nextId } = GR.state;
const { generateDemoGraph } = GR.demo;
const { GraphCanvas } = GR.canvas;
const { PreviewChart } = GR.chart;
const { buildExportOutput, downloadTextFile, copyToClipboard, formatExportNumber } = GR.export;

const $ = (id) => document.getElementById(id);

const els = {
  html: document.documentElement,
  btnOpenImage: $('btnOpenImage'),
  fileImageInput: $('fileImageInput'),
  btnDemoSpec: $('btnDemoSpec'),
  btnDemoBode: $('btnDemoBode'),
  btnSaveProject: $('btnSaveProject'),
  btnLoadProject: $('btnLoadProject'),
  fileProjectInput: $('fileProjectInput'),
  btnUndo: $('btnUndo'),
  btnRedo: $('btnRedo'),
  btnZoomOut: $('btnZoomOut'),
  btnZoomIn: $('btnZoomIn'),
  zoomReadout: $('zoomReadout'),
  btnFitView: $('btnFitView'),
  calibStatusPill: $('calibStatusPill'),
  btnThemeToggle: $('btnThemeToggle'),
  btnHelp: $('btnHelp'),

  toolButtons: Array.from(document.querySelectorAll('.tool-btn[data-tool]')),
  btnToggleGrid: $('btnToggleGrid'),
  btnToggleLoupe: $('btnToggleLoupe'),
  btnToggleConnect: $('btnToggleConnect'),

  canvasStage: $('canvasStage'),
  mainCanvas: $('mainCanvas'),
  emptyState: $('emptyState'),
  btnEmptyUpload: $('btnEmptyUpload'),
  btnEmptyDemoSpec: $('btnEmptyDemoSpec'),
  btnEmptyDemoBode: $('btnEmptyDemoBode'),
  dropOverlay: $('dropOverlay'),

  loupeCard: $('loupeCard'),
  loupeCanvas: $('loupeCanvas'),
  loupeZoomBadge: $('loupeZoomBadge'),
  loupeColorChip: $('loupeColorChip'),
  loupePixelText: $('loupePixelText'),

  calibPopover: $('calibPopover'),
  calibPopoverTitle: $('calibPopoverTitle'),
  calibPopoverInput: $('calibPopoverInput'),
  calibPopoverConfirm: $('calibPopoverConfirm'),
  calibPopoverCancel: $('calibPopoverCancel'),
  calibPopoverError: $('calibPopoverError'),

  hudToolHint: $('hudToolHint'),
  hudPixel: $('hudPixel'),
  hudReal: $('hudReal'),
  btnAutoCalibDemo: $('btnAutoCalibDemo'),

  bottomDrawer: $('bottomDrawer'),
  drawerTabChart: $('drawerTabChart'),
  drawerTabTable: $('drawerTabTable'),
  tableCountBadge: $('tableCountBadge'),
  drawerSeriesLabel: $('drawerSeriesLabel'),
  btnToggleDrawer: $('btnToggleDrawer'),
  drawerChartPane: $('drawerChartPane'),
  drawerTablePane: $('drawerTablePane'),
  previewChartCanvas: $('previewChartCanvas'),
  thYSmooth: $('thYSmooth'),
  dataTableBody: $('dataTableBody'),

  inspTabs: Array.from(document.querySelectorAll('.insp-tab')),
  inspPanes: {
    calibrate: $('paneCalibrate'),
    trace: $('paneTrace'),
    process: $('paneProcess'),
    export: $('paneExport'),
  },

  btnClearPins: $('btnClearPins'),
  btnAutoCalibDemoPanel: $('btnAutoCalibDemoPanel'),
  calibModeSelect: $('calibModeSelect'),
  xScaleSelect: $('xScaleSelect'),
  yScaleSelect: $('yScaleSelect'),
  calibDiagnostics: $('calibDiagnostics'),

  btnAddSeries: $('btnAddSeries'),
  seriesList: $('seriesList'),
  chkSnapToColor: $('chkSnapToColor'),
  snapRadiusSlider: $('snapRadiusSlider'),
  snapRadiusVal: $('snapRadiusVal'),
  btnPickColorTool: $('btnPickColorTool'),
  tracerColorInput: $('tracerColorInput'),
  tracerColorHex: $('tracerColorHex'),
  tracerTolerance: $('tracerTolerance'),
  tracerToleranceVal: $('tracerToleranceVal'),
  tracerStep: $('tracerStep'),
  tracerStepVal: $('tracerStepVal'),
  tracerMode: $('tracerMode'),
  roiStatusText: $('roiStatusText'),
  btnDrawRoi: $('btnDrawRoi'),
  btnClearRoi: $('btnClearRoi'),
  btnPreviewTrace: $('btnPreviewTrace'),
  btnClearTracePreview: $('btnClearTracePreview'),
  btnApplyReplace: $('btnApplyReplace'),
  btnApplyAppend: $('btnApplyAppend'),

  chkSortByX: $('chkSortByX'),
  smoothMethod: $('smoothMethod'),
  smoothWindow: $('smoothWindow'),
  smoothWindowRow: $('smoothWindowRow'),
  statCount: $('statCount'),
  statArea: $('statArea'),
  statXRange: $('statXRange'),
  statYRange: $('statYRange'),
  statPeakX: $('statPeakX'),
  statPeakY: $('statPeakY'),

  btnResetView: $('btnResetView'),
  viewBrightness: $('viewBrightness'),
  viewBrightnessVal: $('viewBrightnessVal'),
  viewContrast: $('viewContrast'),
  viewContrastVal: $('viewContrastVal'),
  viewOpacity: $('viewOpacity'),
  viewOpacityVal: $('viewOpacityVal'),
  loupeZoomSlider: $('loupeZoomSlider'),
  loupeZoomVal: $('loupeZoomVal'),
  chkInvertImage: $('chkInvertImage'),

  exportScope: $('exportScope'),
  exportFormat: $('exportFormat'),
  exportPrecision: $('exportPrecision'),
  exportPrecisionVal: $('exportPrecisionVal'),
  chkExportHeader: $('chkExportHeader'),
  chkExportSmoothed: $('chkExportSmoothed'),
  exportMetaCount: $('exportMetaCount'),
  exportPreview: $('exportPreview'),
  btnCopyExport: $('btnCopyExport'),
  btnDownloadExport: $('btnDownloadExport'),
  btnResetSession: $('btnResetSession'),

  helpModal: $('helpModal'),
  btnCloseHelp: $('btnCloseHelp'),
  toastContainer: $('toastContainer'),
};

let popoverPinKey = null;
let dragDepth = 0;

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

function isEditableElement(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

const graphCanvas = new GraphCanvas({
  stageEl: els.canvasStage,
  canvasEl: els.mainCanvas,
  loupeEl: els.loupeCard,
  loupeCanvasEl: els.loupeCanvas,
  loupeZoomBadge: els.loupeZoomBadge,
  loupeColorChip: els.loupeColorChip,
  loupePixelText: els.loupePixelText,
  onPinPlaced: (pinKey, sx, sy) => openCalibPopover(pinKey, sx, sy),
  onCursorMove: (info) => updateHudCursor(info),
  onZoomChange: (scale) => {
    els.zoomReadout.textContent = `${Math.round(scale * 100)}%`;
  },
});

const previewChart = new PreviewChart(els.previewChartCanvas, els.drawerChartPane);

function updateHudCursor(info) {
  if (!info.inside) {
    els.hudPixel.textContent = 'px: —, —';
    els.hudReal.textContent = 'X: —   Y: —';
    return;
  }
  els.hudPixel.textContent = `px: ${info.px.toFixed(1)}, ${info.py.toFixed(1)}`;
  const transform = store.getCalibrationTransform();
  if (transform.valid && Number.isFinite(info.real.x) && Number.isFinite(info.real.y)) {
    const fx = formatTick(info.real.x, transform.xScale);
    const fy = formatTick(info.real.y, transform.yScale);
    els.hudReal.textContent = `X: ${fx}   Y: ${fy}`;
  } else {
    els.hudReal.textContent = 'X: —   Y: —';
  }
}

function openCalibPopover(pinKey, sx, sy) {
  popoverPinKey = pinKey;
  const pin = store.state.calibration.pins[pinKey];
  const titles = {
    x1: 'Set X1 Real Value (Blue)',
    x2: 'Set X2 Real Value (Blue)',
    y1: 'Set Y1 Real Value (Emerald)',
    y2: 'Set Y2 Real Value (Emerald)',
  };

  els.calibPopoverTitle.textContent = titles[pinKey] || `Set ${pinKey.toUpperCase()} Value`;
  els.calibPopoverInput.value = pin && Number.isFinite(pin.value) ? String(pin.value) : '';
  els.calibPopoverError.classList.add('hidden');
  els.calibPopoverError.textContent = '';

  const stageRect = els.canvasStage.getBoundingClientRect();
  const popW = 248;
  const popH = 104;
  const left = Math.max(10, Math.min(stageRect.width - popW - 10, sx + 14));
  const top = Math.max(10, Math.min(stageRect.height - popH - 10, sy + 14));

  els.calibPopover.style.left = `${left}px`;
  els.calibPopover.style.top = `${top}px`;
  els.calibPopover.classList.remove('hidden');

  requestAnimationFrame(() => {
    els.calibPopoverInput.focus();
    els.calibPopoverInput.select();
  });
}

function closeCalibPopover() {
  popoverPinKey = null;
  els.calibPopover.classList.add('hidden');
}

function commitCalibPopover() {
  if (!popoverPinKey) return;
  const parsed = parseNumericInput(els.calibPopoverInput.value);
  if (!parsed.ok) {
    els.calibPopoverError.textContent = 'Enter a valid number (e.g. 620 or 1e-4).';
    els.calibPopoverError.classList.remove('hidden');
    return;
  }

  const isX = popoverPinKey.startsWith('x');
  const scale = isX ? store.state.calibration.xScale : store.state.calibration.yScale;
  if (scale === 'log10' && parsed.value <= 0) {
    els.calibPopoverError.textContent = 'Log10 scale requires a value strictly > 0.';
    els.calibPopoverError.classList.remove('hidden');
    return;
  }

  const pin = store.state.calibration.pins[popoverPinKey];
  if (pin) {
    store.pushHistory();
    pin.value = parsed.value;
    store._invalidateCalibCache();
  }

  const nextStep = store.getNextCalibStep();
  store.state.calibStep = nextStep;
  closeCalibPopover();

  const transform = store.getCalibrationTransform();
  if (!nextStep && transform.valid) {
    store.state.tool = 'pick';
    showToast('Calibration complete! Switched to Pick tool (P) — or run Auto-Trace.', 'success');
  }

  store.scheduleAutoSave();
  store.emit('state');
}

function applyThemeToDOM() {
  const theme = store.state.theme;
  els.html.setAttribute('data-theme', theme);
  els.btnThemeToggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
  previewChart.render();
}

function setTool(tool) {
  store.state.tool = tool;
  if (tool === 'calibrate' && !store.state.calibStep) {
    store.state.calibStep = store.getNextCalibStep() || 'x1';
  }
  if (tool !== 'calibrate') {
    closeCalibPopover();
  }
  store.emit('state');
}

function switchInspectorTab(tabKey) {
  for (const btn of els.inspTabs) {
    btn.classList.toggle('active', btn.dataset.tab === tabKey);
  }
  for (const [key, pane] of Object.entries(els.inspPanes)) {
    pane.classList.toggle('active', key === tabKey);
  }
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file (PNG, JPG, WebP, SVG).', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result);
    const img = new Image();
    img.onload = () => {
      store.loadNewImage({
        dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name || 'pasted-graph.png',
      });
      showToast(`Loaded "${file.name || 'image'}" (${img.naturalWidth}×${img.naturalHeight})`, 'success');
    };
    img.onerror = () => showToast('Failed to decode the selected image.', 'error');
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function loadDemo(kind) {
  const demo = generateDemoGraph(kind);
  store.loadNewImage({
    dataUrl: demo.dataUrl,
    width: demo.width,
    height: demo.height,
    name: demo.name,
    demoKey: demo.demoKey,
  });
  store.state.calibration.mode = demo.demoCalibration.mode;
  store.state.calibration.xScale = demo.demoCalibration.xScale;
  store.state.calibration.yScale = demo.demoCalibration.yScale;
  store.state.tracer.targetRgb = { ...demo.targetColorHint };
  store.state.tracer.targetHex = demo.targetColorHint.hex;
  store._invalidateCalibCache();
  store.scheduleAutoSave();
  store.emit('state');
  showToast(demo.hint, 'info');
}

function autoCalibrateCurrentDemo() {
  const demoKey = store.state.image?.demoKey;
  if (!demoKey) return;
  const demo = generateDemoGraph(demoKey);
  store.pushHistory();
  store.state.calibration = JSON.parse(JSON.stringify(demo.demoCalibration));
  store.state.calibStep = null;
  store.state.tool = 'pick';
  store.state.tracer.targetRgb = { ...demo.targetColorHint };
  store.state.tracer.targetHex = demo.targetColorHint.hex;
  closeCalibPopover();
  store._invalidateCalibCache();
  store.scheduleAutoSave();
  store.emit('state');
  showToast('Demo axes calibrated cleanly! Click Preview Trace or Pick points.', 'success');
}

function runTrace(action) {
  const imgData = graphCanvas.getImageData();
  if (!imgData) {
    showToast('Load a graph image first before auto-tracing.', 'error');
    return;
  }

  let pts = store.state.tracer.previewPoints;
  if (action === 'preview' || !pts.length) {
    pts = traceCurve(imgData, {
      targetRgb: store.state.tracer.targetRgb,
      tolerance: store.state.tracer.tolerance,
      stepPx: store.state.tracer.stepPx,
      mode: store.state.tracer.mode,
      roi: store.state.tracer.roi,
    });
  }

  if (action === 'preview') {
    store.state.tracer.previewPoints = pts;
    graphCanvas.requestRender();
    if (pts.length === 0) {
      showToast('No matching curve pixels found. Pick color with Eyedropper (E) or raise Tolerance.', 'error');
    } else {
      showToast(`Previewed ${pts.length} traced points. Click Apply to add them.`, 'info');
    }
    return;
  }

  if (!pts.length) {
    showToast('No matching curve pixels found to commit.', 'error');
    return;
  }

  const active = store.getActiveSeries();
  if (!active) return;

  store.pushHistory();
  const mapped = pts.map((p) => ({ id: nextId('pt'), px: p.px, py: p.py }));
  if (action === 'replace') {
    active.points = mapped;
  } else {
    active.points.push(...mapped);
  }
  store.state.tracer.previewPoints = [];
  store.state.tool = 'pick';
  store.scheduleAutoSave();
  store.emit('state');
  showToast(`Committed ${mapped.length} points to "${active.name}".`, 'success');
}

function syncUI() {
  const s = store.state;
  const hasImage = Boolean(s.image && s.image.dataUrl);
  const transform = store.getCalibrationTransform();
  const activeSeries = store.getActiveSeries();

  // Empty state & Auto-calib buttons
  els.emptyState.classList.toggle('hidden', hasImage);
  const isDemo = Boolean(s.image?.demoKey);
  els.btnAutoCalibDemo.classList.toggle('hidden', !isDemo);
  els.btnAutoCalibDemoPanel.classList.toggle('hidden', !isDemo);

  // History buttons
  els.btnUndo.disabled = !store.canUndo();
  els.btnRedo.disabled = !store.canRedo();

  // Zoom readout
  els.zoomReadout.textContent = `${Math.round(graphCanvas.viewport.scale * 100)}%`;

  // Tool rail states
  for (const btn of els.toolButtons) {
    btn.classList.toggle('active', btn.dataset.tool === s.tool);
  }
  els.btnToggleGrid.classList.toggle('active', s.view.showGrid);
  els.btnToggleLoupe.classList.toggle('active', s.view.showLoupe);
  els.btnToggleConnect.classList.toggle('active', s.view.connectPoints);

  // Calibration status pill
  const pinCount = Object.values(s.calibration.pins).filter((p) => p && Number.isFinite(p.value)).length;
  els.calibStatusPill.classList.remove('status-ok', 'status-warn', 'status-err');
  if (transform.valid) {
    els.calibStatusPill.classList.add('status-ok');
    els.calibStatusPill.textContent = `Calibrated (${s.calibration.xScale === 'log10' ? 'Log' : 'Lin'}/${s.calibration.yScale === 'log10' ? 'Log' : 'Lin'})`;
  } else if (pinCount === 4) {
    els.calibStatusPill.classList.add('status-err');
    els.calibStatusPill.textContent = 'Calibration Error';
  } else {
    els.calibStatusPill.classList.add('status-warn');
    els.calibStatusPill.textContent = hasImage ? `Calibrating (${pinCount}/4)` : 'Uncalibrated';
  }

  // HUD tool hint
  const stepLabel = s.calibStep ? s.calibStep.toUpperCase() : 'X1';
  const hints = {
    calibrate: s.calibStep
      ? `Calibrate (C): Click on graph to place ${stepLabel}`
      : 'Calibrate (C): Drag pins to adjust or switch to Pick (P)',
    pick: `Pick (P): Left-click adds to "${activeSeries?.name || 'Series'}", Right-click deletes nearest`,
    eyedropper: 'Eyedropper (E): Click directly on curve pixels to sample target color',
    roi: 'ROI (R): Drag a bounding rectangle around the curve to constrain auto-tracing',
    pan: 'Pan (H / Space): Drag canvas to pan, Scroll to zoom',
  };
  els.hudToolHint.textContent = hints[s.tool] || '';

  // Calibration Inspector controls
  els.calibModeSelect.value = s.calibration.mode;
  els.xScaleSelect.value = s.calibration.xScale;
  els.yScaleSelect.value = s.calibration.yScale;

  for (const key of ['x1', 'x2', 'y1', 'y2']) {
    const pin = s.calibration.pins[key];
    const row = document.querySelector(`.pin-row[data-pin="${key}"]`);
    const coordsEl = $(`pinCoords-${key}`);
    const inputEl = document.querySelector(`[data-pin-input="${key}"]`);
    if (row) row.classList.toggle('active-step', s.tool === 'calibrate' && s.calibStep === key);
    if (coordsEl) {
      coordsEl.textContent = pin ? `${pin.px.toFixed(1)}, ${pin.py.toFixed(1)}` : 'Unset';
    }
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = pin && Number.isFinite(pin.value) ? String(pin.value) : '';
    }
  }

  // Calibration Diagnostics
  if (transform.valid) {
    els.calibDiagnostics.classList.remove('diag-error');
    els.calibDiagnostics.innerHTML = `
      <div class="diag-line"><span>Origin (px)</span><strong class="mono-readout">${transform.originPx[0].toFixed(1)}, ${transform.originPx[1].toFixed(1)}</strong></div>
      <div class="diag-line"><span>X-Axis Tilt</span><strong class="mono-readout">${transform.xTiltDeg.toFixed(2)}&deg;</strong></div>
      <div class="diag-line"><span>Axes Angle</span><strong class="mono-readout">${transform.axesAngleDeg.toFixed(2)}&deg;</strong></div>
      <div class="diag-line"><span>|ux| / |uy|</span><strong class="mono-readout">${Math.hypot(...transform.ux).toFixed(2)} / ${Math.hypot(...transform.uy).toFixed(2)} px/u</strong></div>
    `;
  } else {
    els.calibDiagnostics.classList.toggle('diag-error', pinCount === 4);
    els.calibDiagnostics.textContent = transform.error;
  }

  // Series list (preserve focus if renaming)
  renderSeriesList();

  // Tracer & Snap UI
  els.chkSnapToColor.checked = s.tracer.snapToColor;
  els.snapRadiusSlider.value = String(s.tracer.snapRadius);
  els.snapRadiusVal.textContent = `${s.tracer.snapRadius} px`;
  els.tracerColorInput.value = s.tracer.targetHex;
  els.tracerColorHex.textContent = s.tracer.targetHex;
  els.tracerTolerance.value = String(s.tracer.tolerance);
  els.tracerToleranceVal.textContent = String(s.tracer.tolerance);
  els.tracerStep.value = String(s.tracer.stepPx);
  els.tracerStepVal.textContent = `${s.tracer.stepPx} px`;
  els.tracerMode.value = s.tracer.mode;
  els.roiStatusText.textContent = s.tracer.roi
    ? `ROI: ${Math.round(s.tracer.roi.w)}×${Math.round(s.tracer.roi.h)} px`
    : 'ROI: Full Image';

  // Processing & Stats UI
  els.chkSortByX.checked = s.processing.sortByX;
  els.smoothMethod.value = s.processing.smoothMethod;
  els.smoothWindow.value = String(s.processing.smoothWindow);
  els.smoothWindowRow.classList.toggle('hidden', s.processing.smoothMethod === 'none');

  els.viewBrightness.value = String(s.view.brightness);
  els.viewBrightnessVal.textContent = `${s.view.brightness}%`;
  els.viewContrast.value = String(s.view.contrast);
  els.viewContrastVal.textContent = `${s.view.contrast}%`;
  els.viewOpacity.value = String(s.view.imageOpacity);
  els.viewOpacityVal.textContent = `${s.view.imageOpacity}%`;
  els.loupeZoomSlider.value = String(s.view.loupeZoom);
  els.loupeZoomVal.textContent = `${s.view.loupeZoom}×`;
  els.chkInvertImage.checked = s.view.invert;

  // Stats for active series
  const activeProcessed = activeSeries ? store.getProcessedSeriesPoints(activeSeries) : [];
  const useSmoothStats = s.processing.smoothMethod !== 'none';
  const stats = computeStats(activeProcessed, useSmoothStats);
  els.statCount.textContent = String(activeSeries ? activeSeries.points.length : 0);
  if (stats.count > 0) {
    els.statArea.textContent = formatTick(stats.area, 'linear');
    els.statXRange.textContent = `${formatTick(stats.xMin, s.calibration.xScale)} .. ${formatTick(stats.xMax, s.calibration.xScale)}`;
    els.statYRange.textContent = `${formatTick(stats.yMin, s.calibration.yScale)} .. ${formatTick(stats.yMax, s.calibration.yScale)}`;
    els.statPeakX.textContent = formatTick(stats.peakX, s.calibration.xScale);
    els.statPeakY.textContent = formatTick(stats.peakY, s.calibration.yScale);
  } else {
    els.statArea.textContent = '—';
    els.statXRange.textContent = '—';
    els.statYRange.textContent = '—';
    els.statPeakX.textContent = '—';
    els.statPeakY.textContent = '—';
  }

  // Drawer meta & data table
  els.drawerSeriesLabel.textContent = `Active: ${activeSeries?.name || 'None'}`;
  els.tableCountBadge.textContent = String(activeSeries?.points.length || 0);
  renderDataTable(activeSeries, activeProcessed, transform);

  // Export panel preview
  els.exportScope.value = s.exportOpts.scope;
  els.exportFormat.value = s.exportOpts.format;
  els.exportPrecision.value = String(s.exportOpts.precision);
  els.exportPrecisionVal.textContent = String(s.exportOpts.precision);
  els.chkExportHeader.checked = s.exportOpts.includeHeader;
  els.chkExportSmoothed.checked = s.exportOpts.includeSmoothed;
  renderExportPreview();

  graphCanvas.requestRender();
  previewChart.render();
}

function renderSeriesList() {
  if (document.activeElement && document.activeElement.classList.contains('series-name-input')) {
    return;
  }

  const frag = document.createDocumentFragment();
  const series = store.state.series;

  for (const s of series) {
    const item = document.createElement('div');
    item.className = `series-item${s.id === store.state.activeSeriesId ? ' active' : ''}`;
    item.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.tagName === 'INPUT') return;
      store.state.activeSeriesId = s.id;
      store.scheduleAutoSave();
      store.emit('state');
    });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'series-color-dot';
    colorInput.value = s.color;
    colorInput.title = 'Series color';
    colorInput.addEventListener('input', () => {
      s.color = colorInput.value;
      store.scheduleAutoSave();
      store.emit('state');
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'series-name-input';
    nameInput.value = s.name;
    nameInput.title = 'Click to rename series';
    nameInput.addEventListener('focus', () => {
      store.state.activeSeriesId = s.id;
    });
    nameInput.addEventListener('input', () => {
      s.name = nameInput.value || 'Series';
      store.scheduleAutoSave();
    });
    nameInput.addEventListener('blur', () => store.emit('state'));

    const count = document.createElement('span');
    count.className = 'series-count mono-readout';
    count.textContent = `${s.points.length}`;

    const visBtn = document.createElement('button');
    visBtn.className = 'btn btn-ghost btn-xs';
    visBtn.textContent = s.visible ? 'Hide' : 'Show';
    visBtn.title = 'Toggle visibility';
    visBtn.addEventListener('click', () => {
      s.visible = !s.visible;
      store.scheduleAutoSave();
      store.emit('state');
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-ghost btn-xs';
    clearBtn.textContent = series.length > 1 ? 'Del' : 'Clear';
    clearBtn.title = series.length > 1 ? 'Delete series' : 'Clear points';
    clearBtn.addEventListener('click', () => {
      store.pushHistory();
      if (series.length > 1) {
        store.state.series = store.state.series.filter((x) => x.id !== s.id);
        if (store.state.activeSeriesId === s.id) {
          store.state.activeSeriesId = store.state.series[0].id;
        }
      } else {
        s.points = [];
      }
      store.scheduleAutoSave();
      store.emit('state');
    });

    item.append(colorInput, nameInput, count, visBtn, clearBtn);
    frag.appendChild(item);
  }

  els.seriesList.innerHTML = '';
  els.seriesList.appendChild(frag);
}

function renderDataTable(activeSeries, processedPts, transform) {
  const showSmooth = store.state.processing.smoothMethod !== 'none' && transform.valid;
  els.thYSmooth.classList.toggle('hidden', !showSmooth);

  const frag = document.createDocumentFragment();
  const precision = store.state.exportOpts.precision;
  const sel = store.state.selectedPoint;

  const rows = transform.valid && processedPts.length > 0
    ? processedPts
    : (activeSeries?.points || []).map((pt) => ({ ...pt, x: NaN, yRaw: NaN, ySmooth: NaN }));

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = showSmooth ? 6 : 5;
    td.style.color = 'var(--text-muted)';
    td.style.textAlign = 'center';
    td.style.padding = '18px';
    td.textContent = 'No points in the active series yet.';
    tr.appendChild(td);
    frag.appendChild(tr);
  } else {
    rows.forEach((pt, idx) => {
      const tr = document.createElement('tr');
      const isSelected =
        sel?.type === 'point' &&
        sel.seriesId === activeSeries.id &&
        sel.pointId === pt.id;
      if (isSelected) tr.classList.add('row-selected');

      tr.addEventListener('click', () => {
        store.state.selectedPoint = {
          type: 'point',
          seriesId: activeSeries.id,
          pointId: pt.id,
        };
        store.emit('state');
      });
      tr.addEventListener('pointerenter', () => {
        store.setHoveredPoint({
          type: 'point',
          seriesId: activeSeries.id,
          pointId: pt.id,
          from: 'table',
        });
      });
      tr.addEventListener('pointerleave', () => {
        if (store.state.hoveredPoint?.from === 'table') {
          store.setHoveredPoint(null);
        }
      });

      const tdIdx = document.createElement('td');
      tdIdx.textContent = String(idx + 1);

      const tdPx = document.createElement('td');
      tdPx.textContent = `${pt.px.toFixed(1)}, ${pt.py.toFixed(1)}`;

      const tdX = document.createElement('td');
      tdX.textContent = Number.isFinite(pt.x) ? formatExportNumber(pt.x, precision) : '—';

      const tdY = document.createElement('td');
      tdY.textContent = Number.isFinite(pt.yRaw) ? formatExportNumber(pt.yRaw, precision) : '—';

      tr.append(tdIdx, tdPx, tdX, tdY);

      if (showSmooth) {
        const tdSm = document.createElement('td');
        tdSm.textContent = Number.isFinite(pt.ySmooth) ? formatExportNumber(pt.ySmooth, precision) : '—';
        tr.appendChild(tdSm);
      }

      const tdAct = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost btn-xs';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        store.pushHistory();
        activeSeries.points = activeSeries.points.filter((p) => p.id !== pt.id);
        store.scheduleAutoSave();
        store.emit('state');
      });
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      frag.appendChild(tr);
    });
  }

  els.dataTableBody.innerHTML = '';
  els.dataTableBody.appendChild(frag);
}

function getExportSeriesEntries() {
  const s = store.state;
  const targetSeries =
    s.exportOpts.scope === 'all'
      ? s.series.filter((item) => item.visible)
      : [store.getActiveSeries()].filter(Boolean);

  return targetSeries
    .map((item) => ({
      series: item,
      points: store.getProcessedSeriesPoints(item),
    }))
    .filter((entry) => entry.points.length > 0);
}

function renderExportPreview() {
  const transform = store.getCalibrationTransform();
  if (!transform.valid) {
    els.exportMetaCount.textContent = 'Uncalibrated';
    els.exportPreview.value = '# Complete 4-point axis calibration first to export real-world coordinates.';
    return;
  }

  const entries = getExportSeriesEntries();
  const totalRows = entries.reduce((sum, e) => sum + e.points.length, 0);
  els.exportMetaCount.textContent = `${totalRows} row${totalRows === 1 ? '' : 's'}`;

  if (totalRows === 0) {
    els.exportPreview.value = '# Add or auto-trace data points to generate output.';
    return;
  }

  const out = buildExportOutput({
    seriesEntries: entries,
    calibration: store.state.calibration,
    transform,
    processing: store.state.processing,
    options: store.state.exportOpts,
    imageName: store.state.image?.name || 'graph',
  });
  els.exportPreview.value = out.content;
}

function wireEvents() {
  // Store subscriptions
  store.subscribe((topic, _state, payload) => {
    if (topic === 'notice' && payload) {
      showToast(payload.message, payload.type);
      return;
    }
    if (topic === 'theme') {
      applyThemeToDOM();
      return;
    }
    if (topic === 'imageLoaded') {
      graphCanvas.syncImageFromStore(true);
    }
    if (topic === 'hover') {
      graphCanvas.requestRender();
      previewChart.render();
      return;
    }
    syncUI();
  });

  // File & Demo buttons
  els.btnOpenImage.addEventListener('click', () => els.fileImageInput.click());
  els.btnEmptyUpload.addEventListener('click', () => els.fileImageInput.click());
  els.fileImageInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) loadImageFile(file);
    e.target.value = '';
  });

  els.btnDemoSpec.addEventListener('click', () => loadDemo('spectroscopy'));
  els.btnEmptyDemoSpec.addEventListener('click', () => loadDemo('spectroscopy'));
  els.btnDemoBode.addEventListener('click', () => loadDemo('bode'));
  els.btnEmptyDemoBode.addEventListener('click', () => loadDemo('bode'));

  els.btnAutoCalibDemo.addEventListener('click', autoCalibrateCurrentDemo);
  els.btnAutoCalibDemoPanel.addEventListener('click', autoCalibrateCurrentDemo);

  // Project Save / Load
  els.btnSaveProject.addEventListener('click', () => {
    const json = store.serializeProject();
    const base = (store.state.image?.name || 'graphrev').replace(/\.[^.]+$/, '');
    downloadTextFile(`${base}.graphrev.json`, json, 'application/json;charset=utf-8');
    showToast('Project file downloaded (.json)', 'success');
  });

  els.btnLoadProject.addEventListener('click', () => els.fileProjectInput.click());
  els.fileProjectInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        store.loadProjectObject(obj);
        showToast(`Loaded project "${file.name}"`, 'success');
      } catch (err) {
        showToast(`Invalid project JSON: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Undo / Redo & Zoom
  els.btnUndo.addEventListener('click', () => store.undo());
  els.btnRedo.addEventListener('click', () => store.redo());
  els.btnZoomIn.addEventListener('click', () => graphCanvas.zoomByCenter(1.25));
  els.btnZoomOut.addEventListener('click', () => graphCanvas.zoomByCenter(1 / 1.25));
  els.btnFitView.addEventListener('click', () => graphCanvas.fitToView());

  // Theme & Help modal
  els.btnThemeToggle.addEventListener('click', () => {
    store.setTheme(store.state.theme === 'dark' ? 'light' : 'dark');
  });
  els.btnHelp.addEventListener('click', () => els.helpModal.classList.remove('hidden'));
  els.btnCloseHelp.addEventListener('click', () => els.helpModal.classList.add('hidden'));
  els.helpModal.addEventListener('click', (e) => {
    if (e.target === els.helpModal) els.helpModal.classList.add('hidden');
  });

  // Left Tool Rail
  for (const btn of els.toolButtons) {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  }
  els.btnToggleGrid.addEventListener('click', () => {
    store.state.view.showGrid = !store.state.view.showGrid;
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.btnToggleLoupe.addEventListener('click', () => {
    store.state.view.showLoupe = !store.state.view.showLoupe;
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.btnToggleConnect.addEventListener('click', () => {
    store.state.view.connectPoints = !store.state.view.connectPoints;
    store.scheduleAutoSave();
    store.emit('state');
  });

  // Popover controls
  els.calibPopoverConfirm.addEventListener('click', commitCalibPopover);
  els.calibPopoverCancel.addEventListener('click', closeCalibPopover);
  els.calibPopoverInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCalibPopover();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCalibPopover();
    }
  });

  // Bottom drawer
  els.drawerTabChart.addEventListener('click', () => {
    els.drawerTabChart.classList.add('active');
    els.drawerTabTable.classList.remove('active');
    els.drawerChartPane.classList.remove('hidden');
    els.drawerTablePane.classList.add('hidden');
    if (els.bottomDrawer.classList.contains('collapsed')) {
      els.bottomDrawer.classList.remove('collapsed');
      els.btnToggleDrawer.textContent = 'Hide';
    }
    previewChart.render();
  });

  els.drawerTabTable.addEventListener('click', () => {
    els.drawerTabTable.classList.add('active');
    els.drawerTabChart.classList.remove('active');
    els.drawerTablePane.classList.remove('hidden');
    els.drawerChartPane.classList.add('hidden');
    if (els.bottomDrawer.classList.contains('collapsed')) {
      els.bottomDrawer.classList.remove('collapsed');
      els.btnToggleDrawer.textContent = 'Hide';
    }
  });

  els.btnToggleDrawer.addEventListener('click', () => {
    const collapsed = els.bottomDrawer.classList.toggle('collapsed');
    els.btnToggleDrawer.textContent = collapsed ? 'Show' : 'Hide';
    if (!collapsed) {
      requestAnimationFrame(() => previewChart._resize());
    }
  });

  // Right Inspector Tabs
  for (const tabBtn of els.inspTabs) {
    tabBtn.addEventListener('click', () => switchInspectorTab(tabBtn.dataset.tab));
  }

  // Calibration Tab controls
  document.querySelectorAll('[data-select-pin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.state.tool = 'calibrate';
      store.state.calibStep = btn.dataset.selectPin;
      store.emit('state');
    });
  });

  document.querySelectorAll('[data-pin-input]').forEach((inputEl) => {
    const commitInput = () => {
      const key = inputEl.dataset.pinInput;
      const pin = store.state.calibration.pins[key];
      const raw = inputEl.value.trim();
      if (!raw) {
        if (pin) {
          store.pushHistory();
          pin.value = null;
          store._invalidateCalibCache();
          store.scheduleAutoSave();
          store.emit('state');
        }
        return;
      }
      const parsed = parseNumericInput(raw);
      if (!parsed.ok) {
        showToast(`Invalid numeric value for ${key.toUpperCase()}`, 'error');
        return;
      }
      const scale = key.startsWith('x')
        ? store.state.calibration.xScale
        : store.state.calibration.yScale;
      if (scale === 'log10' && parsed.value <= 0) {
        showToast('Log10 axis requires strictly positive (> 0) values.', 'error');
        return;
      }
      if (!pin) {
        store.state.tool = 'calibrate';
        store.state.calibStep = key;
        showToast(`Click on the graph to place ${key.toUpperCase()}, then enter ${parsed.value}.`, 'info');
        return;
      }
      if (pin.value !== parsed.value) {
        store.pushHistory();
        pin.value = parsed.value;
        store.state.calibStep = store.getNextCalibStep();
        store._invalidateCalibCache();
        store.scheduleAutoSave();
        store.emit('state');
      }
    };

    inputEl.addEventListener('change', commitInput);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInput();
        inputEl.blur();
      }
    });
  });

  els.btnClearPins.addEventListener('click', () => {
    store.pushHistory();
    store.state.calibration.pins = { x1: null, x2: null, y1: null, y2: null };
    store.state.calibStep = 'x1';
    store.state.tool = 'calibrate';
    closeCalibPopover();
    store._invalidateCalibCache();
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.calibModeSelect.addEventListener('change', () => {
    store.pushHistory();
    store.state.calibration.mode = els.calibModeSelect.value;
    store._invalidateCalibCache();
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.xScaleSelect.addEventListener('change', () => {
    store.pushHistory();
    store.state.calibration.xScale = els.xScaleSelect.value;
    store._invalidateCalibCache();
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.yScaleSelect.addEventListener('change', () => {
    store.pushHistory();
    store.state.calibration.yScale = els.yScaleSelect.value;
    store._invalidateCalibCache();
    store.scheduleAutoSave();
    store.emit('state');
  });

  // Series & Tracer Tab controls
  els.btnAddSeries.addEventListener('click', () => {
    store.pushHistory();
    const id = nextId('s');
    const idx = store.state.series.length + 1;
    store.state.series.push({
      id,
      name: `Series ${idx}`,
      color: store.nextSeriesColor(),
      visible: true,
      points: [],
    });
    store.state.activeSeriesId = id;
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.chkSnapToColor.addEventListener('change', () => {
    store.state.tracer.snapToColor = els.chkSnapToColor.checked;
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.snapRadiusSlider.addEventListener('input', () => {
    store.state.tracer.snapRadius = Number(els.snapRadiusSlider.value);
    els.snapRadiusVal.textContent = `${store.state.tracer.snapRadius} px`;
    store.scheduleAutoSave();
  });

  els.btnPickColorTool.addEventListener('click', () => setTool('eyedropper'));

  els.tracerColorInput.addEventListener('input', () => {
    const hex = els.tracerColorInput.value;
    store.state.tracer.targetHex = hex;
    store.state.tracer.targetRgb = hexToRgb(hex);
    els.tracerColorHex.textContent = hex;
    store.scheduleAutoSave();
  });

  els.tracerTolerance.addEventListener('input', () => {
    store.state.tracer.tolerance = Number(els.tracerTolerance.value);
    els.tracerToleranceVal.textContent = String(store.state.tracer.tolerance);
    store.scheduleAutoSave();
  });

  els.tracerStep.addEventListener('input', () => {
    store.state.tracer.stepPx = Number(els.tracerStep.value);
    els.tracerStepVal.textContent = `${store.state.tracer.stepPx} px`;
    store.scheduleAutoSave();
  });

  els.tracerMode.addEventListener('change', () => {
    store.state.tracer.mode = els.tracerMode.value;
    store.scheduleAutoSave();
  });

  els.btnDrawRoi.addEventListener('click', () => setTool('roi'));
  els.btnClearRoi.addEventListener('click', () => {
    store.state.tracer.roi = null;
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.btnPreviewTrace.addEventListener('click', () => runTrace('preview'));
  els.btnClearTracePreview.addEventListener('click', () => {
    store.state.tracer.previewPoints = [];
    graphCanvas.requestRender();
  });
  els.btnApplyReplace.addEventListener('click', () => runTrace('replace'));
  els.btnApplyAppend.addEventListener('click', () => runTrace('append'));

  // Process & View Tab controls
  els.chkSortByX.addEventListener('change', () => {
    store.state.processing.sortByX = els.chkSortByX.checked;
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.smoothMethod.addEventListener('change', () => {
    store.state.processing.smoothMethod = els.smoothMethod.value;
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.smoothWindow.addEventListener('change', () => {
    store.state.processing.smoothWindow = Number(els.smoothWindow.value);
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.viewBrightness.addEventListener('input', () => {
    store.state.view.brightness = Number(els.viewBrightness.value);
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.viewContrast.addEventListener('input', () => {
    store.state.view.contrast = Number(els.viewContrast.value);
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.viewOpacity.addEventListener('input', () => {
    store.state.view.imageOpacity = Number(els.viewOpacity.value);
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.loupeZoomSlider.addEventListener('input', () => {
    store.state.view.loupeZoom = Number(els.loupeZoomSlider.value);
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.chkInvertImage.addEventListener('change', () => {
    store.state.view.invert = els.chkInvertImage.checked;
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.btnResetView.addEventListener('click', () => {
    store.state.view.brightness = 100;
    store.state.view.contrast = 100;
    store.state.view.imageOpacity = 100;
    store.state.view.invert = false;
    store.state.view.loupeZoom = 6;
    store.scheduleAutoSave();
    store.emit('state');
  });

  // Export Tab controls
  els.exportScope.addEventListener('change', () => {
    store.state.exportOpts.scope = els.exportScope.value;
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.exportFormat.addEventListener('change', () => {
    store.state.exportOpts.format = els.exportFormat.value;
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.exportPrecision.addEventListener('input', () => {
    store.state.exportOpts.precision = Number(els.exportPrecision.value);
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.chkExportHeader.addEventListener('change', () => {
    store.state.exportOpts.includeHeader = els.chkExportHeader.checked;
    store.scheduleAutoSave();
    store.emit('state');
  });
  els.chkExportSmoothed.addEventListener('change', () => {
    store.state.exportOpts.includeSmoothed = els.chkExportSmoothed.checked;
    store.scheduleAutoSave();
    store.emit('state');
  });

  els.btnCopyExport.addEventListener('click', async () => {
    const transform = store.getCalibrationTransform();
    const entries = getExportSeriesEntries();
    if (!transform.valid || entries.length === 0) {
      showToast('Calibrate and collect points before copying.', 'error');
      return;
    }
    const ok = await copyToClipboard(els.exportPreview.value);
    showToast(ok ? 'Copied data to clipboard!' : 'Clipboard copy blocked by browser.', ok ? 'success' : 'error');
  });

  els.btnDownloadExport.addEventListener('click', () => {
    const transform = store.getCalibrationTransform();
    const entries = getExportSeriesEntries();
    if (!transform.valid || entries.length === 0) {
      showToast('Calibrate and collect points before downloading.', 'error');
      return;
    }
    const out = buildExportOutput({
      seriesEntries: entries,
      calibration: store.state.calibration,
      transform,
      processing: store.state.processing,
      options: store.state.exportOpts,
      imageName: store.state.image?.name || 'graph',
    });
    downloadTextFile(out.filename, out.content, out.mimeType);
    showToast(`Downloaded ${out.filename}`, 'success');
  });

  els.btnResetSession.addEventListener('click', () => {
    closeCalibPopover();
    store.resetSession();
    showToast('Workspace reset.', 'info');
  });

  // Drag & drop image onto canvasStage
  els.canvasStage.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth += 1;
    els.dropOverlay.classList.remove('hidden');
  });
  els.canvasStage.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  els.canvasStage.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      els.dropOverlay.classList.add('hidden');
    }
  });
  els.canvasStage.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    els.dropOverlay.classList.add('hidden');
    const file = e.dataTransfer?.files?.[0];
    if (file) loadImageFile(file);
  });

  // Clipboard Paste (Ctrl+V screenshot)
  window.addEventListener('paste', (e) => {
    if (isEditableElement(document.activeElement)) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          loadImageFile(blob);
          e.preventDefault();
          break;
        }
      }
    }
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.calibPopover.classList.contains('hidden')) {
        closeCalibPopover();
        return;
      }
      if (!els.helpModal.classList.contains('hidden')) {
        els.helpModal.classList.add('hidden');
        return;
      }
      if (store.state.tracer.previewPoints.length > 0) {
        store.state.tracer.previewPoints = [];
        graphCanvas.requestRender();
      }
      return;
    }

    if (isEditableElement(document.activeElement)) return;

    // Undo / Redo
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      graphCanvas.setSpacePan(true);
      return;
    }

    // Arrow key nudging of selected pin or point
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const sel = store.state.selectedPoint;
      if (!sel) return;
      e.preventDefault();
      const step = e.shiftKey ? 0.25 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

      if (!e.repeat) store.pushHistory();

      if (sel.type === 'pin') {
        const pin = store.state.calibration.pins[sel.pinKey];
        if (pin) {
          pin.px += dx;
          pin.py += dy;
          store._invalidateCalibCache();
          store.scheduleAutoSave();
          store.emit('state');
        }
      } else if (sel.type === 'point') {
        const ser = store.state.series.find((x) => x.id === sel.seriesId);
        const pt = ser?.points.find((p) => p.id === sel.pointId);
        if (pt) {
          pt.px += dx;
          pt.py += dy;
          store.scheduleAutoSave();
          store.emit('state');
        }
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = store.state.selectedPoint;
      if (!sel) return;
      e.preventDefault();
      if (sel.type === 'point') {
        const ser = store.state.series.find((x) => x.id === sel.seriesId);
        if (ser) {
          store.pushHistory();
          ser.points = ser.points.filter((p) => p.id !== sel.pointId);
          store.state.selectedPoint = null;
          store.scheduleAutoSave();
          store.emit('state');
        }
      } else if (sel.type === 'pin') {
        store.pushHistory();
        store.state.calibration.pins[sel.pinKey] = null;
        store.state.calibStep = sel.pinKey;
        store.state.selectedPoint = null;
        store._invalidateCalibCache();
        store.scheduleAutoSave();
        store.emit('state');
      }
      return;
    }

    if (mod || e.altKey) return;

    const k = e.key.toLowerCase();
    if (k === 'c') setTool('calibrate');
    else if (k === 'p') setTool('pick');
    else if (k === 'e') setTool('eyedropper');
    else if (k === 'r') setTool('roi');
    else if (k === 'h') setTool('pan');
    else if (k === 'f') graphCanvas.fitToView();
    else if (k === 'g') {
      store.state.view.showGrid = !store.state.view.showGrid;
      store.scheduleAutoSave();
      store.emit('state');
    } else if (k === 'l') {
      store.state.view.showLoupe = !store.state.view.showLoupe;
      store.scheduleAutoSave();
      store.emit('state');
    } else if (e.key === '?') {
      els.helpModal.classList.toggle('hidden');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      graphCanvas.setSpacePan(false);
    }
  });
  window.addEventListener('blur', () => graphCanvas.setSpacePan(false));
}

function init() {
  applyThemeToDOM();
  wireEvents();

  const restored = store.restoreAutoSave();
  if (restored.restored) {
    graphCanvas.syncImageFromStore(true);
    if (restored.imageOmitted) {
      showToast('Session calibration & points restored (large image was not cached — re-open image).', 'info');
    } else {
      showToast('Previous session restored automatically.', 'info');
    }
  }
  syncUI();
}

init();
})(globalThis.GraphRev = globalThis.GraphRev || {});
