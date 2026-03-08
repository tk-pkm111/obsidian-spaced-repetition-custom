import { now } from "moment";
import { App, Platform, TFile } from "obsidian";

import { ReviewResponse } from "src/algorithms/base/repetition-item";
import { Card } from "src/card/card";
import {
    FlashcardReviewMode,
    IFlashcardReviewSequencer as IFlashcardReviewSequencer,
} from "src/card/flashcard-review-sequencer";
import { CardType, Question } from "src/card/questions/question";
import { Deck } from "src/deck/deck";
import { escapeHtml } from "src/escape-html";
import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { Note } from "src/note/note";
import { SRSettings } from "src/settings";
import CardInfoNotice from "src/ui/obsidian-ui-components/content-container/card-container/controls/card-info-notice";
import ControlsComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/controls";
import InfoSection from "src/ui/obsidian-ui-components/content-container/card-container/deck-info/info-section";
import ResponseSectionComponent from "src/ui/obsidian-ui-components/content-container/card-container/response-section/response-section";
import { FlashcardMode } from "src/ui/obsidian-ui-components/modals/sr-modal-view";
import EmulatedPlatform from "src/utils/platform-detector";
import { RenderMarkdownWrapper } from "src/utils/renderers";

export class CardContainer {
    public app: App;
    public plugin: SRPlugin;
    public mode: FlashcardMode;

    public view: HTMLDivElement;

    public infoSection: InfoSection;

    public mainWrapper: HTMLDivElement;
    public scrollWrapper: HTMLDivElement;
    public content: HTMLDivElement;

    public controls: ControlsComponent;

    public response: ResponseSectionComponent;
    public lastPressed: number;
    private lastNavigationPressed: number;

    public isActive: boolean = false;

    private chosenDeck: Deck | null;
    private totalCardsInSession: number = 0;
    private totalDecksInSession: number = 0;

    private currentDeck: Deck | null;
    private previousDeck: Deck | null;
    private currentDeckTotalCardsInQueue: number = 0;

    private clozeInputs: NodeListOf<Element>;
    private clozeAnswers: NodeListOf<Element>;

    private reviewSequencer: IFlashcardReviewSequencer;
    private settings: SRSettings;
    private reviewMode: FlashcardReviewMode;
    private backToDeck: () => void;
    private editClickHandler: () => void;
    private closeModal: () => void | undefined;
    private openNoteFromContext?: (notePath: string, openInNewLeaf: boolean) => Promise<void>;
    private minimizeToFloatingBar?: () => void;

    // History of skipped cards (for the "previous card" button)
    private _cardHistory: Array<{
        card: Card;
        question: Question;
        note: Note;
    }> = [];

    // When viewing a historical card, this holds the displayed card info
    // (the sequencer's current card remains unchanged)
    private _historyItem: { card: Card; question: Question; note: Note } | null = null;
    private _historyCursor: number | null = null;
    private _historyOffset: number = 0;
    private _isCardActionInProgress: boolean = false;
    private _isCompletionCardVisible: boolean = false;
    private _isFlipAnimationInProgress: boolean = false;

    constructor(
        app: App,
        plugin: SRPlugin,
        settings: SRSettings,
        reviewSequencer: IFlashcardReviewSequencer,
        reviewMode: FlashcardReviewMode,
        view: HTMLDivElement,
        backToDeck: () => void,
        editClickHandler: () => void,
        closeModal?: () => void,
        openNoteFromContext?: (notePath: string, openInNewLeaf: boolean) => Promise<void>,
        minimizeToFloatingBar?: () => void,
    ) {
        // Init properties
        this.app = app;
        this.plugin = plugin;
        this.settings = settings;
        this.reviewSequencer = reviewSequencer;
        this.reviewMode = reviewMode;
        this.backToDeck = backToDeck;
        this.editClickHandler = editClickHandler;
        this.view = view;
        this.chosenDeck = null;
        this.closeModal = closeModal;
        this.openNoteFromContext = openNoteFromContext;
        this.minimizeToFloatingBar = minimizeToFloatingBar;

        // Build ui
        this.init();
    }

