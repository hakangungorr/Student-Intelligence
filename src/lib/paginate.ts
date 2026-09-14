import "server-only";
import { retrying, worthRetrying, type QueryError } from "@/lib/retry";

/** Reads every row of a query instead of the first page.
 *
 *  PostgREST caps a response at a configured maximum — 1000 rows by default —
 *  and says nothing when it truncates: the request succeeds and the missing rows
 *  simply are not there. Scoring an institution of 102 students read 1000 of
 *  their 1020 measurements and reported the last two as having no data at all.
 *
 *  Every read that grows with the roster has to page explicitly. A query that is
 *  small today is only small until the institution enrols another class.
 *
 *  Each page is also retried when the failure was not the database's decision;
 *  see lib/retry.ts for which failures qualify.
 */
const PAGE = 1000;

type Page<T> = { data: T[] | null; error: QueryError | null };
type Ranged<T> = { range(from: number, to: number): PromiseLike<Page<T>> };

export async function fetchAll<T>(make: () => Ranged<T>, whatFailed: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await retrying<T[]>(() => make().range(from, from + PAGE - 1));
    // Said in the reader's terms when the database was simply unreachable: the
    // raw gateway text is for the log, not for somebody looking at a blank screen.
    if (error) throw new Error(worthRetrying(error)
      ? `${whatFailed}: veritabanına ulaşılamadı (${error.message})`
      : `${whatFailed}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}
