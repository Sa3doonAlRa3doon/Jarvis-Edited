import { FilesetResolver, HandLandmarker } from '/vendor/mediapipe/vision_bundle.mjs';

const connections = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y, (left.z || 0) - (right.z || 0)); }

export class GestureController {
  constructor({ video, canvas, cursor, onGesture = () => {}, onStatus = () => {} }) {
    this.video = video; this.canvas = canvas; this.cursor = cursor; this.onGesture = onGesture; this.onStatus = onStatus;
    this.landmarker = null; this.stream = null; this.raf = 0; this.lastVideoTime = -1; this.lastDetectionAt = 0; this.sensitivity = .42;
  }

  async load() {
    if (this.landmarker) return this.landmarker;
    this.onStatus('LOADING HAND MODEL');
    const vision = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: '/models/hand-landmarker/hand_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: .45, minHandPresenceConfidence: .45, minTrackingConfidence: .45
    });
    return this.landmarker;
  }

  async start({ deviceId = '', sensitivity = .42 } = {}) {
    await this.stop(); this.sensitivity = Number(sensitivity) || .42; await this.load();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
      audio: false
    });
    this.video.srcObject = this.stream; await this.video.play(); this.video.hidden = false; this.canvas.hidden = false;
    this.onStatus('GESTURE TRACKING'); this.loop();
  }

  draw(landmarks) {
    const context = this.canvas.getContext('2d'); const width = this.video.videoWidth || 640; const height = this.video.videoHeight || 480;
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    context.clearRect(0, 0, width, height); context.lineWidth = 2; context.strokeStyle = 'rgba(100,232,255,.8)'; context.fillStyle = '#f5bd5c';
    for (const hand of landmarks) {
      for (const [a, b] of connections) { context.beginPath(); context.moveTo((1 - hand[a].x) * width, hand[a].y * height); context.lineTo((1 - hand[b].x) * width, hand[b].y * height); context.stroke(); }
      for (const point of hand) { context.beginPath(); context.arc((1 - point.x) * width, point.y * height, 2.5, 0, Math.PI * 2); context.fill(); }
    }
  }

  loop = () => {
    if (!this.stream) return;
    const now = performance.now();
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime && now - this.lastDetectionAt >= 75) {
      this.lastVideoTime = this.video.currentTime; this.lastDetectionAt = now;
      const result = this.landmarker.detectForVideo(this.video, now); const hands = result.landmarks || []; this.draw(hands);
      if (hands.length) {
        const hand = hands[0]; const x = 1 - hand[8].x; const y = hand[8].y; const threshold = .035 + this.sensitivity * .085;
        const pinched = distance(hand[4], hand[8]) < threshold;
        let spread = 0;
        if (hands.length > 1) spread = distance(hands[0][9], hands[1][9]);
        this.cursor.hidden = false; this.cursor.classList.toggle('pinched', pinched); this.cursor.style.left = `${x * 100}%`; this.cursor.style.top = `${y * 100}%`;
        this.onGesture({ x, y, pinched, hands: hands.length, spread }); this.onStatus(pinched ? 'PINCH // GRAB' : `${hands.length} HAND${hands.length > 1 ? 'S' : ''} TRACKED`);
      } else { this.cursor.hidden = true; this.onStatus('SHOW HAND TO CAMERA'); }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  async stop() {
    cancelAnimationFrame(this.raf); this.raf = 0; this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video.hidden = true; }
    if (this.canvas) { this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height); this.canvas.hidden = true; }
    if (this.cursor) this.cursor.hidden = true;
    this.onStatus('GESTURE STANDBY');
  }

  get active() { return Boolean(this.stream); }
}