    // #region -> public methods

    /**
     * Initializes all static elements in the FlashcardView
     */
    init() {
        this.view.addClasses(["sr-container", "sr-card-container", "sr-is-hidden"]);

        this.controls = new ControlsComponent(
            this.view,
            !this.settings.openViewInNewTab,
            () => this.backToDeck(),
            () => this.editClickHandler(),
            () => this._hideAnswer(),
            () => this._displayCurrentCardInfoNotice(),
            () => this._skipCurrentCard(),
            () => this._goToPreviousCard(),
            this.minimizeToFloatingBar ? () => this.minimizeToFloatingBar() : undefined,
            this.closeModal ? this.closeModal.bind(this) : undefined,
        );

        this.mainWrapper = this.view.createDiv();
        this.mainWrapper.addClass("sr-main-wrapper");

        this.infoSection = new InfoSection(
            this.mainWrapper,
            () => this.backToDeck(),
            this.closeModal ? this.closeModal.bind(this) : undefined,
        );

        this.scrollWrapper = this.mainWrapper.createDiv();
        this.scrollWrapper.addClass("sr-scroll-wrapper");

        this.content = this.scrollWrapper.createDiv();
        this.content.addClass("sr-content");

        this.response = new ResponseSectionComponent(
            this.mainWrapper,
            this.settings,
            () => this._showAnswer(),
            (response: ReviewResponse) => this._processReview(response),
        );

        if (this.settings.showContextInCards) {
            this.infoSection.createCardContext(this.mainWrapper);
        }
    }

    /**
     * Shows the FlashcardView if it is hidden
     */
    async show(chosenDeck: Deck) {
        // Prevents rest of code, from running if this was executed multiple times after one another
        if (!this.view.hasClass("sr-is-hidden")) {
            return;
        }

        this._historyItem = null;
        this._historyCursor = null;
        this._historyOffset = 0;
        this._isCompletionCardVisible = false;
        this._cardHistory = [];
        this.controls.previousCardButton.setDisabled(true);
        this.chosenDeck = chosenDeck;
        const deckStats = this.reviewSequencer.getDeckStats(chosenDeck.getTopicPath());
        this.totalCardsInSession = deckStats.cardsInQueueCount;
        this.totalDecksInSession = deckStats.decksInQueueOfThisDeckCount;

        await this._drawContent();

        this.view.removeClass("sr-is-hidden");
        this.isActive = true;
        document.addEventListener("keydown", this._keydownHandler);
    }

    /**
     * Refreshes all dynamic elements
     */
    async refresh() {
        await this._drawContent();
    }

    public getFloatingBarSummary(): { deckName: string; counter: string } {
        return {
            deckName: this.infoSection.chosenDeckName.getText(),
            counter: this.infoSection.chosenDeckCardCounter.getText(),
        };
    }

    public resumeAfterFloatingBarRestore(): void {
        this.lastPressed = 0;
        this.lastNavigationPressed = 0;
        this._isCardActionInProgress = false;
        this._isFlipAnimationInProgress = false;

        if (this.mode === FlashcardMode.Back && !this._isCompletionCardVisible) {
            this.controls.resetButton.disabled = false;
        }
    }

    /**
     * Hides the FlashcardView if it is visible
     */
    hide() {
        // Prevents the rest of code, from running if this was executed multiple times after one another
        if (this.view.hasClass("sr-is-hidden")) {
            return;
        }

        document.removeEventListener("keydown", this._keydownHandler);
        this.view.addClass("sr-is-hidden");
        this.isActive = false;
    }

    /**
     * Closes the FlashcardView
     */
    close() {
        this.hide();
        document.removeEventListener("keydown", this._keydownHandler);
    }

    /**
     * Blocks the key input to the FlashcardView
     *
     * @param block
     */
    blockKeyInput(block: boolean) {
        if (block) {
            document.addEventListener("keydown", this._keydownHandler);
        } else {
            document.removeEventListener("keydown", this._keydownHandler);
        }
    }

