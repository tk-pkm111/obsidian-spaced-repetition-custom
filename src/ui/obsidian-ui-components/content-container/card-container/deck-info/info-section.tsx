import { ButtonComponent, setIcon } from "obsidian";

import { DeckStats } from "src/card/flashcard-review-sequencer";
import { Question } from "src/card/questions/question";
import { Deck } from "src/deck/deck";
import { Note } from "src/note/note";
import BackButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/back-button";
import ModalCloseButtonComponent from "src/ui/obsidian-ui-components/content-container/modal-close-button";

export default class InfoSectionComponent {
    public infoSection: HTMLDivElement;
    public deckProgressInfo: HTMLDivElement;

    public chosenDeckInfo: HTMLDivElement;
    public chosenDeckName: HTMLDivElement;

    public chosenDeckCounterWrapper: HTMLDivElement;
    public chosenDeckCounterDivider: HTMLDivElement;

    public chosenDeckCardCounterWrapper: HTMLDivElement;
    public chosenDeckCardCounter: HTMLDivElement;
    public chosenDeckCardCounterIcon: HTMLDivElement;

    public chosenDeckSubDeckCounterWrapper: HTMLDivElement;
    public chosenDeckSubDeckCounter: HTMLDivElement;
    public chosenDeckSubDeckCounterIcon: HTMLDivElement;
    public chosenDeckProgressTrack: HTMLDivElement;
    public chosenDeckProgressFill: HTMLDivElement;

    public currentDeckInfo: HTMLDivElement;
    public currentDeckName: HTMLDivElement;

    public currentDeckCounterWrapper: HTMLDivElement;

    public currentDeckCounterDivider: HTMLDivElement;

    public currentDeckCardCounterWrapper: HTMLDivElement;
    public currentDeckCardCounter: HTMLDivElement;
    public currentDeckCardCounterIcon: HTMLDivElement;
    public horizontalBackButton: ButtonComponent;
    public horizontalCloseButton: ButtonComponent;
    public cardContext: HTMLElement;

