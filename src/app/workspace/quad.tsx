import { AREA, DIMENSIONS, MISSING, band, missingDimensions, type DimensionScores } from "@/lib/narrative";

/** The four-cell strip, and — when the score does not rest on all four — what it
 *  is missing. A student scored on two dimensions is still worth showing; hiding
 *  that it was two is what would mislead. */
export function Quad({ dimensions }: { dimensions: DimensionScores }) {
  const absent = missingDimensions(dimensions);
  const word = (d: (typeof DIMENSIONS)[number]) => {
    const v = dimensions[d];
    return v === undefined ? "veri yok" : v >= 60 ? "ciddi sorun" : v >= 30 ? "dikkat" : "sorun yok";
  };
  return <>
    <div className="quad" role="img"
      aria-label={DIMENSIONS.map(d => `${AREA[d]}: ${word(d)}`).join(", ")}>
      {DIMENSIONS.map(d => <i key={d} className={`cell ${band(dimensions[d])}`} />)}
    </div>
    {absent.length > 0 && <p className="note gap">
      {DIMENSIONS.length - absent.length}/{DIMENSIONS.length} alan ölçüldü ·{" "}
      {absent.map(d => MISSING[d]).join(" · ")}</p>}
  </>;
}

