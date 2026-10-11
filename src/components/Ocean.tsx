import { useEffect, useRef } from 'react';

/**
 * Cinematic animated ocean for the Carbon: Prime home screen.
 *
 * A peaceful late-morning sea (bright high sun, blue/teal water, gentle waves, sun glitter),
 * drawn procedurally with Canvas 2D — no WebGL requirement, no network, no weather service.
 *
 * Efficiency & fallback contract:
 *  - one canvas, device-pixel-ratio capped at 1.5, a handful of path fills per frame;
 *  - the loop pauses when the tab is hidden or the canvas scrolls out of view;
 *  - `prefers-reduced-motion: reduce` renders a single static frame;
 *  - if the 2D context cannot start, the CSS sky/sea gradient behind the canvas remains as
 *    the static fallback and nothing else breaks.
 */
export default function Ocean({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = cv.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return; // static CSS gradient fallback stays visible
    const g = ctx;

    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let running = false;
    let inView = true;
    let w = 0, h = 0;

    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) paint(perf(), 0); // keep the static frame correct on resize
    };

    const perf = () => performance.now() / 1000;

    // deterministic pseudo-random for glitter & clouds (stable across frames)
    const rnd = (i: number) => {
      const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    const paint = (t: number, dt: number) => {
      const horizon = h * 0.46;
      const sunX = w * 0.66, sunY = h * 0.20;

      // sky — bright, clear late morning
      const sky = g.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#5ea7dc');
      sky.addColorStop(0.55, '#8ec8ea');
      sky.addColorStop(1, '#d8eef8');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, horizon + 1);

      // high sun with a soft haze
      const glow = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(w, h) * 0.28);
      glow.addColorStop(0, 'rgba(255,252,235,0.95)');
      glow.addColorStop(0.08, 'rgba(255,250,225,0.55)');
      glow.addColorStop(0.35, 'rgba(255,250,230,0.16)');
      glow.addColorStop(1, 'rgba(255,250,230,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, w, horizon);
      g.fillStyle = 'rgba(255,255,248,0.98)';
      g.beginPath();
      g.arc(sunX, sunY, Math.max(9, w * 0.014), 0, Math.PI * 2);
      g.fill();

      // drifting cumulus — slow, few, calm
      const clouds = 4;
      for (let i = 0; i < clouds; i++) {
        const speed = 6 + rnd(i * 7) * 6;
        const span = w + 260;
        const cx = (((rnd(i * 3) * span) + t * speed) % span) - 130;
        const cy = h * (0.08 + rnd(i * 5) * 0.2);
        const s = (0.5 + rnd(i * 11) * 0.8) * Math.max(0.5, w / 1200);
        g.fillStyle = `rgba(255,255,255,${0.5 + rnd(i * 13) * 0.25})`;
        for (let b = 0; b < 5; b++) {
          const bx = cx + (b - 2) * 34 * s + Math.sin(t * 0.18 + i + b) * 3;
          const by = cy + Math.abs(b - 2) * 7 * s + Math.sin(t * 0.14 + i * 2 + b) * 2;
          const br = (26 - Math.abs(b - 2) * 6) * s;
          g.beginPath();
          g.ellipse(bx, by, br * 1.7, br, 0, 0, Math.PI * 2);
          g.fill();
        }
      }

      // atmospheric haze on the horizon line
      const haze = g.createLinearGradient(0, horizon - h * 0.06, 0, horizon + 2);
      haze.addColorStop(0, 'rgba(235,246,250,0)');
      haze.addColorStop(1, 'rgba(240,248,251,0.85)');
      g.fillStyle = haze;
      g.fillRect(0, horizon - h * 0.06, w, h * 0.06 + 2);

      // water — turquoise near the horizon, deep blue-teal toward the viewer
      const sea = g.createLinearGradient(0, horizon, 0, h);
      sea.addColorStop(0, '#79c6d6');
      sea.addColorStop(0.18, '#3f9db8');
      sea.addColorStop(0.55, '#1f7395');
      sea.addColorStop(1, '#12506e');
      g.fillStyle = sea;
      g.fillRect(0, horizon, w, h - horizon);

      // sky reflection down the sun path
      const refl = g.createLinearGradient(sunX, horizon, sunX, h);
      refl.addColorStop(0, 'rgba(255,250,225,0.30)');
      refl.addColorStop(0.5, 'rgba(255,250,225,0.10)');
      refl.addColorStop(1, 'rgba(255,250,225,0.02)');
      g.save();
      g.beginPath();
      g.moveTo(sunX - w * 0.16, horizon);
      g.lineTo(sunX + w * 0.16, horizon);
      g.lineTo(sunX + w * 0.34, h);
      g.lineTo(sunX - w * 0.34, h);
      g.closePath();
      g.clip();
      g.fillStyle = refl;
      g.fillRect(0, horizon, w, h - horizon);

      // sun glitter: shimmering dashes scattered along the reflection path
      const cols = 26;
      for (let i = 0; i < cols; i++) {
        const fy = horizon + (i / cols) * (h - horizon);
        const spread = w * (0.05 + ((fy - horizon) / (h - horizon)) * 0.30);
        const n = 4 + Math.floor(rnd(i * 17) * 4);
        for (let k = 0; k < n; k++) {
          const seed = i * 31 + k * 7;
          const gx = sunX + (rnd(seed) - 0.5) * 2 * spread;
          const tw = 0.5 + 0.5 * Math.sin(t * (1.2 + rnd(seed + 1) * 2.2) + rnd(seed + 2) * Math.PI * 2);
          if (tw <= 0.25) continue;
          const len = (2 + rnd(seed + 3) * 10) * (0.5 + (fy - horizon) / (h - horizon));
          g.strokeStyle = `rgba(255,251,230,${(0.10 + tw * 0.42) * (1 - (i / cols) * 0.35)})`;
          g.lineWidth = 1 + (fy - horizon) / (h - horizon) * 2.2;
          g.beginPath();
          g.moveTo(gx - len / 2, fy + Math.sin(t * 0.9 + seed) * 1.5);
          g.lineTo(gx + len / 2, fy + Math.sin(t * 0.9 + seed) * 1.5);
          g.stroke();
        }
      }
      g.restore();

      // gentle moving wave bands — amplitude and spacing grow toward the viewer
      const bands = 7;
      for (let i = 0; i < bands; i++) {
        const f = i / (bands - 1);
        const yBase = horizon + Math.pow(f, 1.35) * (h - horizon) * 0.96 + 4;
        const amp = (1.5 + f * 9) * Math.max(0.5, h / 420);
        const waveLen = w / (2.2 + f * 3.2);
        const speed = (0.25 + f * 0.7) * 22 * dt;
        const alpha = 0.05 + f * 0.13;
        g.beginPath();
        g.moveTo(0, yBase);
        const step = Math.max(6, w / 90);
        for (let x = 0; x <= w + step; x += step) {
          const y = yBase + Math.sin((x / waveLen) * Math.PI * 2 + t * (0.5 + f * 0.9) + i * 1.7) * amp
            + Math.sin((x / (waveLen * 0.37)) * Math.PI * 2 - t * (0.3 + f * 0.5)) * amp * 0.3;
          g.lineTo(x, y);
        }
        g.lineTo(w, h);
        g.lineTo(0, h);
        g.closePath();
        const crest = g.createLinearGradient(0, yBase - amp, 0, yBase + amp * 3);
        crest.addColorStop(0, `rgba(210,240,246,${alpha})`);
        crest.addColorStop(0.5, `rgba(126,199,215,${alpha * 0.8})`);
        crest.addColorStop(1, 'rgba(18,80,110,0)');
        g.fillStyle = crest;
        g.fill();
        // foam flecks on the strongest near crests
        if (i >= bands - 3) {
          g.fillStyle = `rgba(240,250,252,${0.10 + f * 0.16})`;
          for (let x = ((t * speed * 2) % (waveLen / 2)); x < w; x += waveLen / 2) {
            const y = yBase + Math.sin((x / waveLen) * Math.PI * 2 + t * (0.5 + f * 0.9) + i * 1.7) * amp;
            g.fillRect(x, y - amp * 0.6, 3 + f * 4, 1.2);
          }
        }
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!running || !inView) return;
      paint(perf(), 1 / 60);
    };

    const vis = () => { running = document.visibilityState === 'visible'; };
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { inView = es[0]?.isIntersecting !== false; }) : null;
    io?.observe(cv);

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    paint(perf(), 0); // first frame immediately (also the reduced-motion / static frame)
    if (!reduced) {
      document.addEventListener('visibilitychange', vis);
      running = document.visibilityState === 'visible';
      loop();
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{ background: 'linear-gradient(to bottom, #5ea7dc 0%, #8ec8ea 30%, #d8eef8 46%, #3f9db8 55%, #12506e 100%)' }}
    >
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}
