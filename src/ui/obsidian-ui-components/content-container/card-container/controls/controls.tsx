import { Platform } from "obsidian";

import BackButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/back-button";
import CardInfoButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/card-info-button";
import EditButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/edit-button";
import MinimizeToFloatingBarButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/minimize-to-floating-bar-button";
import ResetButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/reset-button";
import SkipButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/skip-button";
import ModalCloseButtonComponent from "src/ui/obsidian-ui-components/content-container/modal-close-button";
import EmulatedPlatform from "src/utils/platform-detector";
import PreviousCardButtonComponent from "src/ui/obsidian-ui-components/content-container/card-container/controls/previous-card-button";

export default class ControlsComponent {
    public controls: HTMLDivElement;
    public backButton: BackButtonComponent;
    public modalCloseButton: ModalCloseButtonComponent;
    public editButton: EditButtonComponent;
    public resetButton: ResetButtonComponent;
    public infoButton: CardInfoButtonComponent;
    public previousCardButton: PreviousCardButtonComponent;
    public skipButton: SkipButtonComponent;
    public minimizeToFloatingBarButton: MinimizeToFloatingBarButtonComponent;

    constructor(
        container: HTMLElement,
        isModal: boolean,
        backToDeck: () => void,
        editClickHandler: () => void,
        hideAnswer: () => void,
        displayCurrentCardInfoNotice: () => void,
        skipCurrentCard: () => void,
        goToPreviousCard: () => void,
        minimizeToFloatingBar?: () => void,
        closeModal?: () => void,
    ) {
        this.controls = container.createDiv();
        this.controls.addClass("sr-controls");

        this.backButton = new BackButtonComponent(this.controls, () => backToDeck(), [
            (EmulatedPlatform().isPhone || Platform.isPhone) && isModal
                ? "mod-raised"
                : "clickable-icon",
        ]);

        this.controls.createDiv().addClass("sr-flex-spacer");

        this.editButton = new EditButtonComponent(
            this.controls,
            () => editClickHandler(),
            EmulatedPlatform().isPhone || Platform.isPhone ? ["mod-raised"] : undefined,
        );

        this.resetButton = new ResetButtonComponent(
            this.controls,
            () => hideAnswer(),
            EmulatedPlatform().isPhone || Platform.isPhone ? ["mod-raised"] : undefined,
        );

        this.infoButton = new CardInfoButtonComponent(
            this.controls,
            () => displayCurrentCardInfoNotice(),
            EmulatedPlatform().isPhone || Platform.isPhone ? ["mod-raised"] : undefined,
        );

        this.previousCardButton = new PreviousCardButtonComponent(
            this.controls,
            () => goToPreviousCard(),
            EmulatedPlatform().isPhone || Platform.isPhone ? ["mod-raised"] : undefined,
        );
        this.previousCardButton.setDisabled(true);

        this.skipButton = new SkipButtonComponent(
            this.controls,
            () => skipCurrentCard(),
            EmulatedPlatform().isPhone || Platform.isPhone ? ["mod-raised"] : undefined,
        );

        this.controls.createDiv().addClass("sr-flex-spacer");

        this.minimizeToFloatingBarButton = new MinimizeToFloatingBarButtonComponent(
            this.controls,
            () => minimizeToFloatingBar && minimizeToFloatingBar(),
            [
                !isModal && "sr-hide-by-scaling",
                !isModal && "hide-height",
                EmulatedPlatform().isPhone || Platform.isPhone ? "mod-raised" : "clickable-icon",
            ],
        );

        this.modalCloseButton = new ModalCloseButtonComponent(
            this.controls,
            () => closeModal && closeModal(),
            [
                !closeModal && "sr-hide-by-scaling",
                !closeModal && "hide-height",
                EmulatedPlatform().isPhone || Platform.isPhone ? "mod-raised" : "clickable-icon",
            ],
        );
    }
}
