jest.mock("obsidian", () => ({
    App: class {},
}));

import { MobileImagePreviewModal } from "src/ui/obsidian-ui-components/modals/mobile-image-preview-modal";

describe("MobileImagePreviewModal", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    test("renders the preview overlay", () => {
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
    });

    test("updates scale gradually for pinch gestures and clamps panning", () => {
        const modal = new MobileImagePreviewModal({} as any, "https://example.com/card.png", "caption");

        modal.open();

        const stage = document.body.querySelector(
            ".sr-mobile-image-preview-stage",
        ) as HTMLDivElement | null;
        const image = document.body.querySelector(
            ".sr-mobile-image-preview-image",
        ) as HTMLImageElement | null;

        expect(stage).not.toBeNull();
        expect(image).not.toBeNull();

        Object.defineProperty(stage, "clientWidth", { value: 200, configurable: true });
        Object.defineProperty(stage, "clientHeight", { value: 200, configurable: true });
        Object.defineProperty(image, "clientWidth", { value: 300, configurable: true });
        Object.defineProperty(image, "clientHeight", { value: 100, configurable: true });

        (modal as any).touchStartHandler({
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 100, clientY: 0 },
            ],
            preventDefault: jest.fn(),
        });
        (modal as any).touchMoveHandler({
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 160, clientY: 0 },
            ],
            preventDefault: jest.fn(),
        });

        expect((modal as any).scale).toBeCloseTo(1.6);
        expect(stage?.classList.contains("is-zoomed")).toBe(true);
        expect(image?.style.transform).toContain("scale(1.6)");

        (modal as any).applyTranslation(999, 999);
        expect((modal as any).translateX).toBeGreaterThan(0);
        expect((modal as any).translateY).toBe(0);

        (modal as any).applyScale(0.8);
        expect((modal as any).scale).toBe(1);
        expect((modal as any).translateX).toBe(0);
        expect((modal as any).translateY).toBe(0);
        expect(stage?.classList.contains("is-zoomed")).toBe(false);
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
