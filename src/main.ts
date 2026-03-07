import { Editor, Notice, Plugin, TFile } from "obsidian";

import { ReviewResponse } from "src/algorithms/base/repetition-item";
import { SrsAlgorithm } from "src/algorithms/base/srs-algorithm";
import { ObsidianVaultNoteLinkInfoFinder } from "src/algorithms/osr/obsidian-vault-notelink-info-finder";
import { SrsAlgorithmOsr } from "src/algorithms/osr/srs-algorithm-osr";
import {
    FlashcardReviewMode,
    FlashcardReviewSequencer,
    IFlashcardReviewSequencer,
} from "src/card/flashcard-review-sequencer";
import { QuestionPostponementList } from "src/card/questions/question-postponement-list";
import { OsrAppCore } from "src/core";
import { DataStoreAlgorithm } from "src/data-store-algorithm/data-store-algorithm";
import { DataStoreInNoteAlgorithmOsr } from "src/data-store-algorithm/data-store-in-note-algorithm-osr";
import { DataStore } from "src/data-stores/base/data-store";
import { StoreInNotes } from "src/data-stores/notes/notes";
import { Deck, DeckTreeFilter } from "src/deck/deck";
import {
    CardOrder,
    DeckOrder,
    DeckTreeIterator,
    IDeckTreeIterator,
    IIteratorOrder,
} from "src/deck/deck-tree-iterator";
import { TopicPath } from "src/deck/topic-path";
import { ISRFile, SrTFile } from "src/file";
import { t } from "src/lang/helpers";
import { NextNoteReviewHandler } from "src/note/next-note-review-handler";
import { Note } from "src/note/note";
import { NoteFileLoader } from "src/note/note-file-loader";
import { NoteReviewQueue } from "src/note/note-review-queue";
import { setDebugParser } from "src/parser";
import { DEFAULT_DATA, PluginData } from "src/plugin-data";
import { DEFAULT_SETTINGS, SettingsUtil, SRSettings, upgradeSettings } from "src/settings";
import { REVIEW_QUEUE_VIEW_TYPE } from "src/ui/obsidian-ui-components/item-views/review-queue-list-view";
import { FlashcardEditModal } from "src/ui/obsidian-ui-components/modals/edit-modal";
import { UIManager } from "src/ui/ui-manager";
import { convertToStringOrEmpty, TextDirection } from "src/utils/strings";

export default class SRPlugin extends Plugin {
    public data: PluginData;
    public osrAppCore: OsrAppCore;
    public uiManager: UIManager;

    public nextNoteReviewHandler: NextNoteReviewHandler;

    async onload(): Promise<void> {
        await this.loadPluginData();

        const noteReviewQueue = new NoteReviewQueue();
        this.nextNoteReviewHandler = new NextNoteReviewHandler(
            this.app,
            this.data.settings,
            noteReviewQueue,
        );

        const questionPostponementList: QuestionPostponementList = new QuestionPostponementList(
            this,
            this.data.settings,
            this.data.buryList,
        );

        const osrNoteLinkInfoFinder: ObsidianVaultNoteLinkInfoFinder =
            new ObsidianVaultNoteLinkInfoFinder(this.app.metadataCache);

        this.osrAppCore = new OsrAppCore(this.app);
        this.osrAppCore.init(
            questionPostponementList,
            osrNoteLinkInfoFinder,
            this.data.settings,
            this.onOsrVaultDataChanged.bind(this),
            noteReviewQueue,
        );

        this.uiManager = new UIManager(this);

        this.addPluginCommands();
        this.registerEditorContextMenuCommands();
    }

    private addPluginCommands() {
        this.addCommand({
            id: "srs-note-review-open-note",
            name: t("OPEN_NOTE_FOR_REVIEW"),
            callback: async () => {
                if (!this.osrAppCore.syncLock) {
                    await this.sync();
                    this.nextNoteReviewHandler.reviewNextNoteModal();
                }
            },
        });

        this.addCommand({
            id: "srs-note-review-easy",
            name: t("REVIEW_NOTE_DIFFICULTY_CMD", {
                difficulty: this.data.settings.flashcardEasyText,
            }),
            callback: () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (openFile && openFile.extension === "md") {
                    this.saveNoteReviewResponse(openFile, ReviewResponse.Easy);
                }
            },
        });

