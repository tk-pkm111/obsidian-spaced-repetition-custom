import { App, Modal, Platform, TFile, setIcon } from "obsidian";

import {
    FlashcardReviewMode,
    IFlashcardReviewSequencer as IFlashcardReviewSequencer,
} from "src/card/flashcard-review-sequencer";
import { Question } from "src/card/questions/question";
import { Deck } from "src/deck/deck";
import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { SRSettings } from "src/settings";
import { CardContainer } from "src/ui/obsidian-ui-components/content-container/card-container/card-container";
import { DeckContainer } from "src/ui/obsidian-ui-components/content-container/deck-container";
import { FlashcardEditModal } from "src/ui/obsidian-ui-components/modals/edit-modal";
import EmulatedPlatform from "src/utils/platform-detector";

export enum FlashcardMode {
    Deck,
    Front,
    Back,
    Closed,
}

export class SRModalView extends Modal {
    public plugin: SRPlugin;
    public mode: FlashcardMode;
    private reviewSequencer: IFlashcardReviewSequencer;
    private settings: SRSettings;
    private reviewMode: FlashcardReviewMode;
    private deckContainer: DeckContainer;
    private cardContainer: CardContainer;
    private floatingBarEl: HTMLDivElement | null = null;
    private isMinimized: boolean = false;
    private floatingBarPosition: { left: number; top: number } | null = null;

    constructor(
        app: App,
        plugin: SRPlugin,
        settings: SRSettings,
        reviewSequencer: IFlashcardReviewSequencer,
        reviewMode: FlashcardReviewMode,
    ) {
        super(app);

        // Init properties
        this.plugin = plugin;
        this.settings = settings;
        this.reviewSequencer = reviewSequencer;
        this.reviewMode = reviewMode;

        // Setup base containers
        if (Platform.isMobile || EmulatedPlatform().isMobile) {
            this.modalEl.style.height = this.settings.flashcardHeightPercentageMobile + "%";
            this.modalEl.style.maxHeight = this.settings.flashcardHeightPercentageMobile + "%";
            this.modalEl.style.width = this.settings.flashcardWidthPercentageMobile + "%";
            this.modalEl.style.maxWidth = this.settings.flashcardWidthPercentageMobile + "%";
        } else {
            this.modalEl.style.height = this.settings.flashcardHeightPercentage + "%";
            this.modalEl.style.maxHeight = this.settings.flashcardHeightPercentage + "%";
            this.modalEl.style.width = this.settings.flashcardWidthPercentage + "%";
            this.modalEl.style.maxWidth = this.settings.flashcardWidthPercentage + "%";
        }
        this.modalEl.setAttribute("id", "sr-modal-view");
        this.modalEl.addClass("sr-view");

        if (
            parseInt(this.modalEl.style.height.split("%")[0]) >= 100 ||
            parseInt(this.modalEl.style.width.split("%")[0]) >= 100
        ) {
            this.modalEl.style.borderRadius = "0";
        }

        // Keep Obsidian's default modal-content hook so plugins like Image Toolkit
        // can attach their native image preview behavior inside the review modal.
        this.contentEl.addClasses(["modal-content", "sr-modal-content"]);

        // Init static elements in views
        this.deckContainer = new DeckContainer(
            this.plugin,
            this.settings,
            this.reviewSequencer,
            this.contentEl.createDiv(),
            this._startReviewOfDeck.bind(this),
            this.close.bind(this),
        );

        this.cardContainer = new CardContainer(
            this.app,
            this.plugin,
            this.settings,
            this.reviewSequencer,
            this.reviewMode,
            this.contentEl.createDiv(),
            this._showDecksList.bind(this),
            this._doEditQuestionText.bind(this),
            this.close.bind(this),
            this._openNoteFromCardContext.bind(this),
            this._minimizeToFloatingBar.bind(this),
        );
    }

    onOpen(): void {
        document.body.addClass("sr-image-toolkit-compat");
        this._showDecksList();
    }

    onClose(): void {
        this.plugin.uiManager.setSRViewInFocus(false);
        document.body.removeClass("sr-image-toolkit-compat");
        this._removeFloatingBar();
        this.mode = FlashcardMode.Closed;
        this.deckContainer.close();
        this.cardContainer.close();
    }

    private _showDecksList(): void {
        this.reviewSequencer.refreshRemainingDeckTree();
        this._hideFlashcard();
        this.deckContainer.show();
    }

    private _hideDecksList(): void {
        this.deckContainer.hide();
    }

    private _showFlashcard(deck: Deck): void {
        this._hideDecksList();
        this.cardContainer.show(deck);
    }

    private _hideFlashcard(): void {
        this.cardContainer.hide();
    }

    private _startReviewOfDeck(deck: Deck) {
        this.reviewSequencer.setCurrentDeck(deck.getTopicPath());
        if (this.reviewSequencer.hasCurrentCard) {
            this._showFlashcard(deck);
        } else {
            this._showDecksList();
        }
    }

