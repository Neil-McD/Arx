import assert from "node:assert/strict";

import {
  NativeProviderToolCallParseError,
  parseNativeProviderFunctionCallItem,
} from "../shared/nativeToolProviderParsers.ts";

function proveValidProviderFunctionCallParsing() {
  const parsed = parseNativeProviderFunctionCallItem({
    providerName: "ProofProvider",
    item: {
      type: "function_call",
      call_id: " call-1 ",
      name: " read ",
      arguments: ' {"path":"alpha.txt"} ',
    },
  });

  assert.deepEqual(parsed, {
    callId: "call-1",
    name: "read",
    arguments: '{"path":"alpha.txt"}',
  });

  console.log("PASS: native provider parser accepts complete function calls");
}

function proveMalformedProviderFunctionCallFailsClosed() {
  const malformedItems = [
    {
      type: "function_call",
      name: "read",
      arguments: '{"path":"alpha.txt"}',
    },
    {
      type: "function_call",
      call_id: "call-2",
      arguments: '{"path":"alpha.txt"}',
    },
    {
      type: "function_call",
      call_id: "call-3",
      name: "read",
    },
    {
      type: "function_call",
      call_id: "call-4",
      name: "read",
      arguments: "",
    },
  ];

  for (const item of malformedItems) {
    assert.throws(
      () =>
        parseNativeProviderFunctionCallItem({
          providerName: "ProofProvider",
          item,
        }),
      NativeProviderToolCallParseError,
    );
  }

  console.log("PASS: native provider parser rejects malformed function calls");
}

function proveMixedBatchCannotBePartiallyParsed() {
  const batch = [
    {
      type: "function_call",
      call_id: "valid-call",
      name: "list_dir",
      arguments: '{"path":"."}',
    },
    {
      type: "function_call",
      call_id: "malformed-call",
      name: "read",
    },
  ];

  assert.throws(
    () =>
      batch.map((item) =>
        parseNativeProviderFunctionCallItem({
          providerName: "ProofProvider",
          item,
        }),
      ),
    NativeProviderToolCallParseError,
  );

  console.log("PASS: native provider parser rejects mixed valid/malformed batches");
}

proveValidProviderFunctionCallParsing();
proveMalformedProviderFunctionCallFailsClosed();
proveMixedBatchCannotBePartiallyParsed();
