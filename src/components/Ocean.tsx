import { useEffect, useRef } from 'react';
import coastPhoto from '../../assets/home-philippine-coast.jpg?inline';

interface OceanProps {
  className?: string;
  enabled?: boolean;
  motion?: boolean;
}

/**
 * Offline Philippine coast hero for the Carbon: Prime home screen.
 * The locally bundled photograph supplies the lighthouse and coastline; Canvas 2D adds
 * restrained moving reflections and wavelets. No network, WebGL, or weather service is used.
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
    if (!ctx) return; // The locally bundled still image and CSS gradient remain visible.

    const g = ctx;
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reduceQuery.matches;
    let visible = document.visibilityState === 'visible';
    let inView = true;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;

    const canAnimate = () => motion && !reduced;
    const now = () => performance.now() / 1000;
    const random = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    const paint = (t: number) => {
      g.clearRect(0, 0, width, height);
      image.style.transform = canAnimate()
        ? `translate3d(${Math.sin(t * 0.075) * width * 0.003}px, ${Math.cos(t * 0.06) * 1.2}px, 0) scale(1.035)`
        : 'translate3d(0, 0, 0) scale(1.035)';

      // The source image is framed wider on desktop; keep the shimmer on the visible sea.
      const seaStart = height * (width / height > 2.25 ? 0.67 : 0.56);
      const reflectionX = width * 0.43;
      g.save();
      g.globalCompositeOperation = 'screen';

      // Soft, low-contrast reflection dashes move gently toward the foreground.
      const rows = 15;
      for (let row = 0; row < rows; row++) {
        const depth = row / (rows - 1);
        const y = seaStart + Math.pow(depth, 1.35) * (height - seaStart) * 0.97;
        const spread = width * (0.025 + depth * 0.19);
        const dashes = 3 + Math.floor(depth * 3);
        for (let i = 0; i < dashes; i++) {
          const seed = row * 37 + i * 11;
          const x = reflectionX + (random(seed) - 0.5) * spread * 2;
          const phase = t * (0.75 + random(seed + 2) * 1.3) + random(seed + 3) * Math.PI * 2;
          const shimmer = 0.5 + 0.5 * Math.sin(phase);
          if (shimmer < 0.22) continue;
          const length = 2 + random(seed + 4) * (3 + depth * 11);
          g.strokeStyle = `rgba(238,252,247,${(0.035 + shimmer * 0.13) * (1 - depth * 0.2)})`;
          g.lineWidth = 0.7 + depth * 1.2;
          g.beginPath();
          g.moveTo(x - length / 2, y + Math.sin(t + seed) * 1.2);
          g.lineTo(x + length / 2, y + Math.sin(t + seed) * 1.2);
          g.stroke();
        }
      }

      // A few long, translucent wave contours add motion without obscuring the photograph.
      const step = Math.max(8, width / 110);
      for (let band = 0; band < 5; band++) {
        const depth = band / 4;
        const baseY = seaStart + height * (0.075 + depth * 0.23);
        const amplitude = 1.1 + depth * 2.8;
        const wavelength = Math.max(72, width / (1.8 + depth * 1.6));
        g.beginPath();
        for (let x = 0; x <= width + step; x += step) {
          const y = baseY
            + Math.sin((x / wavelength) * Math.PI * 2 + t * (0.5 + depth * 0.35) + band) * amplitude
            + Math.sin((x / (wavelength * 0.43)) * Math.PI * 2 - t * 0.27) * amplitude * 0.22;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = `rgba(222,249,244,${0.055 + depth * 0.045})`;
        g.lineWidth = 0.7 + depth * 0.8;
        g.stroke();
      }
      g.restore();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(1.4, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(canAnimate() ? now() : 0);
    };

    const frame = (timestamp: number) => {
      raf = 0;
      if (!canAnimate() || !visible || !inView) return;
      paint(timestamp / 1000);
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
      image.style.transform = 'none';
    };
  }, [enabled, motion]);

  return (
    <div
      className={`${className} pointer-events-none overflow-hidden`}
      aria-hidden="true"
      style={{
        background: enabled
          ? 'linear-gradient(165deg, #9ccfe4 0%, #67b8ca 52%, #13536b 100%)'
          : 'linear-gradient(145deg, #1b3a44 0%, #10252d 60%, #09171d 100%)',
      }}
    >
      {enabled && (
        <>
          <img
            ref={imageRef}
            src={coastPhoto}
            alt=""
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{ objectPosition: 'center 35%', transform: 'scale(1.035)', willChange: motion ? 'transform' : 'auto' }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(5,20,31,.18), rgba(4,25,35,.08) 42%, rgba(5,20,28,.24)), radial-gradient(ellipse at center, rgba(4,20,28,.23) 0%, rgba(4,20,28,.06) 66%, transparent 100%)',
            }}
          />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        </>
      )}
    </div>
  );
}
