const modalClose = jest.fn();

jest.mock("obsidian", () => {
    class Modal {
        app: unknown;
        scope: unknown;
        containerEl: HTMLDivElement;
        modalEl: HTMLDivElement;
        contentEl: HTMLDivElement;

        constructor(app: unknown) {
            this.app = app;
            this.scope = { id: "sr-modal-scope" };
            this.containerEl = document.createElement("div");
            this.modalEl = document.createElement("div");
            this.contentEl = document.createElement("div");
        }

        close() {
            modalClose();
        }
    }

    return {
        App: class {},
        Modal,
        Platform: { isMobile: false },
        TFile: class {},
        setIcon: jest.fn(),
    };
});

jest.mock("src/card/flashcard-review-sequencer", () => ({
    FlashcardReviewMode: { Review: "review" },
}));
jest.mock("src/card/questions/question", () => ({}));
jest.mock("src/deck/deck", () => ({}));
jest.mock("src/lang/helpers", () => ({ t: (value: string) => value }));
jest.mock(
    "src/ui/obsidian-ui-components/content-container/card-container/card-container",
    () => ({ CardContainer: class {} }),
);
jest.mock("src/ui/obsidian-ui-components/content-container/deck-container", () => ({
    DeckContainer: class {},
}));
jest.mock("src/ui/obsidian-ui-components/modals/edit-modal", () => ({
    FlashcardEditModal: { Prompt: jest.fn() },
}));
jest.mock("src/utils/platform-detector", () => jest.fn(() => ({ isMobile: false })));

import { SRModalView } from "src/ui/obsidian-ui-components/modals/sr-modal-view";

describe("SRModalView modal scope handling", () => {
    const createView = () => {
        const view: any = Object.create(SRModalView.prototype);

        view.app = {
            keymap: {
                pushScope: jest.fn(),
                popScope: jest.fn(),
            },
        };
        view.scope = { id: "sr-modal-scope" };
        view.isModalScopeSuspended = false;

        return view;
    };

    beforeEach(() => {
        modalClose.mockReset();
        document.body.innerHTML = "";
    });

    test("suspends the modal scope once and blurs the focused element", () => {
        const view = createView();
        const input = document.createElement("input");
        document.body.append(input);
        input.focus();

        (view as any)._suspendModalScope();
        (view as any)._suspendModalScope();

        expect(view.app.keymap.popScope).toHaveBeenCalledTimes(1);
        expect(view.app.keymap.popScope).toHaveBeenCalledWith(view.scope);
        expect(document.activeElement).not.toBe(input);
        expect(view.isModalScopeSuspended).toBe(true);
    });

    test("resumes the modal scope once after suspension", () => {
        const view = createView();

        (view as any)._suspendModalScope();
        (view as any)._resumeModalScope();
        (view as any)._resumeModalScope();

        expect(view.app.keymap.pushScope).toHaveBeenCalledTimes(1);
        expect(view.app.keymap.pushScope).toHaveBeenCalledWith(view.scope);
        expect(view.isModalScopeSuspended).toBe(false);
    });

    test("restores the modal scope before closing", () => {
        const view = createView();

        (view as any)._suspendModalScope();
        view.close();

        expect(view.app.keymap.pushScope).toHaveBeenCalledTimes(1);
        expect(modalClose).toHaveBeenCalledTimes(1);
        expect(view.isModalScopeSuspended).toBe(false);
    });
});
