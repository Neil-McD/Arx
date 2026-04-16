export type NativeProviderFunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

export class NativeProviderToolCallParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeProviderToolCallParseError";
  }
}

export function parseNativeProviderFunctionCallItem(params: {
  item: Record<string, unknown>;
  providerName: string;
}): NativeProviderFunctionCall {
  const callId = typeof params.item.call_id === "string" ? params.item.call_id.trim() : "";
  const name = typeof params.item.name === "string" ? params.item.name.trim() : "";
  const argumentsText =
    typeof params.item.arguments === "string" ? params.item.arguments.trim() : "";

  if (!callId || !name || !argumentsText) {
    throw new NativeProviderToolCallParseError(
      `${params.providerName} returned an invalid native tool call.`,
    );
  }

  return {
    callId,
    name,
    arguments: argumentsText,
  };
}
