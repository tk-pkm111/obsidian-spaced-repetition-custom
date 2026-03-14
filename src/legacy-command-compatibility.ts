import type { DataAdapter } from "obsidian";

export const LEGACY_PLUGIN_IDS = ["obsidian-spaced-repetition"] as const;

export const FALLBACK_PLUGIN_COMMAND_SUFFIXES = [
    "srs-note-review-open-note",
    "srs-note-review-easy",
    "srs-note-review-good",
    "srs-note-review-hard",
    "srs-review-flashcards",
    "srs-cram-flashcards",
    "srs-review-flashcards-in-note",
    "srs-cram-flashcards-in-note",
    "srs-open-review-queue-view",
    "srs-convert-selection-to-flashcard",
] as const;

const HOTKEYS_FILE_PATH = "hotkeys.json";
const NOTE_TOOLBAR_FILE_PATH = "plugins/note-toolbar/data.json";

export interface InternalCommand {
    id: string;
    [key: string]: unknown;
}

export interface InternalCommandManager {
    commands?: Record<string, InternalCommand>;
}

export interface LegacyCommandConfigMigrationSummary {
    errors: string[];
    hotkeyCommandsMigrated: string[];
    noteToolbarCommandsMigrated: string[];
    updatedFiles: string[];
}

interface JsonMigrationResult {
    changed: boolean;
    migratedCommandIds: string[];
    nextValue: unknown;
}

interface JsonFileMigrationResult {
    error?: string;
    migratedCommandIds: string[];
    updated: boolean;
}

export function getPluginCommandSuffixes(
    commandManager: InternalCommandManager | undefined,
    currentPluginId: string,
    fallbackCommandSuffixes: readonly string[] = FALLBACK_PLUGIN_COMMAND_SUFFIXES,
): string[] {
    const commandPrefix = `${currentPluginId}:`;
    const registeredCommandIds = Object.keys(commandManager?.commands ?? {})
        .filter((commandId) => commandId.startsWith(commandPrefix))
        .map((commandId) => commandId.slice(commandPrefix.length));

    if (registeredCommandIds.length > 0) {
        return [...new Set(registeredCommandIds)];
    }

    return [...fallbackCommandSuffixes];
}

export function buildLegacyCommandIdMap(
    currentPluginId: string,
    commandSuffixes: readonly string[],
    legacyPluginIds: readonly string[] = LEGACY_PLUGIN_IDS,
): Record<string, string> {
    const legacyCommandIdMap: Record<string, string> = {};

    for (const commandSuffix of commandSuffixes) {
        const normalizedCommandSuffix = commandSuffix.trim();
        if (!normalizedCommandSuffix) {
            continue;
        }

        const currentCommandId = `${currentPluginId}:${normalizedCommandSuffix}`;
        for (const legacyPluginId of legacyPluginIds) {
            if (legacyPluginId === currentPluginId) {
                continue;
            }

            legacyCommandIdMap[`${legacyPluginId}:${normalizedCommandSuffix}`] = currentCommandId;
        }
    }

    return legacyCommandIdMap;
}

export function registerLegacyCommandAliases(
    commandManager: InternalCommandManager | undefined,
    legacyCommandIdMap: Record<string, string>,
): string[] {
    const commands = commandManager?.commands;
    if (!commands) {
        return [];
    }

    const registeredAliasIds: string[] = [];

    for (const [legacyCommandId, currentCommandId] of Object.entries(legacyCommandIdMap)) {
        if (commands[legacyCommandId] !== undefined) {
            continue;
        }

        const currentCommand = commands[currentCommandId];
        if (!currentCommand) {
            continue;
        }

        commands[legacyCommandId] = {
            ...currentCommand,
            id: legacyCommandId,
        };
        registeredAliasIds.push(legacyCommandId);
    }

    return registeredAliasIds;
}

export function unregisterLegacyCommandAliases(
    commandManager: InternalCommandManager | undefined,
    legacyCommandIds: readonly string[],
): void {
    const commands = commandManager?.commands;
    if (!commands) {
        return;
    }

    for (const legacyCommandId of legacyCommandIds) {
        delete commands[legacyCommandId];
    }
}

