# Home Philippine-coast scene and wave loop

## Direction

The requested mood is a calm, nostalgic Philippine coast in daylight: pale sky, turquoise water, a lighthouse, gentle waves, and a small boat that stays still. The active illustration is `assets/home-philippine-coast-11am.jpg` (1376×768, 110,363 bytes). It includes a sandy cove, green headland, lighthouse and stationary skiff; it is used as the still backdrop, not as a video.

The supplied screenshots were used only as broad visual/motion references. They are not embedded, cropped or traced into the app, and they were not supplied to the image generator. The exact source-video frame rate and loop point cannot be inferred from stills, so the Canvas wave motion is an original, deterministic approximation.

## Implementation

- `src/components/Ocean.tsx` loads the locally bundled generated illustration behind the existing Home controls. The still boat remains part of that plate; only surf/water highlights animate.
- A Canvas 2D layer traces a sampled shoreline and renders a soft wash, moving run-up/foam crest, foam flecks and shallow-water glints. It makes no network request and uses no video or WebGL.
- The 14-second phase is periodic; `src/components/oceanMath.ts` contains the loop and image-cover math. The overlay uses the same cover transform as CSS `object-fit: cover` at `object-position: center 50%`.
- Painting is capped at 30 frames per second and DPR 1.25. The animation pauses when the page is hidden or hero is offscreen, respects the Home motion preference and `prefers-reduced-motion`, and supports disabling the Home scene.
- When animation is disabled, reduced or unavailable, the local still image and CSS gradient remain as static presentation. If Canvas 2D cannot be created, the scene still has its illustration/gradient fallback.

## Asset source and rights

The active plate is an original generated illustration created for this project on 2026-10-12 from a general text description. No third-party stock photo, video frame or user screenshot was used as the generated image input. It has no added branding or watermark. The generation service's applicable terms govern its use; this repository does not assert rights beyond that provenance.

`assets/home-aerial-beach.jpg` and `assets/home-philippine-coast.jpg` are not referenced by the active Home component. Their earlier provenance/license records differ or are incomplete; they are retained as legacy workspace files and should not be treated as active licensed sources.

## Verification boundary

Node tests exercise phase wrapping, shoreline surge continuity and image-cover alignment. Source-level typecheck/build checks exercise bundling, not the look of the full browser composition. The active plate has been inspected as a standalone image, but the rendered hero crop, overlay-to-shore alignment, perceived wave quality, reduced-motion view and representative viewport performance still need real-browser visual acceptance. No 8 GB Windows hardware or Android performance benchmark is claimed.
