import { randomUUID } from "node:crypto";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  automationActionTypes,
  evaluateAutomationPolicy
} from "./policy/automationPolicy.js";
import {
  cursorObservationPacketSchema,
  intersectionSignalPacketSchema,
  semanticLocalizationPacketSchema
} from "./uiPlanning/closedLoopUiTypes.js";
import { buildUiIntersectionPlan } from "./uiPlanning/intersectionPolicy.js";
import type { DesktopInteractionProvider } from "./providers/desktopProvider.js";
import { MockDesktopProvider } from "./providers/mockDesktopProvider.js";
import { registerActionTools } from "./session/actionTools.js";
import { registerObservationTools } from "./session/observationTools.js";
import { InMemoryDesktopSessionStore } from "./session/sessionStore.js";
import { registerSessionTools } from "./session/sessionTools.js";

const serverName = "agent-desktop-automation";
const serverVersion = "0.1.0";

export interface CreateServerOptions {
  sessionStore?: InMemoryDesktopSessionStore;
  desktopProvider?: DesktopInteractionProvider;
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
  const desktopProvider = options.desktopProvider ?? new MockDesktopProvider();
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
        capabilities: {
          observe: true,
          uiPlanning: true,
          interactionSessions: true,
          sessionLifecycleTools: true,
          sessionAuditLog: true,
          mockDesktopProvider: true,
          mockDesktopMovement: true,
          mockDesktopClick: true,
          mockDesktopTyping: true,
          executeDesktopActions: false,
          closedLoopClickExecution: false,
          desktopObserveTool: true,
          desktopMoveMouseTool: true,
          desktopClickTool: true,
          desktopTypeTextTool: true,
          realDesktopObservation: false,
          realDesktopMutation: false,
          desktopMouseKeyboardTools: false,
          shellCommands: false,
          credentialAccess: false
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
