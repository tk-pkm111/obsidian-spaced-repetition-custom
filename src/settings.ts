import { Algorithm } from "src/algorithms/base/isrs-algorithm";
import { DataStoreName } from "src/data-stores/base/data-store";
import { t } from "src/lang/helpers";
import { pathMatchesPattern } from "src/utils/fs";

const LEGACY_FLASHCARD_MODAL_HEIGHT_PERCENTAGE = 60;
const LEGACY_FLASHCARD_MODAL_WIDTH_PERCENTAGE = 60;
const DEFAULT_FLASHCARD_MODAL_HEIGHT_PERCENTAGE = 72;
const DEFAULT_FLASHCARD_MODAL_WIDTH_PERCENTAGE = 72;

const LEGACY_FLASHCARD_HARD_LABELS = new Set(["Hard"]);
const LEGACY_FLASHCARD_GOOD_LABELS = new Set(["Good"]);
const LEGACY_FLASHCARD_EASY_LABELS = new Set(["Easy"]);

export interface SRSettings {
    // flashcards
    flashcardTags: string[];
    convertFoldersToDecks: boolean;
    burySiblingCards: boolean;
    randomizeCardOrder: boolean;
    flashcardCardOrder: string;
    flashcardDeckOrder: string;
    convertClozePatternsToInputs: boolean;
    convertHighlightsToClozes: boolean;
    convertBoldTextToClozes: boolean;
    convertCurlyBracketsToClozes: boolean;
    clozePatterns: string[];
    singleLineCardSeparator: string;
    singleLineReversedCardSeparator: string;
    multilineCardSeparator: string;
    multilineReversedCardSeparator: string;
    multilineCardEndMarker: string;
    editLaterTag: string;

    // notes
    enableNoteReviewPaneOnStartup: boolean;
    tagsToReview: string[];
    noteFoldersToIgnore: string[];
    openRandomNote: boolean;
    autoNextNote: boolean;
    disableFileMenuReviewOptions: boolean;
    maxNDaysNotesReviewQueue: number;
    deckOrder: string[];

    // UI preferences
    showRibbonIcon: boolean;
    showStatusBar: boolean;
    initiallyExpandAllSubdecksInTree: boolean;
    showContextInCards: boolean;
    showIntervalInReviewButtons: boolean;
    flashcardHeightPercentage: number;
    flashcardWidthPercentage: number;
    flashcardHeightPercentageMobile: number;
    flashcardWidthPercentageMobile: number;
    flashcardEasyText: string;
    flashcardGoodText: string;
    flashcardHardText: string;
    reviewButtonDelay: number;
    openViewInNewTabMobile: boolean;
    openViewInNewTab: boolean;

    // algorithm
    algorithm: string;
    baseEase: number;
    lapsesIntervalChange: number;
    easyBonus: number;
    loadBalance: boolean;
    maximumInterval: number;
    maxLinkFactor: number;

    // storage
    dataStore: string;
    cardCommentOnSameLine: boolean;

    // logging
    showSchedulingDebugMessages: boolean;
    showParserDebugMessages: boolean;
}

export const DEFAULT_SETTINGS: SRSettings = {
    // flashcards
    flashcardTags: ["#flashcards"],
    convertFoldersToDecks: false,
    burySiblingCards: false,
    randomizeCardOrder: null,
    flashcardCardOrder: "DueFirstRandom",
    flashcardDeckOrder: "PrevDeckComplete_Sequential",
    convertClozePatternsToInputs: false,
    convertHighlightsToClozes: true,
    convertBoldTextToClozes: false,
    convertCurlyBracketsToClozes: false,
    clozePatterns: ["==[123;;]answer[;;hint]=="],
    singleLineCardSeparator: "::",
    singleLineReversedCardSeparator: ":::",
    multilineCardSeparator: "?",
    multilineReversedCardSeparator: "??",
    multilineCardEndMarker: "",
    editLaterTag: "#edit-later",

    // notes
    enableNoteReviewPaneOnStartup: true,
    tagsToReview: ["#review"],
    noteFoldersToIgnore: ["**/*.excalidraw.md"],
    openRandomNote: false,
    autoNextNote: false,
    disableFileMenuReviewOptions: false,
    maxNDaysNotesReviewQueue: 365,
    deckOrder: [],

    // UI settings
    showRibbonIcon: true,
    showStatusBar: true,
    initiallyExpandAllSubdecksInTree: false,
    showContextInCards: true,
    showIntervalInReviewButtons: true,
    flashcardHeightPercentage: DEFAULT_FLASHCARD_MODAL_HEIGHT_PERCENTAGE,
    flashcardWidthPercentage: DEFAULT_FLASHCARD_MODAL_WIDTH_PERCENTAGE,
    flashcardHeightPercentageMobile: 100,
    flashcardWidthPercentageMobile: 100,
    flashcardEasyText: t("EASY"),
    flashcardGoodText: t("GOOD"),
    flashcardHardText: t("HARD"),
    reviewButtonDelay: 0,
    openViewInNewTab: false,
    openViewInNewTabMobile: false,

    // algorithm
    algorithm: Algorithm.SM_2_OSR,
    baseEase: 250,
    lapsesIntervalChange: 0.5,
    easyBonus: 1.3,
    loadBalance: true,
    maximumInterval: 36525,
    maxLinkFactor: 1.0,

    // storage
    dataStore: DataStoreName.NOTES,
    cardCommentOnSameLine: false,

    // logging
    showSchedulingDebugMessages: false,
    showParserDebugMessages: false,
};