    constructor(
        container: HTMLDivElement,
        showContextInCards: boolean,
        backToDeck: () => void,
        closeModal: () => void | undefined,
    ) {
        this.infoSection = container.createDiv();
        this.infoSection.addClass("sr-info-section");

        this.deckProgressInfo = this.infoSection.createDiv();
        this.deckProgressInfo.addClass("sr-deck-progress-info");

        this.horizontalBackButton = new BackButtonComponent(
            this.deckProgressInfo,
            () => backToDeck(),
            ["clickable-icon", "sr-horizontal-back-button"],
        );

        this.chosenDeckInfo = this.deckProgressInfo.createDiv();
        this.chosenDeckInfo.addClass("sr-chosen-deck-info");
        this.chosenDeckName = this.chosenDeckInfo.createDiv();
        this.chosenDeckName.addClass("sr-chosen-deck-name");

        this.chosenDeckCounterWrapper = this.chosenDeckInfo.createDiv();
        this.chosenDeckCounterWrapper.addClass("sr-chosen-deck-counter-wrapper");

        this.chosenDeckCounterDivider = this.chosenDeckCounterWrapper.createDiv();
        this.chosenDeckCounterDivider.addClass("sr-chosen-deck-counter-divider");

        this.chosenDeckCardCounterWrapper = this.chosenDeckCounterWrapper.createDiv();
        this.chosenDeckCardCounterWrapper.addClass("sr-chosen-deck-card-counter-wrapper");

        this.chosenDeckCardCounter = this.chosenDeckCardCounterWrapper.createDiv();
        this.chosenDeckCardCounter.addClass("sr-chosen-deck-card-counter");

        this.chosenDeckCardCounterIcon = this.chosenDeckCardCounterWrapper.createDiv();
        this.chosenDeckCardCounterIcon.addClass("sr-chosen-deck-card-counter-icon");
        setIcon(this.chosenDeckCardCounterIcon, "credit-card");

        this.chosenDeckSubDeckCounterWrapper = this.chosenDeckCounterWrapper.createDiv();
        this.chosenDeckSubDeckCounterWrapper.addClass("sr-is-hidden");
        this.chosenDeckSubDeckCounterWrapper.addClass("sr-chosen-deck-subdeck-counter-wrapper");

        this.chosenDeckSubDeckCounter = this.chosenDeckSubDeckCounterWrapper.createDiv();
        this.chosenDeckSubDeckCounter.addClass("sr-chosen-deck-subdeck-counter");

        this.chosenDeckSubDeckCounterIcon = this.chosenDeckSubDeckCounterWrapper.createDiv();
        this.chosenDeckSubDeckCounterIcon.addClass("sr-chosen-deck-subdeck-counter-icon");
        setIcon(this.chosenDeckSubDeckCounterIcon, "layers");

        this.chosenDeckProgressTrack = this.infoSection.createDiv();
        this.chosenDeckProgressTrack.addClass("sr-card-progress-track");
        this.chosenDeckProgressFill = this.chosenDeckProgressTrack.createDiv();
        this.chosenDeckProgressFill.addClass("sr-card-progress-fill");

        this.currentDeckInfo = this.deckProgressInfo.createDiv();
        this.currentDeckInfo.addClass("sr-is-hidden");
        this.currentDeckInfo.addClass("sr-current-deck-info");

        this.currentDeckName = this.currentDeckInfo.createDiv();
        this.currentDeckName.addClass("sr-current-deck-name");

        this.currentDeckCounterWrapper = this.currentDeckInfo.createDiv();
        this.currentDeckCounterWrapper.addClass("sr-current-deck-counter-wrapper");

        this.currentDeckCounterDivider = this.currentDeckCounterWrapper.createDiv();
        this.currentDeckCounterDivider.addClass("sr-current-deck-counter-divider");

        this.currentDeckCardCounterWrapper = this.currentDeckCounterWrapper.createDiv();
        this.currentDeckCardCounterWrapper.addClass("sr-current-deck-card-counter-wrapper");

        this.currentDeckCardCounter = this.currentDeckCardCounterWrapper.createDiv();
        this.currentDeckCardCounter.addClass("sr-current-deck-card-counter");
        this.currentDeckCardCounterIcon = this.currentDeckCardCounterWrapper.createDiv();
        this.currentDeckCardCounterIcon.addClass("sr-current-deck-card-counter-icon");
        setIcon(this.currentDeckCardCounterIcon, "credit-card");

        this.deckProgressInfo
            .createDiv()
            .addClasses(["sr-flex-spacer", "sr-horizontal-flex-spacer"]);

        this.horizontalCloseButton = new ModalCloseButtonComponent(
            this.deckProgressInfo,
            () => closeModal && closeModal(),
            [
                !closeModal && "sr-hide-by-scaling",
                !closeModal && "hide-height",
                "mod-raised",
                "sr-horizontal-close-button",
            ],
        );

        if (showContextInCards) {
            this.cardContext = this.infoSection.createDiv();
            this.cardContext.addClass("sr-context");
        }
    }

