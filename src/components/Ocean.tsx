import { useEffect, useRef } from 'react';
import beachPlate from '../../assets/home-aerial-beach.jpg?inline';
import { BEACH_LOOP_SECONDS, BEACH_MAX_DPR, beachLoopPhase, beachSurge, coverTransform } from './oceanMath';

interface OceanProps {
  className?: string;
  enabled?: boolean;
  motion?: boolean;
}

type Point = { x: number; y: number };
type ShoreSample = Point & { tx: number; ty: number; nx: number; ny: number; along: number };
type Cubic = [Point, Point, Point, Point];

// Normalized, image-space path along the original illustration's S-shaped waterline.
// The water lies to the upper-left of this path; beach run-up moves in the opposite direction.
const SHORE_CURVES: Cubic[] = [
  [{ x: 0.805, y: -0.07 }, { x: 0.790, y: 0.10 }, { x: 0.750, y: 0.245 }, { x: 0.680, y: 0.360 }],
  [{ x: 0.680, y: 0.360 }, { x: 0.615, y: 0.465 }, { x: 0.535, y: 0.565 }, { x: 0.445, y: 0.655 }],
  [{ x: 0.445, y: 0.655 }, { x: 0.350, y: 0.745 }, { x: 0.225, y: 0.815 }, { x: 0.105, y: 0.855 }],
  [{ x: 0.105, y: 0.855 }, { x: 0.000, y: 0.900 }, { x: -0.065, y: 0.965 }, { x: -0.170, y: 1.025 }],
];
const TAU = Math.PI * 2;
const imageCoord = (p: Point, width: number, height: number) => ({ x: p.x * width, y: p.y * height });

function makeShoreSamples(width: number, height: number): ShoreSample[] {
  const points: Array<Point & { distance: number }> = [];
  let distance = 0;
  let previous: Point | null = null;
  const steps = 64;
  for (const normalized of SHORE_CURVES) {
    const [p0n, p1n, p2n, p3n] = normalized;
    const [p0, p1, p2, p3] = [p0n, p1n, p2n, p3n].map((p) => imageCoord(p, width, height));
    for (let i = points.length ? 1 : 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x;
      const y = mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y;
      if (previous) distance += Math.hypot(x - previous.x, y - previous.y);
      points.push({ x, y, distance });
      previous = { x, y };
    }
  }
  const total = Math.max(distance, 1);
  return points.map((p, i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.max(Math.hypot(dx, dy), 1e-6);
    const tx = dx / length;
    const ty = dy / length;
    return { x: p.x, y: p.y, tx, ty, nx: -ty, ny: tx, along: p.distance / total };
  });
}

