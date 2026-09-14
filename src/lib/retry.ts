/** Waiting out a database that is briefly not there.
 *
 *  Supabase restarts PostgREST when the schema changes, and for a few seconds the
 *  gateway answers "Failed to get project config" instead of running the query.
 *  Every read on the agenda path goes through one helper, so a hiccup that lasts
 *  a second took down the agenda, the student list and the question screen at
 *  once — and told the reader to check their own connection.
 *
 *  Only errors the database did not decide are retried. A permission denial, a
 *  missing column, a failed constraint: those are answers, and asking again just
 *  postpones the truth by a second. An error with no SQLSTATE at all came from
 *  somewhere between us and Postgres, and is worth one more try. The one coded
 *  exception is a table the schema cache has not caught up with, which is the
 *  same restart seen from the other side.
 */
export type QueryError = { message: string; code?: string };

const RETRYABLE = new Set([
  "PGRST205",   // table not in the schema cache yet — a reload in progress
  "08000", "08003", "08006", "08001", "08004",   // connection exceptions
  "57P03"       // database starting up
]);
export const worthRetrying = (e: QueryError) => !e.code || RETRYABLE.has(e.code);

/** Two extra attempts, so a restart costs under a second rather than a page. */
const DELAYS = [200, 600];

export async function retrying<T>(
  run: () => PromiseLike<{ data: T | null; error: QueryError | null }>
): Promise<{ data: T | null; error: QueryError | null }> {
  let result = await run();
  for (const wait of DELAYS) {
    if (!result.error || !worthRetrying(result.error)) return result;
    await new Promise(resolve => setTimeout(resolve, wait));
    result = await run();
  }
  return result;
}
