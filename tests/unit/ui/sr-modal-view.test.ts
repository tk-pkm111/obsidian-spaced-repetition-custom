const modalClose = jest.fn();
const platformState = { isMobile: false, isPhone: false };

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
        Platform: platformState,
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
jest.mock("src/utils/platform-detector", () => jest.fn(() => ({ isMobile: false, isPhone: false })));

import EmulatedPlatform from "src/utils/platform-detector";
import { SRModalView } from "src/ui/obsidian-ui-components/modals/sr-modal-view";

describe("SRModalView modal scope handling", () => {
    beforeAll(() => {
        const proto = HTMLElement.prototype as HTMLElement & {
            createDiv?: (cls?: string) => HTMLDivElement;
            createEl?: <K extends keyof HTMLElementTagNameMap>(
                tag: K,
                options?: { cls?: string; text?: string },
            ) => HTMLElementTagNameMap[K];
            addClass?: (cls: string) => void;
            setText?: (text: string) => void;
        };

        if (!proto.addClass) {
            proto.addClass = function (cls: string) {
                this.classList.add(cls);
            };
        }

        if (!proto.createDiv) {
            proto.createDiv = function (cls?: string) {
                const el = document.createElement("div");
                if (cls) el.className = cls;
                this.append(el);
                return el;
            };
        }

        if (!proto.createEl) {
            proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
                tag: K,
                options?: { cls?: string; text?: string },
            ) {
                const el = document.createElement(tag);
                if (options?.cls) el.className = options.cls;
                if (options?.text) el.textContent = options.text;
                this.append(el);
                return el;
            };
        }

        if (!proto.setText) {
            proto.setText = function (text: string) {
                this.textContent = text;
            };
        }
    });

    const createView = () => {
        const { TFile } = jest.requireMock("obsidian");
        const openFile = jest.fn();
        const getLeaf = jest.fn(() => ({ openFile }));
        const openLinkText = jest.fn();

        const view: any = Object.create(SRModalView.prototype);

        view.app = {
            workspace: {
                getLeaf,
                openLinkText,
            },
            vault: {
                getAbstractFileByPath: jest.fn(() => new TFile()),
            },
            keymap: {
                pushScope: jest.fn(),
                popScope: jest.fn(),
            },
        };
        view.scope = { id: "sr-modal-scope" };
        view.isModalScopeSuspended = false;
        view.cardContainer = {
            getFloatingBarSummary: jest.fn(() => ({
                deckName: "cornell",
                counter: "2/20",
            })),
        };
        view._minimizeToFloatingBar = jest.fn();
        view._removeFloatingBar = jest.fn();
        view._setupFloatingBarDrag = jest.fn();
        view._applyFloatingBarPosition = jest.fn();
        view.floatingBarPosition = null;

        return view;
    };

    beforeEach(() => {
        modalClose.mockReset();
        platformState.isMobile = false;
        platformState.isPhone = false;
        (EmulatedPlatform as jest.Mock).mockReturnValue({ isMobile: false, isPhone: false });
        document.body.innerHTML = "";
        document.body.className = "";
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

    test("opens the card context note through openLinkText on mobile before minimizing", async () => {
        const view = createView();
        platformState.isMobile = true;
        (EmulatedPlatform as jest.Mock).mockReturnValue({ isMobile: true, isPhone: true });

        await (view as any)._openNoteFromCardContext("notes/a.md", false);

        expect(view.app.workspace.openLinkText).toHaveBeenCalledWith("notes/a.md", "", false);
        expect(view._minimizeToFloatingBar).toHaveBeenCalledTimes(1);
        expect(view.app.workspace.getLeaf).not.toHaveBeenCalled();
    });

    test("opens the card context note via openFile on desktop", async () => {
        const view = createView();

        await (view as any)._openNoteFromCardContext("notes/a.md", true);

        expect(view._minimizeToFloatingBar).toHaveBeenCalledTimes(1);
        expect(view.app.workspace.getLeaf).toHaveBeenCalledWith(true);
        expect(view.app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    test("uses a compact floating bar label on phones", () => {
        const view = createView();
        platformState.isPhone = true;
        document.body.classList.add("is-phone");

        (view as any)._renderFloatingBar();

        const bar = document.body.querySelector(".sr-floating-bar");
        const label = document.body.querySelector(".sr-floating-bar-label");

        expect(bar?.classList.contains("is-compact")).toBe(true);
        expect(label?.textContent).toBe("cornell");
    });
});
