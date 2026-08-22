/**
 * Deterministic coordination of two real database transactions.
 *
 * A race reproduced by launching two promises and hoping the scheduler
 * interleaves them is not a test — it passes or fails by luck, and a
 * green run proves nothing. The findings this harness exists to verify
 * all share one shape:
 *
 *     A reads state  →  B reads the same state  →  A commits  →  B commits
 *
 * Both transactions observe a pre-condition that is still true, and both
 * act on it. To demonstrate that reliably the interleaving has to be
 * imposed rather than awaited, so these helpers let one transaction park
 * at a chosen point until the other has reached a chosen point.
 */

/** A one-shot signal two transactions can wait on. */
export class Gate {
  private resolve!: () => void;
  private readonly promise: Promise<void>;
  private opened = false;

  constructor(private readonly name = "gate") {
    this.promise = new Promise<void>((r) => (this.resolve = r));
  }

  /** Release everyone waiting. Safe to call more than once. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.resolve();
  }

  /**
   * Block until `open()` is called. Rejects rather than hanging forever,
   * because a deadlocked harness is otherwise indistinguishable from a
   * slow one and eats the whole test timeout.
   */
  async wait(timeoutMs = 8_000): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const bail = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Gate "${this.name}" was never opened within ${timeoutMs}ms`)),
        timeoutMs
      );
    });
    try {
      await Promise.race([this.promise, bail]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export type InterleaveResult<A, B> = {
  first: PromiseSettledResult<A>;
  second: PromiseSettledResult<B>;
};

/**
 * Run two units of work with an imposed interleaving.
 *
 * `first` is started and runs until it opens `readsDone`, signalling that
 * it has read the state under test. `second` then starts and runs to
 * completion. Only then is `first` allowed to finish, so both acted on
 * the same snapshot — the exact ordering that exposes a read-outside-the-
 * transaction bug.
 *
 * Results come back settled rather than thrown: in most of these
 * scenarios one side is *expected* to fail, and which side that is, is
 * the assertion.
 */
export async function interleave<A, B>(
  first: (gates: { readsDone: Gate; mayCommit: Gate }) => Promise<A>,
  second: () => Promise<B>
): Promise<InterleaveResult<A, B>> {
  const readsDone = new Gate("readsDone");
  const mayCommit = new Gate("mayCommit");

  const firstRun = first({ readsDone, mayCommit });

  // Wait for the first transaction to reach its read point before the
  // second one starts, so the overlap is guaranteed rather than hoped for.
  await readsDone.wait();

  const secondRun = second();
  const secondSettled = await Promise.allSettled([secondRun]);

  // The second transaction is done; let the first proceed into its write.
  mayCommit.open();
  const firstSettled = await Promise.allSettled([firstRun]);

  return { first: firstSettled[0] as PromiseSettledResult<A>, second: secondSettled[0] as PromiseSettledResult<B> };
}

/**
 * Run N identical operations simultaneously.
 *
 * The blunter instrument, for "what happens if this endpoint is called
 * twice at once" without a specific interleaving in mind. Settled results
 * again, since partial failure is usually the point.
 */
export async function inParallel<T>(
  count: number,
  op: (index: number) => Promise<T>
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(Array.from({ length: count }, (_, i) => op(i)));
}
