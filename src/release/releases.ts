// Carbon: Prime for Windows: release notes (bundled with the app, so they work offline).
//
// Maintenance rules
//  • Newest release first. The first entry MUST equal WINDOWS_VERSION in src/version.ts (checked by diagnostics).
//  • Include shipped notes or explicitly identified local source candidates; never present planned work as shipped.
//  • `status: 'candidate'` labels unpublished local source builds. For a published build, `date` is an ISO
//    date (YYYY-MM-DD); leave it null if unrecorded so the UI does not invent a release date.
//  • category: 'major' (MAJOR bump), 'feature' (MINOR bump), 'patch' (PATCH bump).

export type ReleaseCategory = 'major' | 'feature' | 'patch';

export interface Release {
  version: string;
  /** Explicitly marks a local/unpublished source candidate in the UI. */
  status?: 'candidate';
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
    version: '7.9.9',
    status: 'candidate',
    suffix: '+ls',
    title: 'Theme Studio',
    date: null,
    category: 'feature',
    summary: 'Unpublished Windows/desktop source candidate. Theme Studio adds categorized, searchable built-in themes, persistent custom themes and strict offline JSON import/export. The centralized tokens style interface chrome only; artwork, document colors, Carbon branding and the animated Home ocean remain unchanged.',
    features: [
      'Forty built-in themes are grouped into Classic, Ocean & Nature, Vibrant, Soft & Minimal, Professional Studio and Accessibility categories, with search, keyboard-operable selection and palette previews.',
      'Create, edit, duplicate, apply and confirm deletion of custom themes. Theme preference and custom definitions persist locally on this Windows/desktop installation.',
      'Import and export bounded, inert Carbon Theme Studio JSON schema v2; legacy v1 theme files are migrated. Exact fields, plain-text names, six-digit HEX tokens and contrast are validated; CSS, scripts and URLs are never executed.',
      'Twenty-five semantic UI tokens cover surfaces, canvas surround, toolbar/popovers/tooltips, text states, borders/dividers, accents, selection, focus and status colors. Text, selection, focus, status colors and borders are checked against contrast thresholds.',
    ],
    improvements: [
      'Theme selection applies immediately. Reset returns the interface to Carbon Prime without deleting custom themes.',
      'Themes affect interface components and selection chrome only; document pixels, canvas backgrounds, brushes, saved project data, the Home ocean animation and Carbon brand mark/accent are preserved.',
    ],
    fixes: [
      'Theme state is isolated from shared document settings and uses inert storage outside the Windows/desktop edition; Android source, version and build configuration are unchanged.',
      'Invalid, oversized, unsupported or low-contrast theme JSON is rejected before import and never interpreted as executable content.',
    ],
    compatibility: [
      'Windows/desktop identity is Carbon: Prime 7.9.9+ls. This is an unpublished local source candidate, not a published release.',
      'Theme preferences use a separate local-storage key and do not modify .carbon files, project metadata, brush colors or document palettes.',
      'The Android edition retains its separate CARBON 1.0.0 identity and existing build metadata; no Android version bump is included.',
    ],
    knownIssues: [
      'Automated tests and a web build do not prove Theme Studio visual behavior in Windows Electron, native download handling, Windows installer packaging, or every physical display configuration; manual Windows acceptance remains necessary.',
    ],
  },
  {
    version: '7.9.1',
    status: 'candidate',
    suffix: '+ls',
    title: 'Reliable local projects, focused workspace & deep zoom',
    date: null,
    category: 'feature',
    summary: 'Unpublished Windows/desktop source candidate. This build hardens local project persistence, restores the right-dock collapse control, moves replay actions to the Project Library, expands real selection modes, and raises Infinite Painter zoom precision. Platform acceptance is still required before publishing.',
    features: [
      'Local project saves are serialized per artwork, verified before commit, and written atomically through the Windows desktop bridge; save state distinguishes saving, saved, unsaved changes and failures.',
      'The Windows Project Library mirrors editable project archives to the local application profile and keeps Library cards synchronized with their saved project metadata.',
      'Project Library artwork actions include open/continue, rename, independent duplicate, export, details, confirmed delete, and replay playback when event history exists.',
      'Selection supports rectangle, ellipse, circle, freehand lasso and polygon lasso using the existing polygon-mask engine.',
      'The right dock has an accessible collapse/expand arrow that preserves its width and settings while allowing the canvas to grow.',
      'Infinite Painter keeps raster artwork at its original pixel resolution, renders Crisp Ink from vector paths, uses higher-precision input coordinates, and supports deeper viewport-only zoom.',
    ],
    improvements: [
      'Recording and playback controls are available from artwork in the Project Library rather than occupying the drawing status bar and dock.',
      'PNG, JPEG, SVG and recording-based MP4 exports use truthful content paths, explicit resolution/quality settings where supported, and destination selection in the Windows desktop app.',
      'Latest Patches continues to show published releases only; unpublished source candidates remain labeled in the complete archive.',
    ],
    fixes: [
      'Concurrent save paths no longer let an older project revision finish after and overwrite a newer revision.',
      'A failed write leaves the previous valid desktop project intact and keeps the current artwork marked unsaved or save-failed.',
      'The Windows Electron shell now exposes narrow, validated file-open/save IPC instead of relying on download handling for native project saves.',
    ],
    compatibility: [
      'Windows/desktop identity is Carbon: Prime 7.9.1+ls. This is an unpublished source candidate, not a published release.',
      'The .carbon archive format remains v1. Existing projects, layers, brushes, replay data and 3D scenes remain readable; no Android version or configuration bump is included.',
      'Raster artwork has finite source resolution. Vector paths can remain crisp, but textures, filters, compositing and embedded raster layers remain resolution-dependent.',
    ],
    knownIssues: [
      'Automated tests and a web build do not prove Windows Electron filesystem permissions, physical-device stylus pressure, real WebGL interactions, or visual selection/dock behavior; manual platform acceptance is required.',
      'MP4 export remains available only when genuine Drawing Replay data exists and the current runtime provides a real MP4 encoder. It does not invent a timeline for 3D scene edits.',
      'Windows installer packaging and application restart/recovery testing must be reported separately from source-level verification.',
    ],
  },
  {
    version: '7.8.7',
    status: 'candidate',
    suffix: '+ls',
    title: 'Infinite canvas, surface ink & local projects',
    date: null,
    category: 'feature',
    summary: 'Unpublished Windows/desktop source candidate. This increment adds a drawing-focused 3D workflow, a bounded ground that follows the camera target, an independent Infinite Painter creation path, an editable local Project Library, and format-aware external exports. The Node suite (388 assertions), strict TypeScript check, and single-file web build pass; browser/Electron interaction, a real pressure-capable stylus, and Windows packaging remain unverified.',
    features: [
      '3D freehand drawing builds a live brush-shaped preview from captured and coalesced pointer samples, preserves pressure, resolves plane coordinates with camera-ray intersection, and stores mesh-surface strokes in target-local space so they follow camera/object movement.',
      'Drawing-focused 3D removes the persistent grid, XYZ gizmo, and unrelated modeling controls from the working view while preserving dedicated orbit, pan, and zoom gestures and secondary scene tools.',
      'White Ground uses a small bounded visual patch recentered beneath the camera target; drawing coordinates still use a mathematical plane, avoiding huge ground geometry and arbitrary visual edges.',
      'Infinite Painter is available as a separate creation option. Each document remains an ordinary editable .carbon project with an independent identity; the standard Draw workspace is preserved.',
      'A Windows-only local Project Library saves editable documents without an export-folder prompt and supports opening/continuing, saving, renaming, independent duplication, confirmed removal, and external export.',
      'External export handles PNG and JPEG rendering, SVG as a valid SVG wrapper containing the lossless PNG rendering, and MP4 only from recorded 2D Drawing Replay events when an actual MP4 encoder is available. Unsupported MP4 output is reported instead of mislabeled or replaced with a still.',
    ],
    improvements: [
      'Home navigation waits for the internal Library save of clean or edited Windows documents; a canceled or failed save leaves the document open.',
      'Project Library navigation flushes the current editable project before leaving the studio, without conflating native project saving with external export.',
      'The Library uses a separate Windows-only IndexedDB database; the shared Android persistence schema and Android version line are not changed by the Library.',
    ],
    fixes: [
      'Parallel camera rays no longer resolve to a fabricated coplanar point; the drawing-plane helper returns no hit when there is no unique intersection.',
      'Closed strokes keep point and pressure samples aligned across the wrapped seam; flat brush dabs and pointer-pressure normalization have regression coverage.',
      'Library autosaving now keeps per-document session recovery independent of grouped Comic Library saves.',
    ],
    compatibility: [
      'Windows/desktop identity is Carbon: Prime 7.8.7+ls; this is a local unpublished source candidate, not a published release.',
      'The .carbon archive remains format v1. Existing Draw projects, layers, brushes and replay data remain editable; Infinite Painter is an optional document extension.',
      'Android remains separately identified as CARBON 1.0.0; its versionName/versionCode and Android project files are not bumped. Android runtime acceptance was not performed.',
      'No cloud upload, telemetry, screen/cursor/menu/idle capture, camera or microphone capture, AI drawing, generative fill, animation timeline, or Carbon: Flux integration is added.',
    ],
    knownIssues: [
      'Automated math/geometry tests do not prove real WebGL rendering, uninterrupted pen input, pressure reporting, surface attachment during camera movement, or orbit/pan/zoom behavior on Windows hardware; perform that manual acceptance before claiming release readiness.',
      'The browser-based Help → Run Diagnostics suite, Electron desktop launch, Windows installer, and Android build/device workflows were not run in this environment.',
      'MP4 depends on MediaRecorder providing a genuine MP4 encoder and the document containing Drawing Replay events. 3D scene edits have no replay timeline and are intentionally rejected.',
    ],
  },
  {
    version: '7.7.2',
    status: 'candidate',
    suffix: '+ls',
    title: 'One clear start, brush-first spatial ink',
    date: null,
    category: 'patch',
    summary: 'Unpublished Windows/desktop source candidate. It centralizes creation and document routing, adds a 2D-brush textured ribbon workflow to 3D Studio, restores the illustrated coast surf loop, and adds save-before-Home handling. Platform acceptance remains outstanding.',
    features: [
      'Create is the entry point for supported Draw, Comic Studio and 3D Studio documents; Orbit Board remains available as a workspace.',
      'Draw, Comic and 3D tabs resolve to their owning document type. Comic page tabs remain one .carboncomic project for save and normal close; explicit page deletion remains separate.',
      '3D Studio defaults to a compact spatial-ink workflow: Carbon 2D brush tips render onto genuine 3D ribbon geometry, pen pressure controls width, and surface strokes are stored in target-local coordinates. Tube/sweep geometry remains an advanced option.',
      'Home uses an offline illustrated Philippine-coast plate with a deterministic Canvas 2D wave loop; the skiff remains static. Motion controls, reduced-motion handling, visibility pausing and a static fallback remain available.',
      'The global Home action waits for the active Draw, Comic or 3D project save result; 3D Studio exposes the same action. Cancellation or a reported failure leaves the editor open.',
    ],
    improvements: [
      'Workspace switching and Save commands route to the correct active document instead of treating Comic/3D as relocatable workspace entries. Orbit Board is retained.',
      'Repeated identical Undo messages refresh one toast instead of stacking duplicates.',
      '3D strokes carry pressure samples through simplification and save brush identity/texture references with the scene data.',
    ],
    fixes: [
      'Separates Create from workspace switching and removes the relocated Comic/3D entries without removing Orbit Board.',
      'Normal Comic close now prompts for the complete project; deleting a page remains an explicit page-level action.',
      'Surface-ribbon centerlines use a small mesh offset so thin pressure/taper sections do not inherit an unnecessarily thick-tube lift.',
    ],
    compatibility: [
      'Windows/desktop package and display metadata use Carbon: Prime 7.7.2+ls. This is a local candidate, not a published release.',
      'Android remains separately versioned as CARBON 1.0.0; the Android versionName/versionCode are not changed by this Windows-only bump.',
      'No .carbon archive format version or runtime dependency version is intentionally changed. Existing local projects remain the save target.',
      'No cloud upload, remote asset fetch, screen/cursor/idle capture, camera scanning/permission, AI drawing, generative fill, assistant, animation timeline or Carbon: Flux integration is added.',
    ],
    knownIssues: [
      'Canvas/WebGL browser appearance and interaction have not been visually accepted. Node tests exercise geometry/math but do not prove textured-ribbon rendering on a real WebGL device.',
      'Windows packaging/installer and Android APK/device behavior have not been tested. Save-picker and native document-provider flows still require platform testing.',
      'Home reduced-motion/static-fallback and coastline alignment are implemented but still need a browser visual review on representative viewport sizes.',
      '3D edits are not part of the 2D Drawing Replay timeline. Mix/smudge/crisp-style brushes are represented by a deterministic ink mask on the spatial ribbon rather than replaying those 2D blend operations in 3D.',
    ],
  },
  {
    version: '7.6.0',
    status: 'candidate',
    suffix: '+ls',
    title: 'Drawing Replay that keeps its timing',
    date: null,
    category: 'feature',
    summary: 'Local Carbon: Prime 7.6.0+ls source candidate: preserve real pauses by default, capture terminal stroke input, improve local recovery, and expose recording controls from My Illustrations. This candidate is not published; platform acceptance is still pending.',
    features: [
      'Drawing Replay keeps the real time between recorded edits by default; optional pause shortening is an explicit preference. It stores document events and stroke samples, never idle frames, cursor/hand movement, menus, screen, microphone or camera.',
      'When enabled, recording starts for new drawings and projects opened without existing replay history. Completed edits schedule a local IndexedDB recovery save after a short quiet period, alongside the periodic and app-lifecycle sweeps.',
      'My Illustrations is available on Home and from File → My Illustrations while editing; browser-local recents and Android device files remain distinct. Project cards open playback and recording controls, and replay history can be deleted separately from artwork.',
      'Replay controls explicitly start, pause, resume or stop capture without deleting history; deleting replay data is a separately confirmed action that leaves artwork intact.',
      'Native .carbon saves/copies retain editable artwork and its event replay. Artwork image export remains flattened PNG, JPEG or WebP; replay video uses a platform-supported MediaRecorder WebM or MP4 type with the matching extension.',
      'Home uses an original generated aerial beach plate with a deterministic 14-second Canvas 2D surf loop; the boat and layout remain static. Reference screenshots/video are not embedded, and no runtime dependency was added.',
    ],
    improvements: [
      'Pointer-up and pointer-cancel paths keep the terminal position of raster and Crisp Ink strokes; pressure is not forced to zero at stylus release and sample times remain monotonic.',
      'Replay memory estimates now include full checkpoint canvas clones and conservative stroke-sample overhead, with settings/status describing the estimate rather than archive size.',
      'Session autosave records the revision it serialized and queues another pass if a document changes while it is being encoded.',
    ],
    fixes: [
      'Projects opened without replay history can now begin local recording when the preference is enabled; saved recordings are not duplicated by project save/export.',
      'Video output type and filename are derived from the encoder output instead of treating WebM as MP4 or promising an unsupported codec.',
    ],
    compatibility: [
      'Carbon: Prime remains on the 7.x+ls line. Android keeps its separate CARBON 1.0.0 identity and build numbering.',
      'No .carbon archive version or dependency version changed. Existing replay logs remain readable; time already shortened in older recordings cannot be recovered.',
      'No account, cloud upload, screen recording, AI drawing, generative fill, animation timeline or Carbon: Flux integration is added.',
    ],
    knownIssues: [
      'This is an unpublished source candidate. Node tests and the web build pass, but browser interaction, Windows runtime/installer, Android APK/device, QR image decode and video encoder acceptance are not complete.',
      'Drawing Replay covers the 2D document event engine; 3D Studio and Orbit Board edits are not part of this replay timeline.',
      'MP4 is available only where MediaRecorder reports and returns MP4; otherwise only supported WebM is offered or video export fails. The app does not transcode.',
      'Browser-local recent projects are not a full Windows filesystem scan. Android can list only the CARBON folder it can access; use Open for other device locations.',
    ],
  },
  {
    version: '7.5.1',
    status: 'candidate',
    suffix: '+ls',
    title: 'Brush assets and local creation tools',
    date: null,
    category: 'feature',
    summary: 'Local source candidate adding a real bundled brush marketplace/storage foundation, bounded Carbon QR brush sharing, and draft-based custom brush and eraser creation. It is not published; browser UI and platform acceptance are still outstanding.',
    features: [
      'Brush Marketplace keeps its bundled catalog available offline and reports when no optional remote catalog is configured; it does not invent online downloads, ratings or popularity.',
      'Brush Lab and Custom Eraser Studio edit an isolated draft through the real brush engine preview, then save custom brush presets and eraser tips separately in local app state.',
      'Brush QR sharing generates a compact PNG or text payload for a validated single brush; import scans a user-selected QR image locally without camera access, then selects the first imported brush for use. Arbitrary URLs are rejected and larger/stamped brushes use .carbonpack files.',
      'The Brush Library has an Imported Brushes section for standalone imports and pack-sourced brushes; a per-brush export-and-remove action preserves other pack contents and remaining IDs.'
    ],
    improvements: [
      'Validated brush pack bytes and metadata use a shared local asset store with download/install limits, storage estimates and separate input versus installed-size reporting.',
      'Brush pack import/export and QR parsing enforce size/format/metadata guards; custom stamp-image imports have a 300 KB cap and must decode before saving.',
      'Custom eraser presets are part of the persisted local brush model, can be selected only while Eraser is active, and are included in confirmed removal and export workflows.',
    ],
    fixes: [
      'Custom preset removal now asks for confirmation and cleans up active references, favorites, recent lists and collection memberships without modifying existing artwork.',
      'Legacy malformed or missing pack data is handled without silently discarding legacy brush definitions.',
    ],
    compatibility: [
      'No .carbon archive or manifest format change; existing artwork and document files are not rewritten by brush-asset operations.',
      'Carbon: Prime stays on the 7.x+ls line; Android retains its separate CARBON 1.0.0 identity.',
      'No account, cloud sync, telemetry, AI drawing or animation timeline is added. Remote marketplace hosting is optional and is not configured in this repository.',
    ],
    knownIssues: [
      'This source candidate has code-level tests only. QR image decoding, custom brush save/use flows and the UI have not received end-to-end browser or platform acceptance.',
      'Custom brush and eraser definitions remain in local app preferences; the unified asset manager and project illustration browser are still future work.',
    ],
  },
  {
    version: '7.1.1',
    status: 'candidate',
    suffix: '+ls',
    title: 'Project overview and attribution',
    date: null,
    category: 'patch',
    summary: 'Documentation-only local source candidate patch: the project README now describes Carbon: Prime, credits its developer, lists the languages and technologies, summarizes features, and explains the local-first app and build paths. Not published.',
    features: [],
    improvements: [
      'README now gives new users a product overview, developer attribution, programming-language summary, feature list, local-first architecture overview and platform-aware build instructions.',
    ],
    fixes: [],
    compatibility: [
      'No product-code, .carbon format or Android change is included in this documentation patch. Android remains separately identified as CARBON 1.0.0.',
    ],
    knownIssues: [
      'This 7.1.1+ls source candidate is not a published release; browser and platform acceptance gaps from 7.1.0+ls remain.',
    ],
  },
  {
    version: '7.1.0',
    status: 'candidate',
    suffix: '+ls',
    title: 'A more discoverable Carbon',
    date: null,
    category: 'feature',
    summary: 'Compatible local-first feature increment: find and pin projects, launch commands from Ctrl+K, learn with an offline guide and editable sample, and apply 3D symmetry directly to object surfaces. The source candidate is not a published release; Windows/Android runtime acceptance remains separate.',
    features: [
      'Home project finder searches browser-local recent projects and Android device files in separate sections; pins and sort preference are stored locally, with sorting by recent activity, name or size.',
      'Ctrl+K opens a searchable command palette for actions, tools, Windows workspaces, preferences and recent project files. Up/Down, Home/End, Enter and Escape support keyboard navigation; the shortcut is configurable.',
      'An optional, dismissible first-run guide works offline and includes an editable multi-layer sample project. Opening the sample always creates a fresh document and never replaces an existing file or open document.',
      '3D mirror and radial surface symmetry now ray-projects copies onto real visible mesh surfaces. Each full path must stay on one target surface; unmatched copies are skipped rather than left floating. Created curves remain separately editable and follow their parent objects.',
    ],
    improvements: [
      'New preferences backfill safely into existing Carbon settings without resetting prior shortcuts, home-scene choices or other stored preferences.',
      'Project pins use distinct browser-recent and Android-device keys, and removing a project from a list also clears its corresponding local pin.',
      'Surface strokes retain sampled surface normals through smoothing/simplification and transform those normals into target-local geometry space.',
    ],
    fixes: [
      'The 3D surface target previously ignored mirror and radial symmetry. Copies are now projected along transformed per-sample normals and omitted if no complete matching surface path exists.',
      'Symmetric surface strokes previously had no target mesh parent, leaving them as floating geometric copies. Every accepted copy now stores points in the hit mesh local space and is parented to that mesh.',
      'Live surface-symmetry preview geometry and materials are disposed when refreshed or cleared.',
    ],
    compatibility: [
      'No .carbon archive or manifest format change; existing projects, layers, scene data, brushes, comics and recovery data remain compatible.',
      'Carbon: Prime stays on 7.x+ls. Android keeps its separate CARBON 1.0.0 identity and build metadata; no Android version bump is implied.',
      'All four features use bundled code and existing local storage/files. No accounts, cloud services, telemetry, remote assets, AI drawing or animation timeline were added.',
    ],
    knownIssues: [
      'This local source candidate has code-level tests but still requires browser interaction/visual acceptance and separate Windows/Android runtime testing before any platform support claim or publication.',
    ],
  },
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

/** Candidates remain in the complete update archive but are never presented as a shipped Latest Patch. */
export const PUBLISHED_RELEASES = RELEASES.filter((release) => release.status !== 'candidate');

export const latestRelease = (): Release | null => RELEASES[0] || null;