export async function migrateLegacyCommandConfigs(
    adapter: DataAdapter,
    configDir: string,
    legacyCommandIdMap: Record<string, string>,
): Promise<LegacyCommandConfigMigrationSummary> {
    const summary: LegacyCommandConfigMigrationSummary = {
        errors: [],
        hotkeyCommandsMigrated: [],
        noteToolbarCommandsMigrated: [],
        updatedFiles: [],
    };

    const hotkeysPath = joinConfigPath(configDir, HOTKEYS_FILE_PATH);
    const hotkeysResult = await migrateJsonFile(adapter, hotkeysPath, (value) =>
        migrateHotkeyConfig(value, legacyCommandIdMap),
    );
    if (hotkeysResult.error) {
        summary.errors.push(hotkeysResult.error);
    } else if (hotkeysResult.updated) {
        summary.hotkeyCommandsMigrated = hotkeysResult.migratedCommandIds;
        summary.updatedFiles.push(hotkeysPath);
    }

    const noteToolbarPath = joinConfigPath(configDir, NOTE_TOOLBAR_FILE_PATH);
    const noteToolbarResult = await migrateJsonFile(adapter, noteToolbarPath, (value) =>
        migrateNoteToolbarConfig(value, legacyCommandIdMap),
    );
    if (noteToolbarResult.error) {
        summary.errors.push(noteToolbarResult.error);
    } else if (noteToolbarResult.updated) {
        summary.noteToolbarCommandsMigrated = noteToolbarResult.migratedCommandIds;
        summary.updatedFiles.push(noteToolbarPath);
    }

    return summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinConfigPath(configDir: string, relativePath: string): string {
    return `${configDir.replace(/\/+$/, "")}/${relativePath}`;
}

function mergeHotkeyBindings(existingBindings: unknown, incomingBindings: unknown): unknown {
    if (!Array.isArray(existingBindings) || !Array.isArray(incomingBindings)) {
        return existingBindings;
    }

    const mergedBindings = [...existingBindings];
    const seenBindings = new Set(existingBindings.map((binding) => JSON.stringify(binding)));

    for (const binding of incomingBindings) {
        const key = JSON.stringify(binding);
        if (seenBindings.has(key)) {
            continue;
        }

        seenBindings.add(key);
        mergedBindings.push(binding);
    }

    return mergedBindings;
}

function migrateHotkeyConfig(
    value: unknown,
    legacyCommandIdMap: Record<string, string>,
): JsonMigrationResult {
    if (!isRecord(value)) {
        return { changed: false, migratedCommandIds: [], nextValue: value };
    }

    const nextValue: Record<string, unknown> = { ...value };
    const migratedCommandIds: string[] = [];
    let changed = false;

    for (const [legacyCommandId, currentCommandId] of Object.entries(legacyCommandIdMap)) {
        if (!(legacyCommandId in nextValue)) {
            continue;
        }

        const legacyBindings = nextValue[legacyCommandId];
        delete nextValue[legacyCommandId];

        if (currentCommandId in nextValue) {
            nextValue[currentCommandId] = mergeHotkeyBindings(
                nextValue[currentCommandId],
                legacyBindings,
            );
        } else {
            nextValue[currentCommandId] = legacyBindings;
        }

        migratedCommandIds.push(legacyCommandId);
        changed = true;
    }

    return { changed, migratedCommandIds, nextValue };
}

function migrateNoteToolbarConfig(
    value: unknown,
    legacyCommandIdMap: Record<string, string>,
): JsonMigrationResult {
    const migratedCommandIds = new Set<string>();
    const changed = replaceNoteToolbarCommandIds(value, legacyCommandIdMap, migratedCommandIds);

    return {
        changed,
        migratedCommandIds: [...migratedCommandIds],
        nextValue: value,
    };
}

function replaceNoteToolbarCommandIds(
    value: unknown,
    legacyCommandIdMap: Record<string, string>,
    migratedCommandIds: Set<string>,
): boolean {
    if (Array.isArray(value)) {
        let changed = false;
        for (const nestedValue of value) {
            changed = replaceNoteToolbarCommandIds(
                nestedValue,
                legacyCommandIdMap,
                migratedCommandIds,
            ) || changed;
        }
        return changed;
    }

    if (!isRecord(value)) {
        return false;
    }

    let changed = false;

    if (typeof value.commandId === "string" && legacyCommandIdMap[value.commandId] !== undefined) {
        migratedCommandIds.add(value.commandId);
        value.commandId = legacyCommandIdMap[value.commandId];
        changed = true;
    }

    for (const nestedValue of Object.values(value)) {
        changed = replaceNoteToolbarCommandIds(
            nestedValue,
            legacyCommandIdMap,
            migratedCommandIds,
        ) || changed;
    }

    return changed;
}

async function migrateJsonFile(
    adapter: DataAdapter,
    path: string,
    migrateValue: (value: unknown) => JsonMigrationResult,
): Promise<JsonFileMigrationResult> {
    if (!(await adapter.exists(path))) {
        return { migratedCommandIds: [], updated: false };
    }

    try {
        const rawJson = await adapter.read(path);
        const parsedValue = JSON.parse(rawJson) as unknown;
        const migrationResult = migrateValue(parsedValue);

        if (!migrationResult.changed) {
            return { migratedCommandIds: [], updated: false };
        }

        await adapter.write(path, `${JSON.stringify(migrationResult.nextValue, null, 2)}\n`);
        return {
            migratedCommandIds: migrationResult.migratedCommandIds,
            updated: true,
        };
    } catch (error) {
        return {
            error: `Failed to migrate legacy command references in ${path}: ${getErrorMessage(error)}`,
            migratedCommandIds: [],
            updated: false,
        };
    }
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
