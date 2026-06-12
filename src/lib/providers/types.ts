export type SourceStatus = "seed" | "estimated" | "verified"

export interface Provider<TInput, TOutput> {
  name: string
  fetch(input: TInput): Promise<TOutput & { sourceStatus: SourceStatus }>
}

export interface CachedProvider<TInput, TOutput> extends Provider<TInput, TOutput> {
  invalidate(): Promise<void>
}
