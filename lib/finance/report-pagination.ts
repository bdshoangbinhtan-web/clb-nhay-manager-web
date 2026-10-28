type QueryError = { message: string };

export type PageResponse<T> = {
  data: T[] | null;
  error: QueryError | null;
};

/**
 * PostgREST's default max-rows limit is commonly 1,000. Yearly reports can
 * exceed it, so fetch all matching rows in stable, ordered pages instead of
 * silently underreporting financial totals.
 */
export async function loadAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResponse<T>>,
  pageSize = 500,
): Promise<PageResponse<T>> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const batch = result.data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) return { data: all, error: null };
  }
}
