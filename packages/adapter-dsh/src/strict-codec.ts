/**
 * Strict Typert codec shared by the adapter's Host and browser contributions.
 *
 * The two supported DeepSeek Harness lines validate the same codec field
 * differently: the `0.1.5` line requires a zod-backed `schema`, while the
 * `0.2.0` line requires a `create()` factory that materializes the schema on
 * first boundary use. Both checks ignore unrelated keys, so one artifact can
 * carry both forms and stay loadable on either line.
 */

/** Minimal runtime-schema capability carried by a strict codec. */
export interface StrictCodecSchema {
  parse(value: unknown): unknown
}

/**
 * Declare one strict Typert codec for every supported DeepSeek Harness line.
 * @param typeSymbol - stable identity of the boundary type.
 * @param schema - the schema instance every line validates values with.
 * @returns a frozen codec carrying the factory and the schema instance.
 */
export function strictCodec<Schema extends StrictCodecSchema>(
  typeSymbol: string,
  schema: Schema,
): Readonly<{
  mode: 'strict'
  typeSymbol: string
  create: () => Schema
  schema: Schema
}> {
  return Object.freeze({
    mode: 'strict' as const,
    typeSymbol,
    create: () => schema,
    schema,
  })
}
