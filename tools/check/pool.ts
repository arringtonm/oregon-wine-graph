// Runs `work` over the items with at most `size` in flight at once
export async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await work(items[next++])
    }),
  )
}
