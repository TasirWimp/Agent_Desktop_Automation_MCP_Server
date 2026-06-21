import { randomUUID } from "node:crypto";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  automationActionTypes,
  evaluateAutomationPolicy
} from "./policy/automationPolicy.js";
import type { DesktopApplicationCatalog } from "./providers/applicationCatalog.js";
import {
  cursorObservationPacketSchema,
  intersectionSignalPacketSchema,
  semanticLocalizationPacketSchema
} from "./uiPlanning/closedLoopUiTypes.js";
import { buildUiIntersectionPlan } from "./uiPlanning/intersectionPolicy.js";
import type { DesktopInteractionProvider } from "./providers/desktopProvider.js";
import { createDefaultDesktopProvider } from "./providers/defaultDesktopProvider.js";
import { registerActionTools } from "./session/actionTools.js";
import { registerApplicationBootstrapTools } from "./session/applicationBootstrapTools.js";
import { registerClickCandidateWitnessTools } from "./session/clickCandidateWitnessTools.js";
import { registerObservationTools } from "./session/observationTools.js";
import { InMemoryDesktopSessionStore } from "./session/sessionStore.js";
import { registerSessionTools } from "./session/sessionTools.js";

const serverName = "agent-desktop-automation";
const serverVersion = "0.1.0";

export interface CreateServerOptions {
  sessionStore?: InMemoryDesktopSessionStore;
  desktopProvider?: DesktopInteractionProvider;
  applicationCatalog?: DesktopApplicationCatalog;
  now?: () => string;
  generateId?: (prefix: string) => string;
}

