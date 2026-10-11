// CARBON for Windows: release notes (bundled with the app, so they work offline).
//
// Maintenance rules
//  • Newest release first. The first entry MUST equal WINDOWS_VERSION in src/version.ts (checked by diagnostics).
//  • List only what actually shipped in that build. Do not add future/planned versions here.
//  • `date` is an ISO date (YYYY-MM-DD) set when the build is published. Leave it null if the date was not
//    recorded; the UI then says "Release date not recorded" instead of inventing one.
//  • category: 'major' (MAJOR bump), 'feature' (MINOR bump), 'patch' (PATCH bump).

export type ReleaseCategory = 'major' | 'feature' | 'patch';

export interface Release {
  version: string;
  /** Optional display suffix for this release identity, e.g. '+ls' (Local Storage). */
  suffix?: string;
  title: string;
  date: string | null;
  category: ReleaseCategory;
  summary: string;
  features: string[];
  improvements: string[];
  fixes: string[];
  compatibility?: string[];
  knownIssues?: string[];
}

export const RELEASES: Release[] = [
  {
    version: '7.0.0',
    suffix: '+ls',
    title: 'Carbon: Prime',
    date: '2026-10-11',
    category: 'major',
    summary: 'Carbon becomes Carbon: Prime 7.x+ls: a rebuilt home screen with a cinematic animated ocean, a true white-ground 3D drawing environment with direct camera control, and a repaired, verified build pipeline. Local Storage (+ls) remains the only storage: offline, no account, no cloud.',
    features: [
      'Carbon: Prime identity: consistent 7.0.0+ls release numbering across the app, About screen, release notes and packaging; the +ls suffix marks Local Storage builds. The Carbon name, mark and “Where all starts begin.” tagline are preserved.',
      'New Prime home screen with a cinematic animated ocean: calm blue-and-teal water, gentle moving waves, sun glitter and a bright late-morning sky. The scene is procedural Canvas 2D, pauses when the window is hidden, honours reduced-motion preferences, falls back to a static sky/sea if graphics fail, and never delays access to the tools.',
      'Every home destination is real: New Drawing, Open Project, Recent Projects, Import Artwork, Brush Studio, 3D Studio, Comics Studio, Carbon Library, Latest Patches, Settings and Help & About.',
      '3D Studio: White Ground environment. New scenes start on a genuine, flat, pure-white ground plane with a neutral background and a perspective grid that extends across the workspace and responds correctly to camera movement.',
      '3D Studio: dedicated Camera navigation tool. One-finger drag orbits on touch, two fingers pan, pinch zooms; mouse drag orbits in Camera mode, middle-drag pans, wheel zooms, Shift+wheel pans for trackpads. Drawing tools never move the camera by accident, and a mode indicator shows what input will do.',
      '3D Studio: new empty-scene default — no decorative starter cube — plus environment controls for ground visibility, ground color, subtle shadow display, grid spacing and camera field of view.',
      'Camera field of view (perspective strength) is adjustable and saved with the scene; existing saved views, camera reset and perspective/orthographic switching are unchanged.',
    ],
    improvements: [
      'The 3D render-to-layer and comic panel captures render the same white ground as the viewport, so captures match what you see.',
      'Legacy 2.0–2.2 scenes migrate to the white-ground environment automatically; their strokes, objects and camera stay exactly where they were.',
      'npm scripts gained typecheck and test; the Node test suite (npm test) covers version identity, scene migration, curve math, brush presets, color math and comic layout.',
    ],
    fixes: [
      'package.json was invalid JSON (a trailing comma), so npm install, the Electron packaging and every script failed before starting. The manifest is repaired and the build, typecheck and packaging scripts were verified.',
      'A stray unused import made tsc --noEmit fail (the repo’s own strictness rule) — the build is now clean under the repository’s TypeScript settings.',
      'The Windows packaging script now recognises “CARBON PRIME x.y.z” portable README files when archiving the previous build.',
    ],
    compatibility: [
      'Still .carbon format v1: 2.0–2.2 projects, comics, brush packs, palettes and scenes open unchanged; new scene fields are optional extension data that older versions ignore.',
      'The Android edition keeps its separate 1.0.0 version line, labels, configuration and build path — no Android file was modified in this release.',
    ],
    knownIssues: [
      'Drawing Replay still does not record 3D Studio edits (3D has its own undo), and symmetry is not applied to strokes drawn on object surfaces — carried forward from 2.2.0.',
      'Electron installers are produced by CI or on Windows; this source environment documents the exact commands instead of shipping unverified binaries.',
      'Pressure, palm rejection and trackpad-gesture behaviour still need manual verification on physical hardware.',
    ],
  },
  {
    version: '2.2.0',
    title: 'Connected Creative Studio',
    date: null,
    category: 'feature',
    summary: 'Spatial Ink Lab turns 3D Studio into a drawing-first space, and your 2D art, 3D scenes, comics, references and history are now connected within each project.',
    features: [
      'Spatial Ink Lab: draw editable 3D strokes on a visible depth plane, on the ground, front or side plane, on a custom tilted plane, or directly on object surfaces (surface strokes follow their object).',
      'Stroke editing: select strokes and individual control points, add or delete points, smooth, simplify, mirror and transform. Change thickness, taper, opacity and color, and switch between tube, ribbon, sweep, line and surface geometry while staying editable.',
      '3D symmetry: mirror across X, Y and Z, plus radial repetition (up to 16 copies) around a chosen axis and center, with live preview lines.',
      'Camera: front, back, left, right, top, bottom and isometric views, focus on selection, perspective or orthographic projection, and named saved views. Middle-drag orbits, Shift+middle-drag pans.',
      'Reference planes: place your 2D canvas or any image in the scene as a plane you can draw on.',
      'Carbon Continuum: rendered 3D layers stay linked to their scene and camera, with Return to scene, Recapture and missing-link detection. A Continuum panel lists every link in the project.',
      "Orbit-to-Comic: capture a 3D view into any comic panel. Each panel keeps its own camera, and Frame in 3D lets you adjust a single panel's camera and recapture it.",
      'Brush Fusion: build new brushes from the tip, texture, dynamics, scatter, color, wet media or overlay stamps of existing ones, with a live engine preview and clear incompatibility warnings.',
      'Palette Memory: generate palettes from images or your artwork, copy HEX and RGB values, and keep palette snapshots inside the project.',
      'Orbit Board: a zoomable reference workspace for images, artwork snapshots, notes, palettes, group frames and links to layers, 3D views, comic pages and panels, with broken-reference warnings.',
      'Creative Time Machine: named project snapshots, side-by-side comparison with a change heatmap, branches, and safe restore. A "before restore" snapshot is always kept first.',
    ],
    improvements: [
      "In 3D Studio, Ctrl+Z and Ctrl+Y now undo and redo 3D edits instead of the document's 2D history.",
      'Pressing [ and ] moves the 3D drawing plane. W, E and R switch gizmo modes and F focuses the selection.',
      'Every document now has a stable ID, so links, board references and history survive saving and reopening. Duplicates and branches get their own ID.',
      'The Windows packaging script keeps the previous portable build in release/windows/previous/ instead of overwriting it.',
    ],
    fixes: [
      'Zoom sharpness: the canvas always forced smoothing below 200% zoom, so the 2.0.0 sharpness fix never actually ran. It now uses exact pixels at 100%, 200% and 300%, high-quality filtering for fractional zoom (e.g. 125%/150% Windows scaling), and filtered reduction.',
      'The canvas stayed blurry after changing the Windows display scale or moving the window to another monitor. It now rebuilds at the new resolution.',
      'Ctrl+mouse wheel zoomed the entire interface instead of the canvas while the eyedropper, gradient, liquify or comic tools were active.',
      'Sampling a color into the Color Dock with its eyedropper did nothing: the sample was never added (shipped broken in 2.1.0).',
      "Removing a swatch in Color Studio didn't remove its name, so the Color Dock showed names next to the wrong colors.",
      'The 2.1.0 diagnostics for versioning and the Color Dock could not run (missing imports).',
      'Dropping a .carboncomic file onto the window was ignored.',
      'Duplicated documents and comic pages shared one identity.',
    ],
    compatibility: [
      'Still .carbon format v1, and 2.1.0 projects open unchanged. Scenes from 2.0 and 2.1 are migrated automatically (plane and symmetry settings carry over).',
      'New data (3D views and strokes, layer links, panel captures, board, palette memory) is optional extension data. 2.1.0 ignores it and still opens the 2D artwork.',
      'Time Machine snapshots are stored on this computer (IndexedDB), not inside .carbon files.',
      'The Android edition is versioned separately and was not changed.',
    ],
    knownIssues: [
      'Drawing Replay does not record 3D Studio edits or Orbit Board changes (3D and board have their own undo).',
      'A mouse has no depth: freehand 3D strokes are placed on the active plane or surface. Use [ and ] or the depth slider to move the plane.',
      'Symmetry is not applied to strokes drawn on object surfaces.',
      'Expensive filters on very large canvases run on the main thread and can pause the interface briefly when applied (previews are reduced-size).',
      'Recapturing a linked layer requires its scene document to be open.',
    ],
  },
  {
    version: '2.1.0',
    title: 'Color Dock & Latest Patches',
    date: null,
    category: 'feature',
    summary: 'Keep your working colors one click away beside the canvas, and see what changed in each release on the home screen.',
    features: [
      'Color Dock: a swatch strip outside the artwork canvas, placed left, right or below it. Turn it on or off in Settings → Canvas & Workspace → Color Dock.',
      'Add the current foreground color, type a HEX or R,G,B value, or sample a color straight from the canvas with the dock eyedropper.',
      'Click or tap a swatch to make it the foreground color. Drag swatches to reorder them, and use right-click (long-press on touch) to rename, replace, duplicate or delete.',
      'Multiple named global swatch sets (shared with Color Studio palettes) plus a project dock that is saved inside the .carbon file.',
      'Compact and expanded layouts, adjustable swatch size and optional color labels.',
      'Latest Patches on the home screen, with expandable details and a complete View All Updates history.',
    ],
    improvements: [
      'The version number is now kept in one place and shown consistently in About, the release notes, saved-file metadata and the Windows packaging script.',
      'Color Studio palettes can now store swatch names, which the Color Dock displays and edits.',
      'New "Canvas & Workspace" page in Preferences.',
    ],
    fixes: [
      'The Windows packaging script labelled builds 1.1.0 while the app reported 1.0. Both now report the same version.',
    ],
    compatibility: [
      'Projects saved by 2.1.0 still use .carbon format v1. The project Color Dock is stored as optional extension data, which older versions ignore.',
      'The Android edition is versioned separately and was not changed by this release.',
    ],
  },
  {
    version: '2.0.0',
    title: '3D Studio & Advanced Studio',
    date: null,
    category: 'major',
    summary: 'The first release after 1.0.0. It adds the drawing-first 3D Studio plus Comic Studio, Effects, an expanded brush ecosystem and advanced layers.',
    features: [
      '3D Studio: draw strokes on movable guide planes or onto object surfaces, edit Bézier curves, and turn curves into tubes, ribbons, swept profiles or surfaces.',
      '3D primitives (cube, sphere, cylinder, cone, plane, torus), material presets, ambient, directional and point lights with shadows, and painting on surfaces.',
      'Perspective and orthographic cameras with front, side, top and isometric views, focus on selection, render to a 2D layer, and GLB (glTF) export.',
      'Comic Studio: multi-page projects, page templates, bleed, trim and safe guides, and rectangle, polygon and freeform panels.',
      'Speech, thought, narration, shout, whisper and angular balloons with editable text, vertical lettering and connected balloons.',
      'Manga effects (speed and focus lines, impact, screen tones, gradients, hatching, sweat and shock marks) and PNG, ZIP and multi-page PDF export.',
      'Effects workspace: 26 filters with live preview, liquify (push, pull, expand, shrink, twirl, reconstruct) and a gradient tool with presets.',
      'Layer groups, clipping masks, paintable layer masks, reference layers, adjustment layers, merge visible and flatten a copy.',
      'Linear Burn and Linear Dodge (Add) blend modes.',
      'Brush Market: 19 installable packs from a local catalog, safe pack import, a library manager, 37 new core presets and 12 new tip shapes.',
      'HSL and RGB color entry, plus 11 curated palettes.',
    ],
    improvements: [
      'The canvas snaps to whole device pixels and switches between pixel-exact sampling when magnified and high-quality filtering when reduced.',
      'The eyedropper shows a magnifying loupe with the sampled swatch, HEX and RGB values, positioned clear of your finger or stylus.',
      'Filters, liquify, gradients, masks, comic objects and groups are all undoable and reproduced by Drawing Replay.',
    ],
    fixes: [
      'Artwork looked blurry between 100% and 200% zoom because of half-pixel resampling.',
      'The color being sampled by the eyedropper was hidden under the finger or stylus.',
    ],
    compatibility: [
      'Still .carbon format v1. Documents that use comic, group or adjustment layers cannot be opened by 1.0.0. Plain raster and Crisp Ink documents remain compatible.',
      '3D scenes and comic page data are stored as optional extension data.',
    ],
  },
  {
    version: '1.0.0',
    title: 'Initial release',
    date: null,
    category: 'major',
    summary: 'The first release of CARBON: a canvas-first 2D drawing studio.',
    features: [
      'Raster brush engine with about 115 distinct presets: pencils, inks, watercolor, pastel, paint, oil, airbrush, markers, textures and blenders.',
      'Crisp Ink: editable, variable-width vector strokes.',
      'Drawing Replay: records drawing sessions and plays them back step by step.',
      'Layers with blend modes, selections, transform, symmetry, text, shapes and fill.',
      'Color Studio, the Floating Tool Palette, dockable panels, document tabs, and native .carbon projects with autosave and recovery.',
    ],
    improvements: [],
    fixes: [],
  },
];

export const latestRelease = (): Release | null => RELEASES[0] || null;
