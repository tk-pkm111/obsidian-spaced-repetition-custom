jest.mock("obsidian", () => ({
    App: class {},
}));

import { MobileImagePreviewModal } from "src/ui/obsidian-ui-components/modals/mobile-image-preview-modal";

describe("MobileImagePreviewModal", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    test("renders the preview overlay and toggles zoom on image tap", () => {
        const modal = new MobileImagePreviewModal({} as any, "https://example.com/card.png", "caption");

        modal.open();

        const overlay = document.body.querySelector(".sr-mobile-image-preview-overlay");
        const image = document.body.querySelector(".sr-mobile-image-preview-image");
        const stage = document.body.querySelector(".sr-mobile-image-preview-stage");
        const caption = document.body.querySelector(".sr-mobile-image-preview-caption");

        expect(overlay).not.toBeNull();
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

    test("closes when the background, close button, or escape key is pressed", () => {
        const modal = new MobileImagePreviewModal({} as any, "https://example.com/card.png", "caption");

        modal.open();
        const closeButton = document.body.querySelector(
            ".sr-mobile-image-preview-close",
        ) as HTMLButtonElement | null;

        closeButton?.click();
        expect(document.body.querySelector(".sr-mobile-image-preview-overlay")).toBeNull();

        modal.open();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(document.body.querySelector(".sr-mobile-image-preview-overlay")).toBeNull();

        modal.open();
        const overlay = document.body.querySelector(".sr-mobile-image-preview-overlay");
        overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(document.body.querySelector(".sr-mobile-image-preview-overlay")).toBeNull();
    });
});