    // #region -> Functions & helpers

    private async _drawContent(skipAnimation = false) {
        this.controls.resetButton.disabled = true;
        this._isCompletionCardVisible = false;
        this._isFlipAnimationInProgress = false;
        this.content.removeClasses(["sr-flip-out-animating", "sr-flip-in-animating"]);
        this.response.answerButton.setButtonText(t("SHOW_ANSWER"));

        // Update current deck info
        this.mode = FlashcardMode.Front;
        this.previousDeck = this.currentDeck;
        this.currentDeck = this.reviewSequencer.currentDeck;
        if (this.previousDeck !== this.currentDeck) {
            const currentDeckStats = this.reviewSequencer.getDeckStats(
                this.currentDeck.getTopicPath(),
            );
            this.currentDeckTotalCardsInQueue = currentDeckStats.cardsInQueueOfThisDeckCount;
        }

        this._updateInfoBar(this.chosenDeck, this.currentDeck);

        // Trigger flip animation
        if (!skipAnimation) {
            this.content.removeClass("sr-flip-animating");
            // Force reflow so the animation re-triggers
            void this.content.offsetWidth;
            this.content.addClass("sr-flip-animating");
        }

        // Update card content
        this.content.empty();
        const wrapper: RenderMarkdownWrapper = new RenderMarkdownWrapper(
            this.app,
            this.plugin,
            this._currentNote.filePath,
        );

        await wrapper.renderMarkdownWrapper(
            this._currentCard.front.trimStart(),
            this.content,
            this._currentQuestion.questionText.textDirection,
        );
        // Set scroll position back to top
        this.content.scrollTop = 0;

        // Update response buttons
        this.response.resetResponseButtons();

        // Setup cloze input listeners
        this._setupClozeInputListeners();
    }

    private get _currentCard(): Card {
        return this._historyItem?.card ?? this.reviewSequencer.currentCard;
    }

    private get _currentQuestion(): Question {
        return this._historyItem?.question ?? this.reviewSequencer.currentQuestion;
    }

    private get _currentNote(): Note {
        return this._historyItem?.note ?? this.reviewSequencer.currentNote;
    }

    private async _processReview(response: ReviewResponse): Promise<void> {
        // Can't grade a historical card — ignore
        if (this._historyItem) return;
        if (this._isFlipAnimationInProgress) return;
        if (this._isCardActionInProgress) return;

        const timeNow = now();
        if (
            this.lastPressed &&
            timeNow - this.lastPressed < this.plugin.data.settings.reviewButtonDelay
        ) {
            return;
        }
        this.lastPressed = timeNow;
        this._isCardActionInProgress = true;

        try {
            this._isCompletionCardVisible = false;
            // Clear card history on review — can't go back past a graded card
            this._cardHistory = [];
            this._historyCursor = null;
            this._historyOffset = 0;
            this.controls.previousCardButton.setDisabled(true);

            await this.reviewSequencer.processReview(response);
            await this._showNextCard();
        } finally {
            this._isCardActionInProgress = false;
        }
    }

    private async _showNextCard(): Promise<void> {
        if (this._currentCard != null) await this.refresh();
        else await this._showCompletionCard();
    }

    // #region -> Controls

    private async _skipCurrentCard(): Promise<void> {
        if (
            this._isCardActionInProgress ||
            this._isFlipAnimationInProgress ||
            this._isNavigationActionRateLimited()
        ) {
            return;
        }
        this._isCardActionInProgress = true;

        try {
            if (this._isCompletionCardVisible) {
                this.backToDeck();
                return;
            }

            if (this._historyItem) {
                // Viewing a historical card — step forward through history
                // until we eventually return to the sequencer's current card.
                if (this._historyCursor < this._cardHistory.length - 1) {
                    this._historyCursor += 1;
                    await this._renderHistoryCursorCard();
                } else {
                    this._historyCursor = null;
                    this._historyItem = null;
                    this._historyOffset = 0;
                    this.controls.previousCardButton.setDisabled(this._cardHistory.length === 0);
                    await this.refresh();
                }
                return;
            }

            // Save to history before skipping
            this._cardHistory.push({
                card: this._currentCard,
                question: this._currentQuestion,
                note: this._currentNote,
            });
            this.controls.previousCardButton.setDisabled(false);

            this.reviewSequencer.skipCurrentCard();
            await this._showNextCard();
        } finally {
            this._isCardActionInProgress = false;
        }
    }

