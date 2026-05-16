import {
  buildMaintenancePayload,
  convexRunJson,
  parseCommonOptions,
  redactFingerprintForOutput,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const options = parseCommonOptions();

const result = withMaintenanceToken(options, (token) =>
  convexRunJson(
    options,
    "stagingMaintenance:ensureStagingWorld",
    buildMaintenancePayload(options, token, {
      dryRun: options.dryRun,
    }),
  ),
);

console.log(
  JSON.stringify(
    {
      ok: result?.ok === true,
      dryRun: result?.dryRun === true,
      deploymentName: options.deploymentName,
      ownerEmail: options.ownerEmail,
      actions: result?.actions ?? [],
      fingerprint: redactFingerprintForOutput(result?.fingerprint),
    },
    null,
    2,
  ),
);
