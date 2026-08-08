import type { WorldEntity } from "./interpreter";

/**
 * Updates or inserts an entity/agent declaration inside a Loom code string.
 * If entityObj is null/undefined, the entity is removed from loomCode.
 */
export function updateEntityInLoomCode(
  loomCode: string,
  entityName: string,
  entityObj?: WorldEntity | null
): string {
  // If entity is removed
  if (!entityObj) {
    const pattern = new RegExp(`\\n?\\s*(?:persistent\\s+)?(?:entity|agent)\\s+${entityName}\\b\\s*\\{[^}]*\\}`, "g");
    return loomCode.replace(pattern, "");
  }

  // Format entity fields
  const fieldLines: string[] = [];
  for (const [k, v] of Object.entries(entityObj.fields)) {
    if (typeof v === "string") {
      fieldLines.push(`        ${k}: "${v}"`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      fieldLines.push(`        ${k}: ${v}`);
    }
  }

  if (entityObj.isAgent && entityObj.capabilities && entityObj.capabilities.length > 0) {
    const capsStr = entityObj.capabilities
      .map((c) => `${c.verb}${c.target ? " " + c.target : ""}`)
      .join(", ");
    fieldLines.push(`        can: ${capsStr}`);
  }

  const keyword = entityObj.isAgent ? "agent" : "entity";
  const newBlock = `    ${keyword} ${entityName} {\n${fieldLines.join(",\n")}\n    }`;

  const pattern = new RegExp(`(?:persistent\\s+)?(?:entity|agent)\\s+${entityName}\\b\\s*\\{[^}]*\\}`, "g");

  if (pattern.test(loomCode)) {
    return loomCode.replace(pattern, newBlock.trim());
  } else {
    // Insert into first world block
    const worldIndex = loomCode.indexOf("{");
    if (worldIndex !== -1) {
      return loomCode.slice(0, worldIndex + 1) + "\n\n" + newBlock + loomCode.slice(worldIndex + 1);
    } else {
      return `world MyWorld {\n${newBlock}\n}\n` + loomCode;
    }
  }
}