    private async _goToPreviousCard(): Promise<void> {
        if (
            this._isCardActionInProgress ||
            this._isFlipAnimationInProgress ||
            this._isNavigationActionRateLimited()
        ) {
            return;
        }
        this._isCardActionInProgress = true;

        try {
            if (this._isCompletionCardVisible || this._cardHistory.length === 0) {
                return;
            }

            if (this._historyCursor == null) {
                this._historyCursor = this._cardHistory.length - 1;
            } else if (this._historyCursor > 0) {
                this._historyCursor -= 1;
            } else {
                return;
            }

            await this._renderHistoryCursorCard();
        } finally {
            this._isCardActionInProgress = false;
        }
    }

    private _displayCurrentCardInfoNotice() {
        new CardInfoNotice(this._currentCard.scheduleInfo, this._currentQuestion.note.filePath);
    }

    private async _renderHistoryCursorCard(): Promise<void> {
        if (this._historyCursor == null) return;

        const currentHistoryItem = this._cardHistory[this._historyCursor];
        if (!currentHistoryItem) return;

        this._historyItem = currentHistoryItem;
        this._historyOffset = this._cardHistory.length - this._historyCursor;
        this.controls.previousCardButton.setDisabled(this._historyCursor === 0);

        this._updateInfoBar(this.chosenDeck, this.currentDeck);

        // Re-render the historical card's content
        this.mode = FlashcardMode.Front;
        this.content.empty();
        this.content.removeClass("sr-flip-animating");
        void this.content.offsetWidth;
        this.content.addClass("sr-flip-animating");

        const wrapper: RenderMarkdownWrapper = new RenderMarkdownWrapper(
            this.app,
            this.plugin,
            currentHistoryItem.note.filePath,
        );
        await wrapper.renderMarkdownWrapper(
            currentHistoryItem.card.front.trimStart(),
            this.content,
            currentHistoryItem.question.questionText.textDirection,
        );
        this.content.scrollTop = 0;
        this.response.resetResponseButtons();
        this.controls.resetButton.disabled = true;
        this._setupClozeInputListeners();
    }

    private _isNavigationActionRateLimited(): boolean {
        const timeNow = now();
        if (
            this.lastNavigationPressed &&
            timeNow - this.lastNavigationPressed < this.plugin.data.settings.reviewButtonDelay
        ) {
            return true;
        }
        this.lastNavigationPressed = timeNow;
        return false;
    }

    private async _showCompletionCard(): Promise<void> {
        this._isCompletionCardVisible = true;
        this.mode = FlashcardMode.Front;
        this.controls.resetButton.disabled = true;
        this.controls.previousCardButton.setDisabled(true);

        this._updateInfoBar(this.chosenDeck, this.currentDeck);
        this._setupCardContextLink();

        this.content.empty();
        this.content.removeClass("sr-flip-animating");
        void this.content.offsetWidth;
        this.content.addClass("sr-flip-animating");

        const completionCard = this.content.createDiv("sr-card-completion-card");
        completionCard.createDiv("sr-card-completion-card-title").setText(t("ALL_CAUGHT_UP"));
        completionCard
            .createDiv("sr-card-completion-card-subtitle")
            .setText(`${t("NEXT")} (${t("DECKS")})`);

        this.response.resetResponseButtons();
        this.response.answerButton.setButtonText(`${t("NEXT")} (${t("DECKS")})`);
    }

    private async _hideAnswer(): Promise<void> {
        if (
            this._isCompletionCardVisible ||
            this._isFlipAnimationInProgress ||
            this.mode !== FlashcardMode.Back
        ) {
            return;
        }

        await this.refresh();
    }

    // #region -> Deck Info

