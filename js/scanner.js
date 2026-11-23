// Camera QR reader. Uses the browser's own BarcodeDetector where it exists; iPad/iPhone Safari has none,
// so the bundled ZXing reader (vendor/, runs on the device, never from a CDN) takes over.
const FORMATS = ['qr_code'];
let Detector = null;

async function getDetector() {
  if (Detector) return Detector;
  if ('BarcodeDetector' in window) {
    try {
      const have = await window.BarcodeDetector.getSupportedFormats();
      if (have.includes('qr_code')) return (Detector = new window.BarcodeDetector({ formats: FORMATS }));
    } catch { /* fall through to ZXing */ }
  }
  await new Promise((ok, bad) => {
    if (window.BarcodeDetectionAPI) return ok();
    const s = document.createElement('script');
    s.src = 'vendor/barcode-detector.js';
    s.onload = ok; s.onerror = () => bad(new Error('Scanner failed to load'));
    document.head.appendChild(s);
  });
  const api = window.BarcodeDetectionAPI;
  const wasm = new URL('vendor/zxing_reader.wasm', location.href).href;
  api.setZXingModuleOverrides({ locateFile: (p, prefix) => (p.endsWith('.wasm') ? wasm : prefix + p) });
  return (Detector = new api.BarcodeDetector({ formats: FORMATS }));
}

// Runs the camera in `video` and calls onCode(text) for each code it reads. The same code
// isn't reported again until it has been out of view for a moment. Returns { stop, ready }.
export function scan(video, onCode, { onStatus } = {}) {
  let stream = null, stopped = false, timer = 0, last = '', lastSeen = 0;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  };
  const ready = (async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser has no camera access');
    onStatus && onStatus('Starting camera…');
    const [det, st] = await Promise.all([
      getDetector(),
      navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }),
    ]);
    stream = st;
    if (stopped) return stop();
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    onStatus && onStatus('Point at a Slate label');
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const hits = await det.detect(video);
          const code = hits && hits[0] && hits[0].rawValue;
          const t = Date.now();
          if (code && (code !== last || t - lastSeen > 2500)) { last = code; onCode(code); }
          if (code) lastSeen = t;
        }
      } catch { /* a bad frame; keep going */ }
      timer = setTimeout(tick, 150);
    };
    tick();
  })();
  ready.catch(stop);
  return { stop, ready };
}
