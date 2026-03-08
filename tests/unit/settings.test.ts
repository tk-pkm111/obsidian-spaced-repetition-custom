function loadSettings(locale = "en") {
    jest.resetModules();
    jest.doMock("obsidian", () => ({
        moment: {
            locale: jest.fn(() => locale),
        },
    }));

    let settingsModule: typeof import("src/settings");

    jest.isolateModules(() => {
        settingsModule = require("src/settings");
    });

    return settingsModule;
}

describe("upgradeSettings", () => {
    afterEach(() => {
        jest.resetModules();
    });

    test("migrates legacy desktop modal size defaults to the newer roomier layout", () => {
        const { DEFAULT_SETTINGS, upgradeSettings } = loadSettings();

        const settings = {
            ...DEFAULT_SETTINGS,
            flashcardHeightPercentage: 60,
            flashcardWidthPercentage: 60,
        };

        upgradeSettings(settings);

        expect(settings.flashcardHeightPercentage).toBe(DEFAULT_SETTINGS.flashcardHeightPercentage);
        expect(settings.flashcardWidthPercentage).toBe(DEFAULT_SETTINGS.flashcardWidthPercentage);
    });

    test("preserves customized desktop modal size settings", () => {
        const { DEFAULT_SETTINGS, upgradeSettings } = loadSettings();

        const settings = {
            ...DEFAULT_SETTINGS,
            flashcardHeightPercentage: 85,
            flashcardWidthPercentage: 78,
        };

        upgradeSettings(settings);

        expect(settings.flashcardHeightPercentage).toBe(85);
        expect(settings.flashcardWidthPercentage).toBe(78);
    });

    test("migrates legacy review button labels to japanese defaults", () => {
        const { DEFAULT_SETTINGS, upgradeSettings } = loadSettings("ja");

        const settings = {
            ...DEFAULT_SETTINGS,
            flashcardHardText: "Hard",
            flashcardGoodText: "Good",
            flashcardEasyText: "Easy",
        };

        upgradeSettings(settings);

        expect(settings.flashcardHardText).toBe("短く");
        expect(settings.flashcardGoodText).toBe("スキップ");
        expect(settings.flashcardEasyText).toBe("長く");
        expect(settings.flashcardHardText).toBe(DEFAULT_SETTINGS.flashcardHardText);
        expect(settings.flashcardGoodText).toBe(DEFAULT_SETTINGS.flashcardGoodText);
        expect(settings.flashcardEasyText).toBe(DEFAULT_SETTINGS.flashcardEasyText);
    });

    test("preserves customized review button labels", () => {
        const { DEFAULT_SETTINGS, upgradeSettings } = loadSettings("ja");

        const settings = {
            ...DEFAULT_SETTINGS,
            flashcardHardText: "最短",
            flashcardGoodText: "あとで",
            flashcardEasyText: "最長",
        };

        upgradeSettings(settings);

        expect(settings.flashcardHardText).toBe("最短");
        expect(settings.flashcardGoodText).toBe("あとで");
        expect(settings.flashcardEasyText).toBe("最長");
    });
});