    private _updateInfoBar(chosenDeck: Deck, currentDeck: Deck) {
        const currentDeckStats = this.reviewSequencer.getDeckStats(currentDeck.getTopicPath());
        const chosenDeckStats = this.reviewSequencer.getDeckStats(chosenDeck.getTopicPath());
        this._updateSkipButtonHint(chosenDeckStats.cardsInQueueCount);
        this.infoSection.updateChosenDeckInfo(
            chosenDeck,
            chosenDeckStats,
            this.totalCardsInSession,
            this.totalDecksInSession,
            this._historyOffset,
            this._isCompletionCardVisible,
        );
        this.infoSection.updateCurrentDeckInfo(
            chosenDeck,
            currentDeck,
            currentDeckStats,
            this.settings.flashcardCardOrder,
            this.currentDeckTotalCardsInQueue,
            this._historyOffset,
            this._isCompletionCardVisible,
        );
        if (this._isCompletionCardVisible) {
            this.infoSection.clearCardContext();
        } else {
            this.infoSection.updateCardContext(
                this.settings.showContextInCards,
                this._currentQuestion,
                this._currentNote,
            );
        }
        this._setupCardContextLink();
    }

    private _updateSkipButtonHint(remainingCardsInChosenDeck: number): void {
        const isLastCardInQueue =
            this._isCompletionCardVisible ||
            (!this._historyItem && remainingCardsInChosenDeck === 1);
        const tooltip = isLastCardInQueue ? `${t("NEXT")} (${t("DECKS")})` : t("SKIP");
        this.controls.skipButton.setTooltip(tooltip);
        this.controls.skipButton.buttonEl.setAttribute("aria-label", tooltip);
    }

    private _setupCardContextLink(): void {
        if (!this.infoSection.cardContext || !this.settings.showContextInCards) return;
        if (this._isCompletionCardVisible) {
            this.infoSection.cardContext.removeClass("is-link");
            this.infoSection.cardContext.removeAttribute("role");
            this.infoSection.cardContext.removeAttribute("aria-label");
            this.infoSection.cardContext.title = "";
            this.infoSection.cardContext.onclick = null;
            return;
        }

        const notePath = this._currentNote.filePath;
        this.infoSection.cardContext.addClass("is-link");
        this.infoSection.cardContext.setAttribute("role", "link");
        this.infoSection.cardContext.setAttribute("aria-label", notePath);
        this.infoSection.cardContext.title = notePath;
        this.infoSection.cardContext.onclick = async (e: MouseEvent) => {
            const openInNewLeaf = e.metaKey || e.ctrlKey;
            if (this.openNoteFromContext) {
                await this.openNoteFromContext(notePath, openInNewLeaf);
                return;
            }
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (!(file instanceof TFile)) return;
            await this.app.workspace.getLeaf(openInNewLeaf).openFile(file);
        };
    }

