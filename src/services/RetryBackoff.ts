import { Context, Duration, Effect, Layer, Schedule } from "effect";

export interface RetryBackoffOptions<E> {
  readonly initial: Duration.Input;
  readonly times: number;
  readonly while: (error: E) => boolean;
  readonly maxDelay?: Duration.Input;
}

export interface RetryBackoffService {
  /** Retry only safe, idempotent operations. Exhausted failures stay visible. */
  readonly retry: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: RetryBackoffOptions<E>,
  ) => Effect.Effect<A, E, R>;
}

export class RetryBackoff extends Context.Service<
  RetryBackoff,
  RetryBackoffService
>()("skill-maintenance/RetryBackoff") {
  static readonly layer = Layer.succeed(
    RetryBackoff,
    RetryBackoff.of({
      retry: (effect, options) =>
        effect.pipe(
          Effect.retry({
            times: options.times,
            while: options.while,
            schedule: Schedule.exponential(options.initial).pipe(
              Schedule.modifyDelay(({ duration }) =>
                Effect.succeed(
                  options.maxDelay
                    ? Duration.min(
                        duration,
                        Duration.fromInputUnsafe(options.maxDelay),
                      )
                    : duration,
                ),
              ),
            ),
          }),
        ),
    }),
  );
}