function strokeSamples(g: CanvasRenderingContext2D, points: ShoreSample[], offset: (p: ShoreSample) => number) {
  g.beginPath();
  points.forEach((p, i) => {
    const d = offset(p);
    const x = p.x - p.nx * d;
    const y = p.y - p.ny * d;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.stroke();
}

/**
 * Original aerial beach plate with a short, deterministic Canvas 2D surf loop.
 * It uses no video, network connection, WebGL, or additional runtime dependency.
 */
export default function Ocean({ className = '', enabled = true, motion = true }: OceanProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!enabled || !canvas || !image) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = canvas.getContext('2d', { alpha: true }); } catch { ctx = null; }
    if (!ctx) return; // The local illustration and CSS gradient remain visible.

    const g = ctx;
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reduceQuery.matches;
    let visible = document.visibilityState === 'visible';
    let inView = true;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let fitScale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let shore: ShoreSample[] = [];
    let raf = 0;
    let lastPaint = 0;

    const canAnimate = () => motion && !reduced;
    const now = () => performance.now();

    const paint = (timestamp: number) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (!image.naturalWidth || !image.naturalHeight || !shore.length) return;

      g.setTransform(dpr * fitScale, 0, 0, dpr * fitScale, dpr * offsetX, dpr * offsetY);
      const phase = beachLoopPhase(timestamp, BEACH_LOOP_SECONDS);
      const theta = phase * TAU;

      // A narrow transparent wash runs onto the sand and then returns to the same start pose.
      const waterEdge: Point[] = [];
      const landEdge: Point[] = [];
      for (const p of shore) {
        const surge = beachSurge(phase, p.along);
        const smallTide = Math.sin(theta + p.along * TAU * 2) * 0.9;
        const landward = 2.5 + surge * 8.5 + smallTide;
        waterEdge.push({ x: p.x + p.nx * 2.2, y: p.y + p.ny * 2.2 });
        landEdge.push({ x: p.x - p.nx * landward, y: p.y - p.ny * landward });
      }

      g.save();
      g.globalCompositeOperation = 'screen';
      g.beginPath();
      waterEdge.forEach((p, i) => { if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); });
      for (let i = landEdge.length - 1; i >= 0; i--) g.lineTo(landEdge[i].x, landEdge[i].y);
      g.closePath();
      g.fillStyle = 'rgba(219, 246, 237, 0.12)';
      g.fill();

      // Broad feathered surf, a bright crest, then a finer broken foam edge.
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.globalAlpha = 0.82;
      g.strokeStyle = 'rgba(239, 255, 249, 0.22)';
      g.lineWidth = 13;
      strokeSamples(g, shore, (p) => 2.5 + beachSurge(phase, p.along) * 8.5);
      g.globalAlpha = 0.78;
      g.strokeStyle = 'rgba(248, 255, 251, 0.48)';
      g.lineWidth = 4.4;
      strokeSamples(g, shore, (p) => 2.5 + beachSurge(phase, p.along) * 8.5);
      g.globalAlpha = 0.92;
      g.strokeStyle = 'rgba(255, 255, 250, 0.72)';
      g.lineWidth = 1.25;
      strokeSamples(g, shore, (p) => 2.5 + beachSurge(phase, p.along) * 8.5 + Math.sin(theta + p.along * TAU * 2) * 0.9);

      // Individual foam flecks vary along the shore but repeat exactly after one loop.
      for (let i = 3; i < shore.length - 2; i += 5) {
        const p = shore[i];
        const pulse = 0.5 + 0.5 * Math.sin(theta + i * 0.31);
        if (pulse < 0.24) continue;
        const offset = 3 + beachSurge(phase, p.along) * 8;
        const cx = p.x - p.nx * offset;
        const cy = p.y - p.ny * offset;
        const len = 2.5 + (i % 7) * 0.75;
        const alpha = 0.12 + pulse * 0.3;
        g.beginPath();
        g.moveTo(cx - p.tx * len, cy - p.ty * len);
        g.lineTo(cx + p.tx * len, cy + p.ty * len);
        g.strokeStyle = `rgba(255, 255, 250, ${alpha})`;
        g.lineWidth = 0.8 + pulse * 0.8;
        g.stroke();
      }

      // Small caustic glints drift in the shallows; all motion is periodic and seam-safe.
      for (let i = 5; i < shore.length; i += 11) {
        const p = shore[i];
        const pulse = 0.5 + 0.5 * Math.sin(theta + i * 0.47 + 1.2);
        if (pulse < 0.66) continue;
        const offset = 20 + (i % 9) * 4.5;
        const cx = p.x + p.nx * offset;
        const cy = p.y + p.ny * offset;
        const len = 2 + (i % 5) * 1.2;
        g.beginPath();
        g.moveTo(cx - p.tx * len, cy - p.ty * len);
        g.lineTo(cx + p.tx * len, cy + p.ty * len);
        g.strokeStyle = `rgba(255, 244, 194, ${(pulse - 0.62) * 0.55})`;
        g.lineWidth = 0.9;
        g.stroke();
      }
      g.restore();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(BEACH_MAX_DPR, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const imageWidth = image.naturalWidth || 1376;
      const imageHeight = image.naturalHeight || 768;
      const fitted = coverTransform(width, height, imageWidth, imageHeight, 0.5, 0.35);
      fitScale = fitted.scale;
      offsetX = fitted.x;
      offsetY = fitted.y;
      shore = makeShoreSamples(imageWidth, imageHeight);
      lastPaint = 0;
      paint(0);
    };

    const frame = (timestamp: number) => {
      raf = 0;
      if (!canAnimate() || !visible || !inView) return;
      if (!lastPaint || timestamp - lastPaint >= 1000 / 30) {
        paint(timestamp);
        lastPaint = timestamp;
      }
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const updateActivity = () => {
      if (canAnimate() && visible && inView) {
        if (!raf) raf = requestAnimationFrame(frame);
      } else {
        stop();
        paint(canAnimate() ? now() : 0);
      }
    };
    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      updateActivity();
    };
    const onReducedMotion = () => {
      reduced = reduceQuery.matches;
      updateActivity();
    };
    const intersection = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          inView = entries[0]?.isIntersecting !== false;
          updateActivity();
        })
      : null;

    resize();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
    } else window.addEventListener('resize', resize);
    intersection?.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    reduceQuery.addEventListener('change', onReducedMotion);
    image.addEventListener('load', resize);
    updateActivity();

    return () => {
      stop();
      resizeObserver?.disconnect();
      intersection?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      reduceQuery.removeEventListener('change', onReducedMotion);
      image.removeEventListener('load', resize);
    };
  }, [enabled, motion]);

  return (
    <div
      className={`${className} pointer-events-none overflow-hidden`}
      aria-hidden="true"
      style={{
        background: enabled
          ? 'linear-gradient(145deg, #0c4350 0%, #388b91 48%, #e7ca9a 100%)'
          : 'linear-gradient(145deg, #1b3a44 0%, #10252d 60%, #09171d 100%)',
      }}
    >
      {enabled && (
        <>
          <img
            ref={imageRef}
            src={beachPlate}
            alt=""
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{ objectPosition: 'center 35%' }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(5,20,31,.08), rgba(4,25,35,.02) 42%, rgba(5,20,28,.16)), radial-gradient(ellipse at center, rgba(4,20,28,.13) 0%, rgba(4,20,28,.035) 66%, transparent 100%)',
            }}
          />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        </>
      )}
    </div>
  );
}
