import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { MockDesktopProvider } from "../../src/providers/mockDesktopProvider.js";
import type { DesktopApplicationCatalog } from "../../src/providers/applicationCatalog.js";

const fixedNow = "2026-06-21T10:00:00.000Z";

const catalog: DesktopApplicationCatalog = {
  applications: [
    {
      id: "zeiss_quality_suite",
      displayName: "ZEISS Quality Suite",
      aliases: ["quality suite", "zqs", "inspect xray"],
      windowsShortcutNames: ["ZEISS Quality Suite", "Quality Suite"],
      moduleHints: ["xray_inspection"]
    },
    {
      id: "generated_test_app",
      displayName: "Generated Test App",
      aliases: ["generated app"],
      windowsShortcutNames: ["Generated Test App"],
      moduleHints: ["fixture"]
    }
  ]
};

async function createConnectedClient() {
  const server = createServer({
    desktopProvider: new MockDesktopProvider(),
    applicationCatalog: catalog,
    now: () => fixedNow
  });
  const client = new Client({
    name: "desktop-open-application-test-client",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server
  };
}

function parseStructuredContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  return result.structuredContent as Record<string, unknown>;
}

describe("desktop_open_application", () => {
  it("launches a catalog application by alias through the provider", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_open_application",
        arguments: {
          applicationQuery: "generated app",
          userConfirmed: true,
          reason: "Start the fixture application."
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured).toMatchObject({
        status: "simulated_launch",
        applicationId: "generated_test_app",
        displayName: "Generated Test App",
        resolvedFrom: "alias",
        providerResult: {
          executed: true,
          simulated: true,
          applicationId: "generated_test_app"
        },
        recommendedNextStep: {
          tool: "desktop_start_interaction_session"
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks unknown app names and executable path queries", async () => {
    const { client, server } = await createConnectedClient();

    try {
      for (const applicationQuery of ["Unknown CAD Tool", "C:\\Windows\\notepad.exe"]) {
        const result = await client.callTool({
          name: "desktop_open_application",
          arguments: {
            applicationQuery,
            userConfirmed: true
          }
        });
        const structured = parseStructuredContent(result);

        expect(result.isError).toBe(true);
        expect(structured).toMatchObject({
          status: "blocked",
          policy: {
            decision: "unrecognized_application_query"
          },
          residue: ["No provider call was made and no application was launched."]
        });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects command-line argument fields instead of accepting launch arguments", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_open_application",
        arguments: {
          applicationId: "generated_test_app",
          userConfirmed: true,
          commandLineArguments: ["--unsafe"]
        }
      });

      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
