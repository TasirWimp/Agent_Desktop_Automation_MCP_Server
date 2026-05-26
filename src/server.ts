import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  automationActionTypes,
  evaluateAutomationPolicy
} from "./policy/automationPolicy.js";

const serverName = "agent-desktop-automation";
const serverVersion = "0.1.0";

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

export function createServer(): McpServer {
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
          executeDesktopActions: false,
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

  return server;
}