    private _setupClozeInputListeners(): void {
        this.clozeInputs = document.querySelectorAll(".cloze-input");

        this.clozeInputs.forEach((input) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            input.addEventListener("change", (e) => {});
        });
    }

    private _evaluateClozeAnswers(): void {
        this.clozeAnswers = document.querySelectorAll(".cloze-answer");

        if (this.clozeAnswers.length === this.clozeInputs.length) {
            for (let i = 0; i < this.clozeAnswers.length; i++) {
                const clozeInput = this.clozeInputs[i] as HTMLInputElement;
                const clozeAnswer = this.clozeAnswers[i] as HTMLElement;

                const inputText = clozeInput.value.trim();
                const answerText = clozeAnswer.innerText.trim();

                const answerElement =
                    inputText === answerText
                        ? `<span style="color: green">${escapeHtml(inputText)}</span>`
                        : `[<span style="color: red; text-decoration: line-through;">${escapeHtml(inputText)}</span><span style="color: green">${answerText}</span>]`;
                clozeAnswer.innerHTML = answerElement;
            }
        }
    }

    // #region -> Response

    private async _showAnswer(): Promise<void> {
        if (this._isCompletionCardVisible) {
            this.backToDeck();
            return;
        }
        if (this._isFlipAnimationInProgress || this.mode !== FlashcardMode.Front) {
            return;
        }

        const timeNow = now();
        if (
            this.lastPressed &&
            timeNow - this.lastPressed < this.plugin.data.settings.reviewButtonDelay
        ) {
            return;
        }
        this.lastPressed = timeNow;
        this._isFlipAnimationInProgress = true;
        try {
            this.mode = FlashcardMode.Back;

            this.controls.resetButton.disabled = false;

            this.content.removeClass("sr-flip-in-animating");
            this.content.addClass("sr-flip-out-animating");
            await new Promise((resolve) => window.setTimeout(resolve, 180));
            this.content.removeClass("sr-flip-out-animating");

            // Show answer text with delayed fade-in
            let answerContainer: HTMLDivElement;
            if (this._currentQuestion.questionType !== CardType.Cloze) {
                const hr: HTMLElement = document.createElement("hr");
                this.content.appendChild(hr);
                answerContainer = this.content.createDiv("sr-answer-content");
            } else {
                this.content.empty();
                answerContainer = this.content.createDiv("sr-answer-content");
            }

            const wrapper: RenderMarkdownWrapper = new RenderMarkdownWrapper(
                this.app,
                this.plugin,
                this._currentNote.filePath,
            );
            await wrapper.renderMarkdownWrapper(
                this._currentCard.back,
                answerContainer,
                this._currentQuestion.questionText.textDirection,
            );

            // Evaluate cloze answers
            this._evaluateClozeAnswers();

            this.content.removeClass("sr-flip-animating");
            this.content.addClass("sr-flip-in-animating");
            this.content.scrollTop = 0;

            // Show response buttons
            this.response.showRatingButtons(
                this.reviewMode,
                this.settings,
                this.reviewSequencer,
                this._currentCard,
            );
            await new Promise((resolve) => window.setTimeout(resolve, 450));
            this.content.removeClass("sr-flip-in-animating");
        } finally {
            this._isFlipAnimationInProgress = false;
        }
    }

    private _keydownHandler = (e: KeyboardEvent) => {
        // Prevents any input, if the edit modal is open or if the view is not in focus
        if (
            document.activeElement.nodeName === "TEXTAREA" ||
            document.activeElement.nodeName === "INPUT" ||
            this.mode === FlashcardMode.Closed ||
            !this.plugin.uiManager.getSRInFocusState() ||
            Platform.isMobile || // No keyboard events on mobile
            EmulatedPlatform().isMobile
        ) {
            return;
        }

        const consumeKeyEvent = () => {
            e.preventDefault();
            e.stopPropagation();
        };

        switch (e.code) {
            case "KeyS":
                this._skipCurrentCard();
                consumeKeyEvent();
                break;
            case "Enter":
            case "NumpadEnter":
            case "Space":
                if (this.mode === FlashcardMode.Front) {
                    this._showAnswer();
                    consumeKeyEvent();
                } else if (this.mode === FlashcardMode.Back) {
                    this._processReview(ReviewResponse.Good);
                    consumeKeyEvent();
                }
                break;
            case "Numpad1":
            case "Digit1":
                if (this.mode !== FlashcardMode.Back) {
                    break;
                }
                this._processReview(ReviewResponse.Hard);
                consumeKeyEvent();
                break;
            case "Numpad2":
            case "Digit2":
                if (this.mode !== FlashcardMode.Back) {
                    break;
                }
                this._processReview(ReviewResponse.Good);
                consumeKeyEvent();
                break;
            case "Numpad3":
            case "Digit3":
                if (this.mode !== FlashcardMode.Back) {
                    break;
                }
                this._processReview(ReviewResponse.Easy);
                consumeKeyEvent();
                break;
            case "Numpad0":
            case "Digit0":
                if (this.mode !== FlashcardMode.Back) {
                    break;
                }
                this._processReview(ReviewResponse.Reset);
                consumeKeyEvent();
                break;
            default:
                break;
        }
    };
}
