function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unsupported indexer substate response");
  return value as Record<string, unknown>;
}

// Ootle 0.47 returns state.up or state.down. A down state is never usable
// account, payment or recovery data. The verified flag is an indexer assertion;
// this reader does not independently verify committee or Merkle proofs.
export function liveSubstate(value: unknown): Record<string, unknown> {
  const response = object(value),
    state = object(response.state);
  if (
    !Number.isSafeInteger(response.version) ||
    (response.version as number) < 0 ||
    typeof response.verified !== "boolean" ||
    Object.keys(state).length !== 1 ||
    !("up" in state)
  )
    throw new Error("Indexer substate is unavailable or no longer live");
  const up = object(state.up);
  if (Object.keys(up).length !== 1 || !("substate" in up))
    throw new Error("Unsupported live substate response");
  return object(up.substate);
}