    public updateChosenDeckInfo(
        chosenDeck: Deck,
        deckStats: DeckStats,
        totalCardsInSession: number,
        totalDecksInSession: number,
        historyOffset: number = 0,
        completionCardVisible: boolean = false,
    ) {
        const chosenDeckStats = deckStats;
        const completedCards = totalCardsInSession - chosenDeckStats.cardsInQueueCount;
        const visibleCompletedCards = Math.max(0, completedCards - historyOffset);
        const dummyTotalCards = completionCardVisible
            ? totalCardsInSession + 1
            : totalCardsInSession;
        const visibleCurrentCardPosition = completionCardVisible
            ? dummyTotalCards
            : totalCardsInSession > 0
              ? Math.min(totalCardsInSession, visibleCompletedCards + 1)
              : 0;
        const progressRatio = completionCardVisible
            ? 1
            : totalCardsInSession > 0
              ? visibleCompletedCards / totalCardsInSession
              : 0;

        this.chosenDeckName.setText(`${chosenDeck.deckName}`);
        this.chosenDeckCardCounter.setText(
            `${visibleCurrentCardPosition}/${dummyTotalCards}`,
        );
        this.chosenDeckProgressFill.style.width = `${Math.max(0, Math.min(100, progressRatio * 100))}%`;

        if (chosenDeck.subdecks.length === 0) {
            if (!this.chosenDeckSubDeckCounterWrapper.hasClass("sr-is-hidden")) {
                this.chosenDeckSubDeckCounterWrapper.addClass("sr-is-hidden");
            }
            return;
        }

        if (this.chosenDeckSubDeckCounterWrapper.hasClass("sr-is-hidden")) {
            this.chosenDeckSubDeckCounterWrapper.removeClass("sr-is-hidden");
        }

        this.chosenDeckSubDeckCounter.setText(
            `${totalDecksInSession - chosenDeckStats.decksInQueueOfThisDeckCount}/${totalDecksInSession}`,
        );
    }

    public updateCurrentDeckInfo(
        chosenDeck: Deck,
        currentDeck: Deck,
        currentDeckStats: DeckStats,
        flashcardCardOrder: string,
        currentDeckTotalCardsInQueue: number,
        historyOffset: number = 0,
        completionCardVisible: boolean = false,
    ) {
        if (chosenDeck.subdecks.length === 0) {
            if (!this.currentDeckInfo.hasClass("sr-is-hidden")) {
                this.currentDeckInfo.addClass("sr-is-hidden");
            }
            return;
        }

        if (this.currentDeckInfo.hasClass("sr-is-hidden")) {
            this.currentDeckInfo.removeClass("sr-is-hidden");
        }

        this.currentDeckName.setText(`${currentDeck.deckName}`);

        const isRandomMode = flashcardCardOrder === "EveryCardRandomDeckAndCard";
        if (!isRandomMode) {
            const completedCardsInDeck =
                currentDeckTotalCardsInQueue - currentDeckStats.cardsInQueueOfThisDeckCount;
            const visibleCompletedCardsInDeck = Math.max(0, completedCardsInDeck - historyOffset);
            const dummyTotalCardsInDeck = completionCardVisible
                ? currentDeckTotalCardsInQueue + 1
                : currentDeckTotalCardsInQueue;
            const visibleCurrentCardPositionInDeck = completionCardVisible
                ? dummyTotalCardsInDeck
                : currentDeckTotalCardsInQueue > 0
                  ? Math.min(currentDeckTotalCardsInQueue, visibleCompletedCardsInDeck + 1)
                  : 0;
            this.currentDeckCardCounter.setText(
                `${visibleCurrentCardPositionInDeck}/${dummyTotalCardsInDeck}`,
            );
        }
    }

    public updateCardContext(
        showContextInCards: boolean,
        currentQuestion: Question,
        currentNote: Note,
    ) {
        if (!this.cardContext) return;
        if (!showContextInCards) {
            this.cardContext.setText("");
            return;
        }
        this.cardContext.setText(
            ` ${this._formatQuestionContextText(currentQuestion.questionContext, currentNote)}`,
        );
    }

    private _formatQuestionContextText(questionContext: string[], currentNote: Note): string {
        const separator: string = " > ";
        let result = currentNote.file.basename;
        questionContext.forEach((context) => {
            // Check for links trim [[ ]]
            if (context.startsWith("[[") && context.endsWith("]]")) {
                context = context.replace("[[", "").replace("]]", "");
                // Use replacement text if any
                if (context.contains("|")) {
                    context = context.split("|")[1];
                }
            }
            result += separator + context;
        });
        return result;
    }
}