export function upgradeSettings(settings: SRSettings) {
    if (
        settings.randomizeCardOrder != null &&
        settings.flashcardCardOrder == null &&
        settings.flashcardDeckOrder == null
    ) {
        settings.flashcardCardOrder = settings.randomizeCardOrder
            ? "DueFirstRandom"
            : "DueFirstSequential";
        settings.flashcardDeckOrder = "PrevDeckComplete_Sequential";

        // After the upgrade, we don't need the old attribute any more
        settings.randomizeCardOrder = null;
    }

    if (settings.clozePatterns == null) {
        settings.clozePatterns = [];

        if (settings.convertHighlightsToClozes)
            settings.clozePatterns.push("==[123;;]answer[;;hint]==");

        if (settings.convertBoldTextToClozes)
            settings.clozePatterns.push("**[123;;]answer[;;hint]**");

        if (settings.convertCurlyBracketsToClozes)
            settings.clozePatterns.push("{{[123;;]answer[;;hint]}}");
    }

    upgradeFlashcardModalSizeDefaults(settings);
    upgradeFlashcardReviewButtonLabels(settings);
}

function upgradeFlashcardModalSizeDefaults(settings: SRSettings): void {
    if (
        settings.flashcardHeightPercentage == null ||
        settings.flashcardHeightPercentage === LEGACY_FLASHCARD_MODAL_HEIGHT_PERCENTAGE
    ) {
        settings.flashcardHeightPercentage = DEFAULT_FLASHCARD_MODAL_HEIGHT_PERCENTAGE;
    }

    if (
        settings.flashcardWidthPercentage == null ||
        settings.flashcardWidthPercentage === LEGACY_FLASHCARD_MODAL_WIDTH_PERCENTAGE
    ) {
        settings.flashcardWidthPercentage = DEFAULT_FLASHCARD_MODAL_WIDTH_PERCENTAGE;
    }
}

function upgradeFlashcardReviewButtonLabels(settings: SRSettings): void {
    if (
        settings.flashcardHardText == null ||
        LEGACY_FLASHCARD_HARD_LABELS.has(settings.flashcardHardText)
    ) {
        settings.flashcardHardText = t("HARD");
    }

    if (
        settings.flashcardGoodText == null ||
        LEGACY_FLASHCARD_GOOD_LABELS.has(settings.flashcardGoodText)
    ) {
        settings.flashcardGoodText = t("GOOD");
    }

    if (
        settings.flashcardEasyText == null ||
        LEGACY_FLASHCARD_EASY_LABELS.has(settings.flashcardEasyText)
    ) {
        settings.flashcardEasyText = t("EASY");
    }
}

export class SettingsUtil {
    static isFlashcardTag(settings: SRSettings, tag: string): boolean {
        return SettingsUtil.isTagInList(settings.flashcardTags, tag);
    }

    static isPathInNoteIgnoreFolder(settings: SRSettings, path: string): boolean {
        return settings.noteFoldersToIgnore.some((folder) => pathMatchesPattern(path, folder));
    }

    static isAnyTagANoteReviewTag(settings: SRSettings, tags: string[]): boolean {
        for (const tag of tags) {
            if (
                settings.tagsToReview.some(
                    (tagToReview) => tag === tagToReview || tag.startsWith(tagToReview + "/"),
                )
            ) {
                return true;
            }
        }
        return false;
    }

    // Given a list of tags, return the subset that is in settings.tagsToReview
    static filterForNoteReviewTag(settings: SRSettings, tags: string[]): string[] {
        const result: string[] = [];
        for (const tagToReview of settings.tagsToReview) {
            if (tags.some((tag) => tag === tagToReview || tag.startsWith(tagToReview + "/"))) {
                result.push(tagToReview);
            }
        }
        return result;
    }

    private static isTagInList(tagList: string[], tag: string): boolean {
        for (const tagFromList of tagList) {
            if (tag === tagFromList || tag.startsWith(tagFromList + "/")) {
                return true;
            }
        }
        return false;
    }
}
