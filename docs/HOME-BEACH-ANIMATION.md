# Homepage beach wave animation

## Reference and visual direction

The five still frames supplied in chat on 2026-10-12 show a stylized, high aerial/top-down shoreline. Deep blue water transitions through clear turquoise shallows to warm sand along a broad S-shaped beach edge. White surf breaks and retreats, with sunlight caustics, small underwater plants, and a small sailing skiff offshore. The boat is essentially stationary in the supplied sequence; this implementation leaves it as a static detail and animates the surf only.

The attached screenshots contain desktop UI and a small corner video mark. They were used only to understand the broad composition and motion; they are not embedded, cropped, traced, or edited into the app. The exact source-video frame rate, duration, and loop point cannot be inferred from stills, so the loop is an original approximation rather than a frame-accurate copy.

## Implementation

- `src/components/Home.tsx` is unchanged. It continues to place the existing `Ocean` background behind the same homepage controls.
- `src/components/Ocean.tsx` now uses an original generated aerial-beach background plate and draws a periodic shoreline run-up, soft water wash, foam crest/flecks, and shallow-water glints using the existing Canvas 2D approach.
- The skiff is part of the static illustration. Only waves move.
- The wave clock is deterministic and wraps every 14 seconds; all changing values use periodic functions, so the computed start/end pose is identical. The path is sampled in image coordinates and mapped with the same `object-fit: cover` scale/position as the background.
- Animation is capped at 30 painted frames per second, uses a Canvas backing-store DPR capped at 1.25, stops when the page is hidden or the hero is outside the viewport, and respects both the existing Home motion setting and `prefers-reduced-motion`.
- No video, network request, WebGL, new runtime package, screen capture, or homepage UI redesign was added.

## Asset source and rights notes

`assets/home-aerial-beach.jpg` is a new, original generated illustration created for this project on 2026-10-12. It was generated from a text description of general aerial tropical-beach elements; the supplied screenshots were not passed to the image generator. The asset is a local 1376×768 JPEG (163,557 bytes) with no embedded logo, watermark, text, or attribution metadata. No third-party stock photo or video is used by the active Home scene; no external-source attribution is applicable to this generated plate. The generation service's applicable terms still govern its use.

The former `assets/home-philippine-coast.jpg` is no longer referenced by `Ocean.tsx`. Its original provenance/license was not recorded in this repository; it is retained as an unused legacy file and should not be reused or redistributed as a licensed source without verification.

## Verification boundary

The pure loop/shore timing and cover-alignment math is covered by Node tests. The full suite passes 328 assertions; strict TypeScript typecheck and production build pass (Vite 7.3.2; 2,057 modules; 2,047.55 kB / 714.68 kB gzip). This does not prove perceived smoothness on every browser or a Windows laptop. No 8 GB Windows hardware benchmark, Android benchmark, or manual visual frame-by-frame acceptance is claimed. The hero Canvas backing store is approximately 5.3 MiB at 1440×620 CSS pixels and DPR 1.25, plus the small inline JPEG and ordinary browser/GPU surfaces; actual process/GPU memory varies by platform.