    private async _doEditQuestionText(): Promise<void> {
        const currentQ: Question = this.reviewSequencer.currentQuestion;

        // Just the question/answer text; without any preceding topic tag
        const textPrompt = currentQ.questionText.actualQuestion;

        const editModal = FlashcardEditModal.Prompt(
            this.app,
            textPrompt,
            currentQ.questionText.textDirection,
        );
        editModal
            .then(async (modifiedCardText) => {
                this.reviewSequencer.updateCurrentQuestionText(modifiedCardText);
            })
            .catch((reason) => console.log(reason));
    }

    private async _openNoteFromCardContext(
        notePath: string,
        openInNewLeaf: boolean,
    ): Promise<void> {
        this._minimizeToFloatingBar();
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return;
        await this.app.workspace.getLeaf(openInNewLeaf).openFile(file);
    }

    private _minimizeToFloatingBar(): void {
        if (this.isMinimized) return;
        this.isMinimized = true;
        this.plugin.uiManager.setSRViewInFocus(false);
        this.containerEl.addClass("sr-is-hidden");
        this._renderFloatingBar();
    }

    private _restoreFromFloatingBar(): void {
        if (!this.isMinimized) return;
        this.isMinimized = false;
        this.containerEl.removeClass("sr-is-hidden");
        this.cardContainer.resumeAfterFloatingBarRestore();
        this.plugin.uiManager.setSRViewInFocus(true);
        this._removeFloatingBar();
    }

    private _renderFloatingBar(): void {
        this._removeFloatingBar();
        const summary = this.cardContainer.getFloatingBarSummary();
        const bar = document.body.createDiv("sr-floating-bar");
        bar.setAttribute("role", "group");
        const icon = bar.createDiv("sr-floating-bar-icon");
        setIcon(icon, "panel-bottom");
        const label = bar.createDiv("sr-floating-bar-label");
        label.setText(`${t("REVIEW_CARDS")} • ${summary.deckName}`);
        const count = bar.createDiv("sr-floating-bar-count");
        count.setText(summary.counter);
        const restoreDeckButton = bar.createEl("button", {
            cls: "sr-floating-bar-restore",
            text: "復帰",
        });
        restoreDeckButton.type = "button";
        restoreDeckButton.title = "フラッシュカードへ戻る";
        restoreDeckButton.onclick = (e) => {
            e.stopPropagation();
            this._restoreToCardPanel();
        };
        const closeBarButton = bar.createEl("button", {
            cls: "sr-floating-bar-close",
            text: "×",
        });
        closeBarButton.type = "button";
        closeBarButton.title = "フラッシュカードレビューを閉じる";
        closeBarButton.onclick = (e) => {
            e.stopPropagation();
            this.close();
        };
        this._setupFloatingBarDrag(bar);
        if (this.floatingBarPosition) {
            this._applyFloatingBarPosition(bar, this.floatingBarPosition.left, this.floatingBarPosition.top);
        } else {
            const initialLeft = (window.innerWidth - bar.offsetWidth) / 2;
            const initialTop = Math.max(24, Math.round(window.innerHeight * 0.12));
            this._applyFloatingBarPosition(bar, initialLeft, initialTop);
        }
        this.floatingBarEl = bar;
    }

    private _restoreToCardPanel(): void {
        this._restoreFromFloatingBar();
    }

    private _setupFloatingBarDrag(bar: HTMLDivElement): void {
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let dragging = false;
        let dragMoved = false;

        const onPointerMove = (e: PointerEvent) => {
            if (!dragging) return;
            const nextLeft = startLeft + (e.clientX - startX);
            const nextTop = startTop + (e.clientY - startY);
            const moveDistance = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
            if (moveDistance > 4) dragMoved = true;
            this._applyFloatingBarPosition(bar, nextLeft, nextTop);
        };

        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            bar.removeClass("is-dragging");
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            const left = parseFloat(bar.style.left || "0");
            const top = parseFloat(bar.style.top || "0");
            this.floatingBarPosition = { left, top };
        };

        bar.addEventListener("pointerdown", (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest(".sr-floating-bar-restore, .sr-floating-bar-close")) return;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = bar.offsetLeft;
            startTop = bar.offsetTop;
            dragging = true;
            dragMoved = false;
            bar.addClass("is-dragging");
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
        });

        bar.addEventListener("click", (e) => {
            if (!dragMoved) return;
            e.preventDefault();
            e.stopPropagation();
            dragMoved = false;
        }, true);
    }

    private _applyFloatingBarPosition(bar: HTMLDivElement, left: number, top: number): void {
        const margin = 12;
        const maxLeft = window.innerWidth - bar.offsetWidth - margin;
        const maxTop = window.innerHeight - bar.offsetHeight - margin;
        const clampedLeft = Math.min(Math.max(left, margin), Math.max(maxLeft, margin));
        const clampedTop = Math.min(Math.max(top, margin), Math.max(maxTop, margin));
        bar.style.left = `${clampedLeft}px`;
        bar.style.top = `${clampedTop}px`;
        bar.style.right = "auto";
        bar.style.bottom = "auto";
    }

    private _removeFloatingBar(): void {
        if (!this.floatingBarEl) return;
        this.floatingBarEl.remove();
        this.floatingBarEl = null;
    }
}
