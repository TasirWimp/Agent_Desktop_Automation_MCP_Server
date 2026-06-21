import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const desktopApplicationDefinitionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_:-]+$/u),
  displayName: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).default([]),
  windowsShortcutNames: z.array(z.string().min(1).max(200)).default([]),
  moduleHints: z.array(z.string().min(1).max(200)).default([])
});

export type DesktopApplicationDefinition = z.infer<
  typeof desktopApplicationDefinitionSchema
>;

export const desktopApplicationCatalogSchema = z.object({
  applications: z.array(desktopApplicationDefinitionSchema)
});

export type DesktopApplicationCatalog = z.infer<
  typeof desktopApplicationCatalogSchema
>;

export interface ResolvedDesktopApplication {
  definition: DesktopApplicationDefinition;
  resolvedFrom: "id" | "alias";
  matchedValue: string;
}

const defaultCatalogPath = join(process.cwd(), "config", "desktop_applications.json");

export function loadDesktopApplicationCatalog(
  catalogPath = process.env.ADMCP_DESKTOP_APPLICATION_CATALOG_PATH ?? defaultCatalogPath
): DesktopApplicationCatalog {
  const raw = readFileSync(catalogPath, "utf8");
  const catalog = desktopApplicationCatalogSchema.parse(JSON.parse(raw));

  validateDesktopApplicationCatalog(catalog);

  return catalog;
}

export function validateDesktopApplicationCatalog(
  catalog: DesktopApplicationCatalog
): void {
  const ids = new Set<string>();
  const aliases = new Map<string, string>();

  for (const application of catalog.applications) {
    const normalizedId = normalizeCatalogText(application.id);

    if (ids.has(normalizedId)) {
      throw new Error(`Duplicate desktop application id: ${application.id}.`);
    }

    ids.add(normalizedId);

    for (const alias of [
      application.displayName,
      application.id,
      ...application.aliases,
      ...application.windowsShortcutNames
    ]) {
      const normalizedAlias = normalizeCatalogText(alias);
      const existing = aliases.get(normalizedAlias);

      if (existing !== undefined && existing !== application.id) {
        throw new Error(
          `Ambiguous desktop application alias "${alias}" resolves to both ${existing} and ${application.id}.`
        );
      }

      aliases.set(normalizedAlias, application.id);
    }
  }
}

export function resolveDesktopApplication(
  catalog: DesktopApplicationCatalog,
  input: { applicationId?: string; applicationQuery?: string }
): ResolvedDesktopApplication | undefined {
  if (input.applicationId !== undefined) {
    const normalizedId = normalizeCatalogText(input.applicationId);
    const definition = catalog.applications.find(
      (application) => normalizeCatalogText(application.id) === normalizedId
    );

    return definition === undefined
      ? undefined
      : {
          definition,
          resolvedFrom: "id",
          matchedValue: input.applicationId
        };
  }

  if (input.applicationQuery === undefined) {
    return undefined;
  }

  const normalizedQuery = normalizeCatalogText(input.applicationQuery);
  const matches = catalog.applications.filter((application) =>
    applicationAliases(application).some((alias) => {
      const normalizedAlias = normalizeCatalogText(alias);
      return normalizedQuery === normalizedAlias;
    })
  );

  if (matches.length !== 1) {
    return undefined;
  }

  return {
    definition: matches[0],
    resolvedFrom: "alias",
    matchedValue: input.applicationQuery
  };
}

export function applicationAliases(
  application: DesktopApplicationDefinition
): string[] {
  return [
    application.id,
    application.displayName,
    ...application.aliases,
    ...application.windowsShortcutNames
  ];
}

export function normalizeCatalogText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/x[\s-]*ray/gu, "xray")
    .replace(/inspection/gu, "inspect")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
