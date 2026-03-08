const closeMock = jest.fn();

jest.mock("obsidian", () => {
    class Modal {
        app: unknown;
        modalEl: HTMLDivElement;
        contentEl: HTMLDivElement;

        constructor(app: unknown) {
            this.app = app;
            this.modalEl = document.createElement("div");
            this.modalEl.className = "modal";
            this.contentEl = document.createElement("div");
            this.contentEl.className = "modal-content";
            this.modalEl.append(this.contentEl);
        }

        close() {
            closeMock();
        }
    }

    return {
        App: class {},
        Modal,
    };
});

import { MobileImagePreviewModal } from "src/ui/obsidian-ui-components/modals/mobile-image-preview-modal";

describe("MobileImagePreviewModal", () => {
    beforeEach(() => {
        closeMock.mockReset();
        document.body.innerHTML = "";
    });

    test("renders the preview UI and toggles zoom on image tap", () => {
        const modal = new MobileImagePreviewModal({} as any, "https://example.com/card.png", "caption");

        modal.onOpen();

        const image = modal.contentEl.querySelector(".sr-mobile-image-preview-image");
        const stage = modal.contentEl.querySelector(".sr-mobile-image-preview-stage");
        const caption = modal.contentEl.querySelector(".sr-mobile-image-preview-caption");

        expect(caption?.textContent).toBe("caption");
        expect(image).not.toBeNull();
        expect(stage).not.toBeNull();

        image?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(stage?.classList.contains("is-zoomed")).toBe(true);
        expect(image?.classList.contains("is-zoomed")).toBe(true);

        image?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(stage?.classList.contains("is-zoomed")).toBe(false);
        expect(image?.classList.contains("is-zoomed")).toBe(false);
    });

    test("closes when the background or close button is pressed", () => {
        const modal = new MobileImagePreviewModal({} as any, "https://example.com/card.png", "caption");

        modal.onOpen();

        const stage = modal.contentEl.querySelector(".sr-mobile-image-preview-stage");
        const closeButton = modal.contentEl.querySelector(
            ".sr-mobile-image-preview-close",
        ) as HTMLButtonElement | null;

        stage?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        closeButton?.click();

        expect(closeMock).toHaveBeenCalledTimes(2);
    });
});
