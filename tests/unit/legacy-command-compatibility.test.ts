import type { DataAdapter } from "obsidian";

import {
    buildLegacyCommandIdMap,
    getPluginCommandSuffixes,
    type InternalCommandManager,
    migrateLegacyCommandConfigs,
    registerLegacyCommandAliases,
    unregisterLegacyCommandAliases,
} from "src/legacy-command-compatibility";

class MemoryAdapter {
    public readonly files = new Map<string, string>();
    public readonly writes: string[] = [];

    constructor(entries: Record<string, string> = {}) {
        for (const [path, value] of Object.entries(entries)) {
            this.files.set(path, value);
        }
    }

    async exists(path: string): Promise<boolean> {
        return this.files.has(path);
    }

    async read(path: string): Promise<string> {
        const value = this.files.get(path);
        if (value === undefined) {
            throw new Error(`Missing file: ${path}`);
        }

        return value;
    }

    async write(path: string, data: string): Promise<void> {
        this.writes.push(path);
        this.files.set(path, data);
    }
}

describe("legacy command compatibility", () => {
    test("extracts current plugin command suffixes and falls back when command manager is unavailable", () => {
        const commandSuffixes = getPluginCommandSuffixes(
            {
                commands: {
                    "obsidian-spaced-repetition:srs-note-review-hard": {
                        id: "obsidian-spaced-repetition:srs-note-review-hard",
                    },
                    "obsidian-spaced-repetition-custom:srs-note-review-hard": {
                        id: "obsidian-spaced-repetition-custom:srs-note-review-hard",
                    },
                    "obsidian-spaced-repetition-custom:srs-note-review-good": {
                        id: "obsidian-spaced-repetition-custom:srs-note-review-good",
                    },
                    "workspace:open": { id: "workspace:open" },
                },
            },
            "obsidian-spaced-repetition-custom",
            ["fallback-command"],
        );

        expect(commandSuffixes).toEqual(["srs-note-review-hard", "srs-note-review-good"]);
        expect(
            getPluginCommandSuffixes(undefined, "obsidian-spaced-repetition-custom", [
                "fallback-command",
            ]),
        ).toEqual(["fallback-command"]);
    });

    test("registers legacy aliases without overwriting existing commands and cleans up on unload", () => {
        const commandManager: InternalCommandManager = {
            commands: {
                "obsidian-spaced-repetition-custom:srs-note-review-hard": {
                    callback: jest.fn(),
                    id: "obsidian-spaced-repetition-custom:srs-note-review-hard",
                    name: "Review hard",
                },
                "obsidian-spaced-repetition-custom:srs-note-review-good": {
                    callback: jest.fn(),
                    id: "obsidian-spaced-repetition-custom:srs-note-review-good",
                    name: "Review good",
                },
                "obsidian-spaced-repetition:srs-note-review-good": {
                    callback: jest.fn(),
                    id: "obsidian-spaced-repetition:srs-note-review-good",
                    name: "Existing alias",
                },
            },
        };
        const legacyCommandIdMap = buildLegacyCommandIdMap(
            "obsidian-spaced-repetition-custom",
            ["srs-note-review-hard", "srs-note-review-good"],
        );

        const registeredAliasIds = registerLegacyCommandAliases(commandManager, legacyCommandIdMap);

        expect(registeredAliasIds).toEqual(["obsidian-spaced-repetition:srs-note-review-hard"]);
        expect(commandManager.commands?.["obsidian-spaced-repetition:srs-note-review-hard"]).toEqual(
            expect.objectContaining({
                callback:
                    commandManager.commands?.[
                        "obsidian-spaced-repetition-custom:srs-note-review-hard"
                    ].callback,
                id: "obsidian-spaced-repetition:srs-note-review-hard",
                name: "Review hard",
            }),
        );
        expect(commandManager.commands?.["obsidian-spaced-repetition:srs-note-review-good"]).toEqual(
            expect.objectContaining({
                id: "obsidian-spaced-repetition:srs-note-review-good",
                name: "Existing alias",
            }),
        );

        unregisterLegacyCommandAliases(commandManager, registeredAliasIds);

        expect(commandManager.commands?.["obsidian-spaced-repetition:srs-note-review-hard"]).toBe(
            undefined,
        );
        expect(commandManager.commands?.["obsidian-spaced-repetition:srs-note-review-good"]).toEqual(
            expect.objectContaining({
                id: "obsidian-spaced-repetition:srs-note-review-good",
                name: "Existing alias",
            }),
        );
    });

    test("migrates hotkeys and note toolbar command references to the new plugin id", async () => {
        const adapter = new MemoryAdapter({
            ".obsidian/hotkeys.json": JSON.stringify(
                {
                    "obsidian-spaced-repetition:srs-note-review-good": [
                        { key: "G", modifiers: ["Mod"] },
                    ],
                    "obsidian-spaced-repetition:srs-note-review-hard": [
                        { key: "H", modifiers: ["Mod"] },
                    ],
                    "obsidian-spaced-repetition-custom:srs-note-review-hard": [
                        { key: "H", modifiers: ["Alt", "Mod"] },
                    ],
                },
                null,
                2,
            ),
            ".obsidian/plugins/note-toolbar/data.json": JSON.stringify(
                {
                    toolbars: [
                        {
                            items: [
                                {
                                    label: "1日",
                                    link: "Spaced Repetition: ノートを短くとしてレビューする",
                                    linkAttr: {
                                        commandId:
                                            "obsidian-spaced-repetition:srs-note-review-hard",
                                        type: "command",
                                    },
                                },
                                {
                                    label: "3日",
                                    linkAttr: {
                                        commandId:
                                            "obsidian-spaced-repetition:srs-note-review-good",
                                        type: "command",
                                    },
                                },
                                {
                                    label: "Other",
                                    linkAttr: {
                                        commandId: "workspace:open",
                                        type: "command",
                                    },
                                },
                            ],
                        },
                    ],
                },
                null,
                2,
            ),
        });
        const legacyCommandIdMap = buildLegacyCommandIdMap(
            "obsidian-spaced-repetition-custom",
            ["srs-note-review-good", "srs-note-review-hard"],
        );

        const summary = await migrateLegacyCommandConfigs(
            adapter as unknown as DataAdapter,
            ".obsidian",
            legacyCommandIdMap,
        );

        expect(summary.updatedFiles).toEqual([
            ".obsidian/hotkeys.json",
            ".obsidian/plugins/note-toolbar/data.json",
        ]);
        expect(summary.hotkeyCommandsMigrated).toEqual([
            "obsidian-spaced-repetition:srs-note-review-good",
            "obsidian-spaced-repetition:srs-note-review-hard",
        ]);
        expect(summary.noteToolbarCommandsMigrated).toEqual([
            "obsidian-spaced-repetition:srs-note-review-hard",
            "obsidian-spaced-repetition:srs-note-review-good",
        ]);
        expect(summary.errors).toEqual([]);

        const hotkeys = JSON.parse(adapter.files.get(".obsidian/hotkeys.json") ?? "{}");
        expect(hotkeys["obsidian-spaced-repetition:srs-note-review-good"]).toBeUndefined();
        expect(hotkeys["obsidian-spaced-repetition:srs-note-review-hard"]).toBeUndefined();
        expect(hotkeys["obsidian-spaced-repetition-custom:srs-note-review-good"]).toEqual([
            { key: "G", modifiers: ["Mod"] },
        ]);
        expect(hotkeys["obsidian-spaced-repetition-custom:srs-note-review-hard"]).toEqual([
            { key: "H", modifiers: ["Alt", "Mod"] },
            { key: "H", modifiers: ["Mod"] },
        ]);

        const noteToolbar = JSON.parse(
            adapter.files.get(".obsidian/plugins/note-toolbar/data.json") ?? "{}",
        );
        expect(noteToolbar.toolbars[0].items[0].linkAttr.commandId).toBe(
            "obsidian-spaced-repetition-custom:srs-note-review-hard",
        );
        expect(noteToolbar.toolbars[0].items[1].linkAttr.commandId).toBe(
            "obsidian-spaced-repetition-custom:srs-note-review-good",
        );
        expect(noteToolbar.toolbars[0].items[2].linkAttr.commandId).toBe("workspace:open");
    });

    test("reports malformed config files and skips missing migration targets", async () => {
        const adapter = new MemoryAdapter({
            ".obsidian/hotkeys.json": "{invalid json",
        });
        const legacyCommandIdMap = buildLegacyCommandIdMap(
            "obsidian-spaced-repetition-custom",
            ["srs-note-review-hard"],
        );

        const summary = await migrateLegacyCommandConfigs(
            adapter as unknown as DataAdapter,
            ".obsidian/",
            legacyCommandIdMap,
        );

        expect(summary.updatedFiles).toEqual([]);
        expect(summary.hotkeyCommandsMigrated).toEqual([]);
        expect(summary.noteToolbarCommandsMigrated).toEqual([]);
        expect(summary.errors).toHaveLength(1);
        expect(summary.errors[0]).toContain(".obsidian/hotkeys.json");
        expect(adapter.writes).toEqual([]);
    });
});
