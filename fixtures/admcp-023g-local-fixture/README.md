# ADMCP-023G Local Fixture

This static fixture is a reversible app-under-test for manual real-provider checks. Open `index.html` in a browser or WebView and scope the desktop automation session to that active window. The automated CI-safe ADMCP-023G test uses the mock desktop provider through the actual MCP stdio server process; this fixture is the manual real-window counterpart.

The fixture intentionally includes:

- same-label near misses (`Run` buttons in adjacent rows),
- transient dropdown highlight versus committed executable selection,
- delayed and no-op transitions,
- watched-source freshness pressure,
- multi-step checkpoint state,
- ask-required missing domain input,
- scope-exit pressure without navigating away automatically.

Fixture startup, browser launch, window focus, and cleanup stay outside the MCP server. Do not add dev-server startup, shell execution, arbitrary executable launch, hidden polling, OCR, or broad desktop authority to the server for this fixture.

Manual path:

1. Open `index.html` locally.
2. Focus the fixture window and verify its title contains `ADMCP-023G Local Fixture`.
3. Start the MCP server with the Windows active-window provider and explicit real gates needed for the check.
4. Use the documented loop: observe with images, inspect visual artifact, submit interaction evidence, move/click/type, observe transition, submit follow-up evidence.
5. Treat `BodySlide` highlighted in the open selector as transient. Click the row to commit it, observe the collapsed selector, then click `Run`.
6. Persist ADMCP artifacts after the run so a later reviewer can replay why the runner continued, repaired, asked, stopped, partially landed, or closed.
