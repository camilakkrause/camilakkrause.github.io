(function (GR) {
  'use strict';

const { computeCalibration, pixelToReal, sortPoints, applySmoothing } = GR.math;

const SERIES_PALETTE = [
  '#38bdf8',
  '#f43f5e',
  '#34d399',
  '#f59e0b',
  '#a78bfa',
  '#fb7185',
  '#2dd4bf',
];

const THEME_KEY = 'graphrev_theme_v1';
const AUTOSAVE_KEY = 'graphrev_autosave_v1';
const MAX_HISTORY = 100;
const MAX_SAVED_IMAGE_CHARS = 2_500_000;

let idCounter = 1;
function nextId(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createInitialState() {
  let savedTheme = 'dark';
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      savedTheme = stored;
    }
  } catch {
    // Ignore storage access restrictions
  }

  return {
    theme: savedTheme,
    image: null,
    imageNotPersisted: false,
    tool: 'calibrate', // 'calibrate' | 'pick' | 'eyedropper' | 'roi' | 'pan'
    calibStep: 'x1',  // 'x1' | 'x2' | 'y1' | 'y2' | null
    calibration: {
      mode: 'orthogonal', // 'orthogonal' | 'skewed'
      xScale: 'linear',   // 'linear' | 'log10'
      yScale: 'linear',   // 'linear' | 'log10'
      pins: {
        x1: null,
        x2: null,
        y1: null,
        y2: null,
      },
    },
    series: [
      {
        id: 's-1',
        name: 'Series 1',
        color: SERIES_PALETTE[0],
        visible: true,
        points: [],
      },
    ],
    activeSeriesId: 's-1',
    selectedPoint: null, // { type: 'pin', pinKey } | { type: 'point', seriesId, pointId }
    hoveredPoint: null,  // { type: 'point', seriesId, pointId, from }
    view: {
      showGrid: true,
      showLoupe: true,
      loupeZoom: 6,
      connectPoints: true,
      brightness: 100,
      contrast: 100,
      invert: false,
      imageOpacity: 100,
    },
    tracer: {
      targetRgb: { r: 29, g: 78, b: 216 },
      targetHex: '#1d4ed8',
      tolerance: 42,
      stepPx: 6,
      mode: 'tracked',
      roi: null,
      snapToColor: false,
      snapRadius: 10,
      previewPoints: [],
    },
    processing: {
      sortByX: true,
      smoothMethod: 'none', // 'none' | 'moving_avg' | 'savitzky_golay'
      smoothWindow: 7,
    },
    exportOpts: {
      scope: 'active', // 'active' | 'all'
      format: 'tsv',   // 'tsv' | 'csv' | 'json' | 'python' | 'matlab'
      precision: 6,
      includeHeader: true,
      includeSmoothed: true,
    },
  };
}

class AppStore {
  constructor() {
    this.state = createInitialState();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this._saveTimer = null;
    this._cachedCalibInput = null;
    this._cachedCalibResult = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(topic = 'state', payload = null) {
    for (const fn of this.listeners) {
      fn(topic, this.state, payload);
    }
  }

  notify(message, type = 'info') {
    this.emit('notice', { message, type });
  }

  setTheme(theme) {
    this.state.theme = theme === 'light' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, this.state.theme);
    } catch {
      // Ignore storage error
    }
    this.emit('theme');
  }

  getSnapshot() {
    return deepClone({
      calibration: this.state.calibration,
      series: this.state.series,
      activeSeriesId: this.state.activeSeriesId,
      calibStep: this.state.calibStep,
    });
  }

  pushHistory() {
    this.undoStack.push(this.getSnapshot());
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  _restoreSnapshot(snap) {
    this.state.calibration = deepClone(snap.calibration);
    this.state.series = deepClone(snap.series);
    this.state.activeSeriesId = snap.activeSeriesId;
    this.state.calibStep = snap.calibStep;
    this.state.tracer.previewPoints = [];
    this._validateSelection();
    this._invalidateCalibCache();
    this.scheduleAutoSave();
    this.emit('state');
  }

  undo() {
    if (!this.canUndo()) return false;
    this.redoStack.push(this.getSnapshot());
    const prev = this.undoStack.pop();
    this._restoreSnapshot(prev);
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this.undoStack.push(this.getSnapshot());
    const next = this.redoStack.pop();
    this._restoreSnapshot(next);
    return true;
  }

  _validateSelection() {
    const sel = this.state.selectedPoint;
    if (!sel) return;
    if (sel.type === 'pin') {
      if (!this.state.calibration.pins[sel.pinKey]) {
        this.state.selectedPoint = null;
      }
      return;
    }
    if (sel.type === 'point') {
      const s = this.state.series.find((item) => item.id === sel.seriesId);
      if (!s || !s.points.some((p) => p.id === sel.pointId)) {
        this.state.selectedPoint = null;
      }
    }
  }

  _invalidateCalibCache() {
    this._cachedCalibInput = null;
    this._cachedCalibResult = null;
  }

  getCalibrationTransform() {
    const sig = JSON.stringify(this.state.calibration);
    if (this._cachedCalibInput === sig && this._cachedCalibResult) {
      return this._cachedCalibResult;
    }
    this._cachedCalibInput = sig;
    this._cachedCalibResult = computeCalibration(this.state.calibration);
    return this._cachedCalibResult;
  }

  getActiveSeries() {
    return (
      this.state.series.find((s) => s.id === this.state.activeSeriesId) ||
      this.state.series[0] ||
      null
    );
  }

  getNextCalibStep() {
    const order = ['x1', 'x2', 'y1', 'y2'];
    for (const key of order) {
      const pin = this.state.calibration.pins[key];
      if (!pin || !Number.isFinite(pin.value)) {
        return key;
      }
    }
    return null;
  }

  getProcessedSeriesPoints(seriesObj) {
    const s = typeof seriesObj === 'string'
      ? this.state.series.find((item) => item.id === seriesObj)
      : seriesObj;
    if (!s || !s.points.length) return [];

    const transform = this.getCalibrationTransform();
    if (!transform.valid) return [];

    const realPts = [];
    for (let i = 0; i < s.points.length; i += 1) {
      const pt = s.points[i];
      const real = pixelToReal(transform, pt.px, pt.py);
      if (Number.isFinite(real.x) && Number.isFinite(real.y)) {
        realPts.push({
          id: pt.id,
          px: pt.px,
          py: pt.py,
          x: real.x,
          y: real.y,
          index: i,
        });
      }
    }

    const sorted = sortPoints(realPts, this.state.processing.sortByX);
    return applySmoothing(sorted, {
      method: this.state.processing.smoothMethod,
      windowSize: this.state.processing.smoothWindow,
    });
  }

  setHoveredPoint(hovered) {
    const prev = this.state.hoveredPoint;
    if (
      prev?.seriesId === hovered?.seriesId &&
      prev?.pointId === hovered?.pointId &&
      prev?.from === hovered?.from
    ) {
      return;
    }
    this.state.hoveredPoint = hovered;
    this.emit('hover', hovered);
  }

  loadNewImage(imageInfo, options = {}) {
    const { preserveCalibration = false, preserveSeries = false } = options;
    this.undoStack = [];
    this.redoStack = [];
    this.state.image = {
      dataUrl: imageInfo.dataUrl,
      width: imageInfo.width,
      height: imageInfo.height,
      name: imageInfo.name || 'graph.png',
      demoKey: imageInfo.demoKey || null,
    };
    this.state.imageNotPersisted = false;

    if (!preserveCalibration) {
      this.state.calibration.pins = { x1: null, x2: null, y1: null, y2: null };
      this.state.calibStep = 'x1';
      this.state.tool = 'calibrate';
    }
    if (!preserveSeries) {
      this.state.series = [
        {
          id: 's-1',
          name: 'Series 1',
          color: SERIES_PALETTE[0],
          visible: true,
          points: [],
        },
      ];
      this.state.activeSeriesId = 's-1';
    }
    this.state.selectedPoint = null;
    this.state.hoveredPoint = null;
    this.state.tracer.roi = null;
    this.state.tracer.previewPoints = [];
    this._invalidateCalibCache();
    this.scheduleAutoSave();
    this.emit('imageLoaded');
    this.emit('state');
  }

  nextSeriesColor() {
    const used = new Set(this.state.series.map((s) => s.color.toLowerCase()));
    for (const c of SERIES_PALETTE) {
      if (!used.has(c.toLowerCase())) return c;
    }
    return SERIES_PALETTE[this.state.series.length % SERIES_PALETTE.length];
  }

  scheduleAutoSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveAutoSave(), 350);
  }

  _buildSerializablePayload(includeImage = true) {
    const tracerClean = { ...this.state.tracer, previewPoints: [] };
    return {
      app: 'GraphRev',
      version: 1,
      savedAt: new Date().toISOString(),
      image: includeImage ? this.state.image : null,
      calibration: this.state.calibration,
      series: this.state.series,
      activeSeriesId: this.state.activeSeriesId,
      view: this.state.view,
      tracer: tracerClean,
      processing: this.state.processing,
      exportOpts: this.state.exportOpts,
    };
  }

  saveAutoSave() {
    try {
      const canStoreImage =
        this.state.image &&
        typeof this.state.image.dataUrl === 'string' &&
        this.state.image.dataUrl.length <= MAX_SAVED_IMAGE_CHARS;

      const payload = this._buildSerializablePayload(Boolean(canStoreImage));
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
      this.state.imageNotPersisted = Boolean(this.state.image && !canStoreImage);
    } catch {
      try {
        const fallbackPayload = this._buildSerializablePayload(false);
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(fallbackPayload));
        this.state.imageNotPersisted = Boolean(this.state.image);
      } catch {
        // Ignore storage errors when quota is full
      }
    }
  }

  restoreAutoSave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return { restored: false, imageOmitted: false };
      const data = JSON.parse(raw);
      if (!data || data.app !== 'GraphRev' || !data.calibration || !Array.isArray(data.series)) {
        return { restored: false, imageOmitted: false };
      }

      const hasWork =
        Boolean(data.image) ||
        Object.values(data.calibration.pins || {}).some(Boolean) ||
        data.series.some((s) => s.points && s.points.length > 0);
      if (!hasWork) return { restored: false, imageOmitted: false };

      this.loadProjectObject(data, { skipSave: true });
      return {
        restored: true,
        imageOmitted: !data.image,
      };
    } catch {
      return { restored: false, imageOmitted: false };
    }
  }

  clearAutoSave() {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // Ignore
    }
  }

  serializeProject() {
    return JSON.stringify(this._buildSerializablePayload(true), null, 2);
  }

  loadProjectObject(obj, { skipSave = false } = {}) {
    if (!obj || obj.app !== 'GraphRev' || !obj.calibration || !Array.isArray(obj.series)) {
      throw new Error('Invalid GraphRev project file.');
    }

    this.undoStack = [];
    this.redoStack = [];

    this.state.image = obj.image && obj.image.dataUrl ? obj.image : null;
    this.state.imageNotPersisted = false;
    this.state.calibration = {
      mode: obj.calibration.mode === 'skewed' ? 'skewed' : 'orthogonal',
      xScale: obj.calibration.xScale === 'log10' ? 'log10' : 'linear',
      yScale: obj.calibration.yScale === 'log10' ? 'log10' : 'linear',
      pins: {
        x1: obj.calibration.pins?.x1 || null,
        x2: obj.calibration.pins?.x2 || null,
        y1: obj.calibration.pins?.y1 || null,
        y2: obj.calibration.pins?.y2 || null,
      },
    };

    this.state.series = obj.series.length
      ? obj.series.map((s, idx) => ({
          id: s.id || nextId('s'),
          name: s.name || `Series ${idx + 1}`,
          color: s.color || SERIES_PALETTE[idx % SERIES_PALETTE.length],
          visible: s.visible !== false,
          points: Array.isArray(s.points)
            ? s.points
                .filter((p) => Number.isFinite(p.px) && Number.isFinite(p.py))
                .map((p) => ({ id: p.id || nextId('pt'), px: p.px, py: p.py }))
            : [],
        }))
      : [
          {
            id: 's-1',
            name: 'Series 1',
            color: SERIES_PALETTE[0],
            visible: true,
            points: [],
          },
        ];

    this.state.activeSeriesId =
      this.state.series.some((s) => s.id === obj.activeSeriesId)
        ? obj.activeSeriesId
        : this.state.series[0].id;

    if (obj.view) {
      this.state.view = { ...this.state.view, ...obj.view };
    }
    if (obj.tracer) {
      this.state.tracer = { ...this.state.tracer, ...obj.tracer, previewPoints: [] };
    }
    if (obj.processing) {
      this.state.processing = { ...this.state.processing, ...obj.processing };
    }
    if (obj.exportOpts) {
      this.state.exportOpts = { ...this.state.exportOpts, ...obj.exportOpts };
    }

    this.state.calibStep = this.getNextCalibStep();
    this.state.tool = this.state.calibStep ? 'calibrate' : 'pick';
    this.state.selectedPoint = null;
    this.state.hoveredPoint = null;
    this._invalidateCalibCache();

    if (!skipSave) this.scheduleAutoSave();
    this.emit('imageLoaded');
    this.emit('state');
  }

  resetSession() {
    const keepTheme = this.state.theme;
    this.state = createInitialState();
    this.state.theme = keepTheme;
    this.undoStack = [];
    this.redoStack = [];
    this._invalidateCalibCache();
    this.clearAutoSave();
    this.emit('imageLoaded');
    this.emit('state');
  }
}

const store = new AppStore();

GR.state = {
  SERIES_PALETTE,
  nextId,
  store,
};
})(globalThis.GraphRev = globalThis.GraphRev || {});