function jsonText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const sessionStore = options.sessionStore ?? new InMemoryDesktopSessionStore();
  const now = options.now ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? ((prefix: string) => `${prefix}-${randomUUID()}`);
  const desktopProvider = options.desktopProvider ?? createDefaultDesktopProvider();
  const desktopProviderCapabilities = desktopProvider.getCapabilities();
  const realDesktopClick =
    desktopProviderCapabilities.providerKind === "real" &&
    desktopProviderCapabilities.supportsClick &&
    desktopProviderCapabilities.realDesktopMutation;
  const realDesktopTyping =
    desktopProviderCapabilities.providerKind === "real" &&
    desktopProviderCapabilities.supportsTyping &&
    desktopProviderCapabilities.realDesktopMutation;
  const realDesktopApplicationLaunch =
    desktopProviderCapabilities.providerKind === "real" &&
    desktopProviderCapabilities.supportsApplicationLaunch &&
    desktopProviderCapabilities.realDesktopApplicationLaunch;
  const server = new McpServer({
    name: serverName,
    version: serverVersion
  });

  server.registerTool(
    "desktop_capabilities",
    {
      title: "Desktop Automation Capabilities",
      description: "Report the current desktop automation server capabilities and safety posture.",
      inputSchema: {}
    },
    async () =>
      jsonText({
        server: {
          name: serverName,
          version: serverVersion
        },
        runtime: {
          platform: process.platform,
          node: process.version
        },
        provider: desktopProviderCapabilities,
        capabilities: {
          observe: true,
          uiPlanning: true,
          interactionSessions: true,
          sessionLifecycleTools: true,
          sessionAuditLog: true,
          clickCandidateWitnessGate: true,
          compactRelationalClaims: true,
          semanticLandingAssessment: true,
          desktopOpenApplicationTool: true,
          applicationCatalogLaunchOnly: true,
          mockDesktopProvider: desktopProviderCapabilities.providerKind === "mock",
          mockDesktopMovement:
            desktopProviderCapabilities.providerKind === "mock" &&
            desktopProviderCapabilities.supportsMouse,
          mockDesktopClick:
            desktopProviderCapabilities.providerKind === "mock" &&
            desktopProviderCapabilities.supportsClick,
          mockDesktopTyping:
            desktopProviderCapabilities.providerKind === "mock" &&
            desktopProviderCapabilities.supportsTyping,
          executeDesktopActions: desktopProviderCapabilities.realDesktopMutation,
          closedLoopClickExecution: false,
          desktopObserveTool: true,
          desktopMoveMouseTool: true,
          desktopEvaluateClickCandidateTool: true,
          desktopClickTool: true,
          desktopTypeTextTool: true,
          postActionRepairClassification: true,
          realDesktopObservation: desktopProviderCapabilities.realDesktopCapture,
          realDesktopMouseMovement: desktopProviderCapabilities.realDesktopMouseMovement,
          realDesktopClick,
          realDesktopTyping,
          realDesktopApplicationLaunch,
          realDesktopMutation: desktopProviderCapabilities.realDesktopMutation,
          desktopMouseKeyboardTools:
            desktopProviderCapabilities.providerKind === "real" &&
            (desktopProviderCapabilities.supportsMouse ||
              desktopProviderCapabilities.supportsClick ||
              desktopProviderCapabilities.supportsTyping),
          shellCommands: false,
          credentialAccess: false
        },
        usageGuidance: {
          recommendedObservationCadence: {
            realWindowsProviderMaxObservationGapMs: 60_000,
            reason:
              "The real Windows provider can spend several seconds in capture, helper startup, and visual reasoning loops; a 5s freshness window is often too tight for observe -> move_mouse -> observe workflows.",
            appliesWhen: [
              "ADMCP_DESKTOP_PROVIDER=windows-active-window",
              "ADMCP_ENABLE_REAL_OBSERVATION=true",
              "ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true for movement probes",
              "ADMCP_ENABLE_REAL_CLICK=true for app-scoped real clicks",
              "ADMCP_ENABLE_REAL_TYPING=true for app-scoped generated test input"
            ],
            rule:
              "Use observationCadence.maxObservationGapMs=60000 for real-provider sessions unless the task explicitly needs a tighter bound; keep every observation/action bounded and audit every movement with a post-action observation."
          }
        },
        policy: {
          defaultMode: "policy_check_before_execution",
          highRiskActionsBlocked: ["credential_access", "shell_command", "system_change"],
          desktopStateChangesRequireConfirmation: [
            "open_application",
            "open_url",
            "file_operation",
            "keyboard_input",
            "mouse_input"
          ]
        }
      })
  );

  registerSessionTools(server, {
    sessionStore,
    now,
    generateId
  });

  registerApplicationBootstrapTools(server, {
    desktopProvider,
    now,
    catalog: options.applicationCatalog
  });

  registerObservationTools(server, {
    sessionStore,
    desktopProvider,
    now,
    generateId
  });

  registerActionTools(server, {
    sessionStore,
    desktopProvider,
    now,
    generateId
  });

  registerClickCandidateWitnessTools(server, {
    sessionStore,
    desktopProvider,
    now,
    generateId
  });

  server.registerTool(
    "automation_policy_check",
    {
      title: "Automation Policy Check",
      description:
        "Classify a proposed desktop automation action before any execution tool is used.",
      inputSchema: {
        actionType: z.enum(automationActionTypes),
        intent: z.string().min(1).max(1000),
        target: z.string().min(1).max(1000).optional()
      }
    },
    async ({ actionType, intent, target }) =>
      jsonText(
        evaluateAutomationPolicy({
          actionType,
          intent,
          target
        })
      )
  );

  server.registerTool(
    "ui_intersection_plan",
    {
      title: "UI Intersection Plan",
      description:
        "Build a read-only closed-loop UI planning packet from semantic localization and frame evidence. This tool does not move the mouse or click.",
      inputSchema: {
        semanticLocalizationPacket: semanticLocalizationPacketSchema,
        cursorObservationPacket: cursorObservationPacketSchema.optional(),
        intersectionSignalPacket: intersectionSignalPacketSchema.optional()
      }
    },
    async ({ semanticLocalizationPacket, cursorObservationPacket, intersectionSignalPacket }) =>
      jsonText(
        buildUiIntersectionPlan(
          semanticLocalizationPacket,
          cursorObservationPacket,
          intersectionSignalPacket
        )
      )
  );

  return server;
}
