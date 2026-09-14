"use client";

/** The filter bar, submitting itself when a choice changes.
 *
 *  Picking a class and then reaching for a "Listeyi getir" button is one step
 *  too many for a bar somebody adjusts a dozen times an hour. The text search is
 *  left alone — it submits on Enter, because submitting per keystroke would
 *  reload the sheet under the user's fingers.
 */
export function Filters({ children }: { children: React.ReactNode }) {
  return <form className="panel filters" method="get"
    onChange={e => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement && el.type === "search") return;
      e.currentTarget.requestSubmit();
    }}>{children}</form>;
}
