import { DocEngine } from '../engine/document';
import type { InkStroke } from '../engine/types';
import { ctxOf, uid } from '../engine/util';

const ink = (points: [number, number][], color = '#24474d', size = 3): InkStroke => ({
  id: uid('ink-'), pts: points.flatMap(([x, y]) => [x, y, 1]), color, size, opacity: 0.9, taperStart: 0, taperEnd: 0,
});

/** Create a bundled, deterministic, editable practice project without touching open documents or files. */
export function buildQuickStartSample(): DocEngine {
  const doc = new DocEngine(1200, 900, { name: 'CARBON Quick Start Sample', background: '#eaf7fa' });
  const sky = doc.active!;
  sky.name = 'Sky and turquoise water';
  const base = ctxOf(sky.canvas!);
  const sea = base.createLinearGradient(0, 360, 0, 900);
  sea.addColorStop(0, '#54d0d0'); sea.addColorStop(0.42, '#24aebd'); sea.addColorStop(1, '#08728e');
  base.fillStyle = sea;
  base.fillRect(0, 0, 1200, 900);
  const skyWash = base.createLinearGradient(0, 0, 0, 450);
  skyWash.addColorStop(0, '#83d3f2'); skyWash.addColorStop(0.74, '#d9f1ec'); skyWash.addColorStop(1, '#fff0cf');
  base.fillStyle = skyWash;
  base.fillRect(0, 0, 1200, 424);
  const sun = base.createRadialGradient(940, 150, 8, 940, 150, 105);
  sun.addColorStop(0, 'rgba(255,248,208,0.98)'); sun.addColorStop(0.4, 'rgba(255,239,178,0.62)'); sun.addColorStop(1, 'rgba(255,239,178,0)');
  base.fillStyle = sun; base.fillRect(820, 30, 240, 240);
  base.fillStyle = '#fff7d7'; base.beginPath(); base.arc(940, 150, 27, 0, Math.PI * 2); base.fill();
  base.strokeStyle = 'rgba(246,255,228,0.4)'; base.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const y = 450 + i * 31, x = (i * 149) % 970 + 22;
    base.beginPath(); base.moveTo(x, y); base.quadraticCurveTo(x + 35, y - 4, x + 75, y); base.stroke();
  }
  base.fillStyle = 'rgba(255,247,214,0.28)';
  for (let i = 0; i < 6; i++) base.fillRect(930 - i * 23, 435 + i * 31, 18 + i * 9, 2);

  const island = doc.makeLayer('raster', 'Island, lighthouse and palms');
  doc.layers.push(island);
  const c = ctxOf(island.canvas!);
  // Distant green islands establish a simple coastal horizon.
  c.fillStyle = '#5a9a82'; c.beginPath(); c.moveTo(0, 408); c.quadraticCurveTo(95, 365, 178, 400); c.quadraticCurveTo(265, 352, 350, 404); c.quadraticCurveTo(438, 374, 520, 410); c.lineTo(520, 442); c.lineTo(0, 442); c.closePath(); c.fill();
  c.fillStyle = '#317b70'; c.beginPath(); c.moveTo(0, 430); c.quadraticCurveTo(180, 398, 348, 430); c.quadraticCurveTo(458, 390, 575, 434); c.lineTo(575, 466); c.lineTo(0, 466); c.closePath(); c.fill();
  // Main headland and beach.
  c.fillStyle = '#1b7369'; c.beginPath(); c.moveTo(205, 900); c.quadraticCurveTo(245, 715, 420, 617); c.quadraticCurveTo(540, 528, 708, 544); c.quadraticCurveTo(856, 510, 1025, 604); c.quadraticCurveTo(1140, 675, 1200, 635); c.lineTo(1200, 900); c.closePath(); c.fill();
  c.fillStyle = '#2f9075'; c.beginPath(); c.moveTo(225, 900); c.quadraticCurveTo(340, 740, 502, 663); c.quadraticCurveTo(650, 595, 790, 610); c.quadraticCurveTo(935, 580, 1050, 655); c.quadraticCurveTo(1120, 715, 1200, 690); c.lineTo(1200, 900); c.closePath(); c.fill();
  c.fillStyle = '#d9c79b'; c.beginPath(); c.moveTo(230, 900); c.quadraticCurveTo(335, 785, 468, 729); c.quadraticCurveTo(578, 682, 690, 701); c.quadraticCurveTo(824, 716, 937, 686); c.quadraticCurveTo(1040, 665, 1140, 724); c.lineTo(1200, 770); c.lineTo(1200, 900); c.closePath(); c.fill();
  // Lighthouse: layered polygons keep the shapes editable as a separate paint layer.
  c.fillStyle = 'rgba(19,59,62,0.23)'; c.beginPath(); c.ellipse(790, 624, 102, 18, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f7f0d9'; c.beginPath(); c.moveTo(724, 622); c.lineTo(740, 341); c.lineTo(775, 310); c.lineTo(836, 310); c.lineTo(872, 622); c.closePath(); c.fill();
  c.fillStyle = '#d9dfcf'; c.beginPath(); c.moveTo(806, 310); c.lineTo(836, 310); c.lineTo(872, 622); c.lineTo(806, 622); c.closePath(); c.fill();
  c.fillStyle = '#d97853'; c.beginPath(); c.moveTo(734, 463); c.lineTo(858, 463); c.lineTo(862, 505); c.lineTo(731, 505); c.closePath(); c.fill();
  c.fillStyle = '#fff8e3'; c.beginPath(); c.moveTo(743, 354); c.lineTo(844, 354); c.lineTo(848, 382); c.lineTo(741, 382); c.closePath(); c.fill();
  c.fillStyle = '#345f68'; c.fillRect(766, 405, 17, 39); c.fillRect(812, 405, 17, 39);
  c.fillStyle = '#f0cf82'; c.fillRect(771, 410, 7, 29); c.fillRect(817, 410, 7, 29);
  c.fillStyle = '#f7f0d9'; c.fillRect(758, 290, 96, 24);
  c.fillStyle = '#284c55'; c.fillRect(766, 261, 80, 31); c.fillStyle = '#8ec6c4'; c.fillRect(777, 266, 58, 20);
  c.fillStyle = '#e37850'; c.beginPath(); c.moveTo(749, 261); c.lineTo(806, 218); c.lineTo(863, 261); c.closePath(); c.fill();
  c.fillStyle = '#f6d078'; c.fillRect(798, 199, 16, 20); c.fillStyle = 'rgba(255,240,174,0.5)'; c.beginPath(); c.moveTo(806, 204); c.lineTo(714, 245); c.lineTo(746, 262); c.closePath(); c.fill();
  // Small palms on the lee side of the headland.
  c.strokeStyle = '#5b5039'; c.lineWidth = 11; c.lineCap = 'round'; c.beginPath(); c.moveTo(1024, 697); c.quadraticCurveTo(1014, 631, 1041, 572); c.stroke();
  c.strokeStyle = '#355e4c'; c.lineWidth = 7;
  for (const [dx, dy] of [[-72, -24], [-62, -66], [-18, -83], [43, -66], [67, -28]] as [number, number][]) {
    c.beginPath(); c.moveTo(1041, 572); c.quadraticCurveTo(1041 + dx * 0.55, 554 + dy * 0.2, 1041 + dx, 572 + dy); c.stroke();
  }
  c.fillStyle = '#6a9b69'; c.beginPath(); c.arc(1041, 572, 13, 0, Math.PI * 2); c.fill();

  const details = doc.makeLayer('ink', 'Crisp Ink details');
  details.strokes = [
    ink([[724, 622], [740, 341], [775, 310], [836, 310], [872, 622]], '#315058', 4),
    ink([[741, 382], [848, 382]], '#315058', 3),
    ink([[731, 505], [862, 505]], '#9a5843', 3),
    ink([[758, 290], [854, 290], [854, 314], [758, 314]], '#315058', 3),
    ink([[766, 261], [749, 261], [806, 218], [863, 261], [846, 261]], '#315058', 3),
    ink([[777, 266], [835, 266], [835, 286], [777, 286]], '#315058', 2),
    ink([[1024, 697], [1014, 631], [1041, 572]], '#4c493b', 3),
    ink([[80, 488], [128, 484], [173, 489]], 'rgba(240,255,241,0.8)', 2),
    ink([[300, 552], [357, 547], [412, 550]], 'rgba(240,255,241,0.7)', 2),
    ink([[472, 472], [529, 469], [585, 473]], 'rgba(240,255,241,0.75)', 2),
  ];
  doc.layers.push(details);
  doc.activeLayerId = details.id;
  doc.dirty = false;
  doc.undoStack = [];
  doc.redoStack = [];
  return doc;
}

/** Always adds a fresh editable document. It never replaces, renames, or writes over existing work. */
export async function openQuickStartSample(): Promise<DocEngine | null> {
  const sample = buildQuickStartSample();
  const [{ addDoc }, { toast }, { deserializeDoc, serializeDoc }] = await Promise.all([
    import('./actions'), import('./store'), import('../engine/fileFormat'),
  ]);
  try {
    // Exercise the real .carbon serializer/loader in memory; no file is written or replaced.
    const bytes = await serializeDoc(sample, false);
    const doc = await deserializeDoc(bytes);
    doc.name = sample.name;
    doc.fileName = null;
    doc.fileHandle = null;
    doc.dirty = false;
    addDoc(doc);
    toast('Opened the offline .carbon sample as a new editable document. Your existing work was left unchanged.', 'success');
    return doc;
  } catch (e) {
    toast('Could not open the offline sample: ' + (e instanceof Error ? e.message : e), 'error');
    return null;
  }
}
