// Runs pending-bill saves one after another in the background, in the order
// they were tapped, so a bill is always saved before its items. Retries once.
let chain: Promise<unknown> = Promise.resolve();

export function enqueuePendingSave(task: () => Promise<any>, onError?: (e: any) => void): Promise<void> {
  const run = async () => {
    try {
      await check(await task());
    } catch {
      await new Promise((r) => setTimeout(r, 800));
      await check(await task());
    }
  };
  const p = chain.then(run).catch((e) => { onError?.(e); });
  chain = p;
  return p;
}

function check(res: any) {
  const list = Array.isArray(res) ? res : [res];
  for (const r of list) {
    if (r && (r.success === false || r.error)) throw r.error ?? new Error('Save failed');
  }
}
