import blackOriginalReconstruction from '../../assets/logo-history/carbon-1.0.0-black-reconstruction.svg?inline';
import primeDisplayMark from '../../assets/logo-history/carbon-prime-7.0.0cp-display.svg?inline';

const entries = [
  {
    key: '1.0.0',
    label: '1.0.0 · Initial release',
    art: blackOriginalReconstruction,
    alt: 'Black monochrome Carbon mark and wordmark reconstruction',
    note: 'Black monochrome reconstruction from the supplied art direction. The original archival logo file is not present in this checkout.',
  },
  {
    key: '7.0.0cp',
    label: '7.0.0cp · Carbon Prime',
    art: primeDisplayMark,
    alt: 'Carbon Prime mark with the 7.0.0cp About display label',
    note: 'Prime display label only. The bundled release registry records Carbon: Prime as 7.0.0; this does not change package, installer, or release metadata.',
  },
];

export default function PrimeLogoHistory() {
  return (
    <section className="w-full space-y-2 text-left" aria-labelledby="carbon-logo-history-title">
      <div>
        <h3 id="carbon-logo-history-title" className="text-xs font-semibold text-neutral-200">Logo history</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">Locally packaged SVG artwork; archival gaps are called out rather than filled with invented release marks.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <figure key={entry.key} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <img src={entry.art} alt={entry.alt} className="block aspect-[2.5/1] w-full rounded-md object-contain" />
            <figcaption className="mt-2">
              <h4 className="text-[10px] font-semibold text-neutral-200">{entry.label}</h4>
              <p className="mt-1 text-[9px] leading-relaxed text-neutral-500">{entry.note}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[10px] leading-relaxed text-amber-200">
        The available release data documents 1.0.0, 2.0.0 and 7.0.0. No verifiable release entries or historical logo assets for 3.0.0, 4.0.0 or 6.0.0 were found in this checkout, so those marks are withheld pending source documentation.
      </p>
    </section>
  );
}