        this.addCommand({
            id: "srs-note-review-good",
            name: t("REVIEW_NOTE_DIFFICULTY_CMD", {
                difficulty: this.data.settings.flashcardGoodText,
            }),
            callback: () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (openFile && openFile.extension === "md") {
                    this.saveNoteReviewResponse(openFile, ReviewResponse.Good);
                }
            },
        });

        this.addCommand({
            id: "srs-note-review-hard",
            name: t("REVIEW_NOTE_DIFFICULTY_CMD", {
                difficulty: this.data.settings.flashcardHardText,
            }),
            callback: () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (openFile && openFile.extension === "md") {
                    this.saveNoteReviewResponse(openFile, ReviewResponse.Hard);
                }
            },
        });

        this.addCommand({
            id: "srs-review-flashcards",
            name: t("REVIEW_ALL_CARDS"),
            callback: async () => {
                await this.uiManager.openDeckContainer(FlashcardReviewMode.Review);
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards",
            name: t("CRAM_ALL_CARDS"),
            callback: async () => {
                await this.uiManager.openDeckContainer(FlashcardReviewMode.Cram);
            },
        });

        this.addCommand({
            id: "srs-review-flashcards-in-note",
            name: t("REVIEW_CARDS_IN_NOTE"),
            callback: async () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (!openFile || openFile.extension !== "md") {
                    return;
                }
                await this.uiManager.openDeckContainer(FlashcardReviewMode.Review, openFile);
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards-in-note",
            name: t("CRAM_CARDS_IN_NOTE"),
            callback: async () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (!openFile || openFile.extension !== "md") {
                    return;
                }
                await this.uiManager.openDeckContainer(FlashcardReviewMode.Cram, openFile);
            },
        });

        this.addCommand({
            id: "srs-open-review-queue-view",
            name: t("OPEN_REVIEW_QUEUE_VIEW"),
            callback: async () => {
                await this.uiManager.sidebarManager.openReviewQueueView();
            },
        });

        this.addCommand({
            id: "srs-convert-selection-to-flashcard",
            name: "選択範囲をフラッシュカード化",
            hotkeys: [
                {
                    modifiers: ["Mod", "Shift"],
                    key: "k",
                },
            ],
            editorCheckCallback: (checking: boolean, editor: Editor) => {
                const selectedText = editor.getSelection();
                const hasSelection = selectedText.trim().length > 0;
                if (checking) {
                    return hasSelection;
                }
                void this.convertSelectionToFlashcard(editor, selectedText);
                return true;
            },
        });
    }

    private registerEditorContextMenuCommands() {
        this.registerEvent(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.app.workspace.on("editor-menu" as any, (menu: any, editor: Editor) => {
                const selectedText = editor.getSelection();
                if (!selectedText || selectedText.trim().length === 0) return;

                menu.addItem((item) => {
                    item
                        .setTitle("フラッシュカード化する")
                        .setIcon("list-plus")
                        .onClick(async () => {
                            await this.convertSelectionToFlashcard(editor, selectedText);
                        });
                });
            }),
        );
    }

    onunload(): void {
        this.app.workspace.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE).forEach((leaf) => leaf.detach());
        this.uiManager.destroy();
    }

    public getPreparedReviewSequencer(
        fullDeckTree: Deck,
        remainingDeckTree: Deck,
        reviewMode: FlashcardReviewMode,
    ): { reviewSequencer: IFlashcardReviewSequencer; mode: FlashcardReviewMode } {
        const deckIterator: IDeckTreeIterator = SRPlugin.createDeckTreeIterator(this.data.settings);

        const reviewSequencer: IFlashcardReviewSequencer = new FlashcardReviewSequencer(
            reviewMode,
            deckIterator,
            this.data.settings,
            SrsAlgorithm.getInstance(),
            this.osrAppCore.questionPostponementList,
            this.osrAppCore.dueDateFlashcardHistogram,
        );

        reviewSequencer.setDeckTree(fullDeckTree, remainingDeckTree);
        return { reviewSequencer, mode: reviewMode };
    }

    public async getPreparedDecksForSingleNoteReview(
        file: TFile,
        mode: FlashcardReviewMode,
    ): Promise<{ deckTree: Deck; remainingDeckTree: Deck; mode: FlashcardReviewMode }> {
        const note: Note = await this.loadNote(file);

        const deckTree = new Deck("root", null);
        note.appendCardsToDeck(deckTree);
        const remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.osrAppCore.questionPostponementList,
            deckTree,
            mode,
        );

        return { deckTree, remainingDeckTree, mode };
    }

    private static createDeckTreeIterator(settings: SRSettings): IDeckTreeIterator {
        let cardOrder: CardOrder = CardOrder[settings.flashcardCardOrder as keyof typeof CardOrder];
        if (cardOrder === undefined) cardOrder = CardOrder.DueFirstSequential;
        let deckOrder: DeckOrder = DeckOrder[settings.flashcardDeckOrder as keyof typeof DeckOrder];
        if (deckOrder === undefined) deckOrder = DeckOrder.PrevDeckComplete_Sequential;

        const iteratorOrder: IIteratorOrder = {
            deckOrder,
            cardOrder,
        };
        return new DeckTreeIterator(iteratorOrder, null);
    }

    async sync(): Promise<void> {
        if (this.osrAppCore.syncLock) {
            return;
        }

        const now = window.moment(Date.now());
        this.osrAppCore.defaultTextDirection = this.getObsidianRtlSetting();

        await this.osrAppCore.loadVault();

        if (this.data.settings.showSchedulingDebugMessages) {
            console.log(`SR: ${t("DECKS")}`, this.osrAppCore.reviewableDeckTree);
            console.log(
                "SR: " +
                    t("SYNC_TIME_TAKEN", {
                        t: Date.now() - now.valueOf(),
                    }),
            );
        }
    }

    private onOsrVaultDataChanged() {
        this.uiManager.updateStatusBar();
        if (this.data.settings.enableNoteReviewPaneOnStartup)
            this.uiManager.sidebarManager.redraw();
    }

    async loadNote(noteFile: TFile): Promise<Note> {
        const loader: NoteFileLoader = new NoteFileLoader(this.data.settings);
        const srFile: ISRFile = this.createSrTFile(noteFile);
        const folderTopicPath: TopicPath = TopicPath.getFolderPathFromFilename(
            srFile,
            this.data.settings,
        );

        const note: Note = await loader.load(
            this.createSrTFile(noteFile),
            this.getObsidianRtlSetting(),
            folderTopicPath,
        );
        if (note.hasChanged) {
            note.writeNoteFile(this.data.settings);
        }
        return note;
    }

    private getObsidianRtlSetting(): TextDirection {
        // Get the direction with Obsidian's own setting
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v: any = (this.app.vault as any).getConfig("rightToLeft");
        return convertToStringOrEmpty(v) == "true" ? TextDirection.Rtl : TextDirection.Ltr;
    }

    async saveNoteReviewResponse(note: TFile, response: ReviewResponse): Promise<void> {
        const noteSrTFile: ISRFile = this.createSrTFile(note);

        if (SettingsUtil.isPathInNoteIgnoreFolder(this.data.settings, note.path)) {
            new Notice(t("NOTE_IN_IGNORED_FOLDER"));
            return;
        }

        const tags = noteSrTFile.getAllTagsFromCache();
        if (!SettingsUtil.isAnyTagANoteReviewTag(this.data.settings, tags)) {
            new Notice(t("PLEASE_TAG_NOTE"));
            return;
        }

        //
        await this.osrAppCore.saveNoteReviewResponse(noteSrTFile, response, this.data.settings);

        new Notice(t("RESPONSE_RECEIVED"));

        if (this.data.settings.autoNextNote) {
            this.nextNoteReviewHandler.autoReviewNextNote();
        }
    }

    createSrTFile(note: TFile): SrTFile {
        return new SrTFile(this.app.vault, this.app.metadataCache, this.app.fileManager, note);
    }

    async loadPluginData(): Promise<void> {
        const loadedData: PluginData = await this.loadData();
        if (loadedData?.settings) upgradeSettings(loadedData.settings);
        this.data = Object.assign({}, DEFAULT_DATA, loadedData);
        this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings);
        setDebugParser(this.data.settings.showParserDebugMessages);

        this.setupDataStoreAndAlgorithmInstances(this.data.settings);
    }

    setupDataStoreAndAlgorithmInstances(settings: SRSettings) {
        // For now we can hardcode as we only support the one data store and one algorithm
        DataStore.instance = new StoreInNotes(settings);
        SrsAlgorithm.instance = new SrsAlgorithmOsr(settings);
        DataStoreAlgorithm.instance = new DataStoreInNoteAlgorithmOsr(settings);
    }
    async savePluginData(): Promise<void> {
        await this.saveData(this.data);
    }

    private async convertSelectionToFlashcard(
        editor: Editor,
        rawSelection?: string,
    ): Promise<void> {
        const selectedText = (rawSelection ?? editor.getSelection()).trim();
        if (!selectedText) {
            new Notice("テキストを選択してから実行してください。");
            return;
        }

        const questionText = await FlashcardEditModal.Prompt(
            this.app,
            "",
            this.getObsidianRtlSetting(),
            "質問を入力してください",
        ).catch(() => "");

        const normalizedQuestionText = questionText.trim();
        if (!normalizedQuestionText) {
            new Notice("質問の入力をキャンセルしました。");
            return;
        }

        const normalizedSelectedText = selectedText.replace(/\r\n/g, "\n").trim();
        const isMultilineAnswer = normalizedSelectedText.includes("\n");

        const singleLineCardSeparator = this.data.settings.singleLineCardSeparator || "::";
        const multilineCardSeparator = this.data.settings.multilineCardSeparator || "?";
        const preferredFlashcardTag = this.getPreferredFlashcardTag();
        this.ensureFrontmatterHasFlashcardTag(editor, preferredFlashcardTag);
        const replacementText = isMultilineAnswer
            ? `${normalizedQuestionText}\n${multilineCardSeparator}\n${normalizedSelectedText}\n\n`
            : `${normalizedQuestionText} ${singleLineCardSeparator} ${normalizedSelectedText}`;

        editor.replaceSelection(replacementText);
        editor.setCursor(editor.getCursor("to"));
        new Notice("フラッシュカードに変換しました。");
    }

    private getPreferredFlashcardTag(): string {
        const tags = this.data.settings.flashcardTags ?? [];
        if (tags.length === 0) return "#flashcards";

        const flashcardsLikeTag = tags.find((tag) => /flashcards?/i.test(tag));
        return flashcardsLikeTag || tags[0];
    }

    private ensureFrontmatterHasFlashcardTag(editor: Editor, flashcardTag: string): void {
        const normalizedTag = flashcardTag.replace(/^#/, "").trim();
        if (!normalizedTag) return;

        const firstLine = editor.lineCount() > 0 ? editor.getLine(0).trim() : "";
        if (firstLine !== "---") {
            const newFrontmatter = `---\ntags:\n  - ${normalizedTag}\n---\n\n`;
            editor.replaceRange(newFrontmatter, { line: 0, ch: 0 });
            return;
        }

        let closingLine = -1;
        for (let line = 1; line < editor.lineCount(); line++) {
            if (editor.getLine(line).trim() === "---") {
                closingLine = line;
                break;
            }
        }
        if (closingLine === -1) {
            return;
        }

        const frontmatterText = editor.getRange(
            { line: 0, ch: 0 },
            { line: closingLine, ch: editor.getLine(closingLine).length },
        );
        if (this.frontmatterContainsTag(frontmatterText, normalizedTag)) {
            return;
        }

        let tagsLine = -1;
        for (let line = 1; line < closingLine; line++) {
            if (/^\s*tags\s*:/.test(editor.getLine(line))) {
                tagsLine = line;
                break;
            }
        }

        if (tagsLine === -1) {
            editor.replaceRange(`tags:\n  - ${normalizedTag}\n`, { line: closingLine, ch: 0 });
            return;
        }

        const tagsLineText = editor.getLine(tagsLine);
        const tagsLineMatch = tagsLineText.match(/^(\s*)tags\s*:\s*(.*)$/);
        if (!tagsLineMatch) return;

        const indent = tagsLineMatch[1] ?? "";
        const rest = tagsLineMatch[2]?.trim() ?? "";

        if (rest.startsWith("[") && rest.endsWith("]")) {
            const inner = rest.slice(1, -1).trim();
            const newInner = inner.length > 0 ? `${inner}, ${normalizedTag}` : normalizedTag;
            const newLine = `${indent}tags: [${newInner}]`;
            editor.replaceRange(
                newLine,
                { line: tagsLine, ch: 0 },
                { line: tagsLine, ch: tagsLineText.length },
            );
            return;
        }

        if (rest.length > 0) {
            const newLine = `${indent}tags: [${rest}, ${normalizedTag}]`;
            editor.replaceRange(
                newLine,
                { line: tagsLine, ch: 0 },
                { line: tagsLine, ch: tagsLineText.length },
            );
            return;
        }

        let insertLine = tagsLine + 1;
        while (insertLine < closingLine && /^\s*-\s+/.test(editor.getLine(insertLine))) {
            insertLine += 1;
        }
        editor.replaceRange(`${indent}  - ${normalizedTag}\n`, { line: insertLine, ch: 0 });
    }

    private frontmatterContainsTag(frontmatterText: string, normalizedTag: string): boolean {
        const escapedTag = normalizedTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tagRegex = new RegExp(`(^|[\\s,\\[\\]-])#?${escapedTag}(?=$|[\\s,\\],])`, "i");
        return tagRegex.test(frontmatterText);
    }
}
