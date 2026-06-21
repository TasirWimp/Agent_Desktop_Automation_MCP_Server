import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  loadDesktopApplicationCatalog,
  resolveDesktopApplication,
  type DesktopApplicationCatalog
} from "../providers/applicationCatalog.js";
import {
  DesktopProviderError,
  type DesktopInteractionProvider
} from "../providers/desktopProvider.js";

export interface ApplicationBootstrapToolRuntime {
  desktopProvider: DesktopInteractionProvider;
  now: () => string;
  catalog?: DesktopApplicationCatalog;
}

const openApplicationInputSchema = z
  .object({
    applicationId: z.string().min(1).max(200).optional(),
    applicationQuery: z.string().min(1).max(200).optional(),
    userConfirmed: z.boolean(),
    reason: z.string().min(1).max(1000).optional()
  })
  .strict()
  .superRefine((input, context) => {
    if (input.applicationId === undefined && input.applicationQuery === undefined) {
      context.addIssue({
        code: "custom",
        message: "Provide either applicationId or applicationQuery."
      });
    }
  });

function structuredResult(value: Record<string, unknown>, isError = false) {
  return {
    structuredContent: value,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    isError
  };
}

function recommendedLicensedAppScope(displayName: string) {
  return {
    description: `${displayName} is the user-declared reversible app-under-test for this task.`,
    scope: {
      kind: "active_window" as const
    },
    userDeclaredReversible: true,
    allowedActions: ["observe", "move_mouse", "click", "type_text"],
    forbiddenBoundaries: [
      "credential_or_secret_prompt",
      "payment_or_purchase",
      "external_message_or_email",
      "external_publish_or_deploy",
      "destructive_operation",
      "system_settings",
      "unrelated_private_window",
      "scope_exit"
    ],
    scopeExitStopConditions: ["outside_allowed_scope"]
  };
}

function providerErrorResult(error: unknown) {
  if (error instanceof DesktopProviderError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["No application launch was recorded.", ...error.residue]
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "application_bootstrap_error",
        message: error instanceof Error ? error.message : "Unknown application bootstrap error."
      },
      residue: ["No application launch was recorded."]
    },
    true
  );
}

export function registerApplicationBootstrapTools(
  server: McpServer,
  runtime: ApplicationBootstrapToolRuntime
): void {
  server.registerTool(
    "desktop_open_application",
    {
      title: "Desktop Open Catalog Application",
      description:
        "Open a catalog allowlisted desktop application as a bootstrap step. Accepts only catalog ids or aliases, never arbitrary executable paths or command-line arguments.",
      inputSchema: openApplicationInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      const catalog = runtime.catalog ?? loadDesktopApplicationCatalog();
      const resolvedById =
        input.applicationId === undefined
          ? undefined
          : resolveDesktopApplication(catalog, {
              applicationId: input.applicationId
            });
      const resolvedByQuery =
        input.applicationQuery === undefined
          ? undefined
          : resolveDesktopApplication(catalog, {
              applicationQuery: input.applicationQuery
            });

      if (!input.userConfirmed) {
        return structuredResult(
          {
            status: "blocked",
            applicationId: input.applicationId,
            applicationQuery: input.applicationQuery,
            policy: {
              decision: "requires_user_confirmation",
              reasons: [
                "Opening a desktop application is a state-changing bootstrap action and requires user confirmation."
              ]
            },
            residue: ["No provider call was made and no application was launched."]
          },
          true
        );
      }

      if (
        resolvedById !== undefined &&
        resolvedByQuery !== undefined &&
        resolvedById.definition.id !== resolvedByQuery.definition.id
      ) {
        return structuredResult(
          {
            status: "blocked",
            applicationId: input.applicationId,
            applicationQuery: input.applicationQuery,
            policy: {
              decision: "application_query_mismatch",
              reasons: [
                `The supplied applicationQuery resolved to ${resolvedByQuery.definition.id}, which does not match applicationId ${resolvedById.definition.id}.`
              ]
            },
            residue: ["No provider call was made and no application was launched."]
          },
          true
        );
      }

      const resolvedApplication = resolvedById ?? resolvedByQuery;

      if (resolvedApplication === undefined) {
        return structuredResult(
          {
            status: "blocked",
            applicationId: input.applicationId,
            applicationQuery: input.applicationQuery,
            policy: {
              decision: "unrecognized_application_query",
              reasons: [
                "The supplied app name did not match an allowlisted desktop application.",
                "Use a catalog application id or alias from config/desktop_applications.json."
              ]
            },
            residue: ["No provider call was made and no application was launched."]
          },
          true
        );
      }

      const providerCapabilities = runtime.desktopProvider.getCapabilities();

      if (
        providerCapabilities.supportsApplicationLaunch !== true ||
        runtime.desktopProvider.openApplication === undefined
      ) {
        return structuredResult(
          {
            status: "blocked",
            applicationId: resolvedApplication.definition.id,
            applicationQuery: input.applicationQuery,
            displayName: resolvedApplication.definition.displayName,
            resolvedFrom: resolvedApplication.resolvedFrom,
            providerCapabilities,
            residue: [
              "The active desktop provider does not support catalog application launch.",
              "No application was launched."
            ]
          },
          true
        );
      }

      try {
        const providerResult = await runtime.desktopProvider.openApplication({
          application: resolvedApplication.definition,
          requestedAt: runtime.now()
        });

        if (!providerResult.executed) {
          return structuredResult(
            {
              status: "blocked",
              applicationId: resolvedApplication.definition.id,
              applicationQuery: input.applicationQuery,
              displayName: providerResult.displayName,
              resolvedFrom: resolvedApplication.resolvedFrom,
              providerCapabilities,
              providerResult,
              residue: ["Provider call returned without launching the application."]
            },
            true
          );
        }

        return structuredResult({
          status: providerResult.simulated ? "simulated_launch" : "launched",
          applicationId: resolvedApplication.definition.id,
          applicationQuery: input.applicationQuery,
          displayName: providerResult.displayName,
          resolvedFrom: resolvedApplication.resolvedFrom,
          matchedValue: resolvedApplication.matchedValue,
          requestedAt: runtime.now(),
          reason: input.reason,
          providerCapabilities,
          providerResult,
          recommendedNextStep: {
            tool: "desktop_start_interaction_session",
            licensedAppScope: recommendedLicensedAppScope(
              resolvedApplication.definition.displayName
            ),
            residue: [
              "Start a bounded desktop interaction session after the app is visible and active.",
              "Call desktop_observe with includeImages=true immediately after session start to bind the active app scope."
            ]
          },
          residue: [
            "Catalog application bootstrap completed through the active provider.",
            "No arbitrary executable path, command-line argument, shell command, or broad desktop control was accepted."
          ]
        });
      } catch (error: unknown) {
        return providerErrorResult(error);
      }
    }
  );
}
