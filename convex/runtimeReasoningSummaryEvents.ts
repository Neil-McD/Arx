type AppendRuntimeEvent = (event: {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
}) => Promise<void>;
