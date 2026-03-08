const renderMock = jest.fn();
const platformState = { isMobile: false };
const openMock = jest.fn();

jest.mock("obsidian", () => ({
    App: class {},
    MarkdownRenderer: {
        render: (...args: unknown[]) => renderMock(...args),
    },
    Platform: platformState,
    TFile: class {},
}));

jest.mock("src/utils/platform-detector", () => jest.fn(() => ({ isMobile: false })));
jest.mock("src/ui/obsidian-ui-components/modals/mobile-image-preview-modal", () => ({
    MobileImagePreviewModal: jest.fn().mockImplementation(() => ({
        open: openMock,
    })),
}));

import { RenderMarkdownWrapper } from "src/utils/renderers";
import EmulatedPlatform from "src/utils/platform-detector";
import { TextDirection } from "src/utils/strings";
import { MobileImagePreviewModal } from "src/ui/obsidian-ui-components/modals/mobile-image-preview-modal";

describe("RenderMarkdownWrapper mobile image preview", () => {
    beforeAll(() => {
        const elementPrototype = HTMLElement.prototype as HTMLElement & {
            findAll?: (selector: string) => Element[];
        };

        if (!elementPrototype.findAll) {
            elementPrototype.findAll = function (selector: string) {
                return Array.from(this.querySelectorAll(selector)) as HTMLElement[];
            };
        }
    });

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = "";
        renderMock.mockReset();
        openMock.mockReset();
        (MobileImagePreviewModal as jest.Mock).mockClear();
        platformState.isMobile = false;
        (EmulatedPlatform as jest.Mock).mockReturnValue({ isMobile: false });
        renderMock.mockImplementation((_app, _markdown, el: HTMLElement) => {
            const image = document.createElement("img");
            image.src = "https://example.com/card.png";
            image.alt = "preview";
            el.append(image);
        });
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test("opens the mobile image preview when an image is tapped on mobile", async () => {
        platformState.isMobile = true;
        (EmulatedPlatform as jest.Mock).mockReturnValue({ isMobile: true });

        const app: any = { workspace: { openLinkText: jest.fn() } };
        const wrapper = new RenderMarkdownWrapper(app, {} as any, "note.md");
        const container = document.createElement("div");

        await wrapper.renderMarkdownWrapper("![[]]", container, TextDirection.Ltr);

        const image = container.querySelector("img");
        expect(image).not.toBeNull();

        image?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await Promise.resolve();

        expect(MobileImagePreviewModal as jest.Mock).toHaveBeenCalledWith(
            app,
            "https://example.com/card.png",
            "preview",
        );
        expect(openMock).toHaveBeenCalledTimes(1);
    });

    test("does not open the mobile image preview on desktop", async () => {
        const app: any = { workspace: { openLinkText: jest.fn() } };
        const wrapper = new RenderMarkdownWrapper(app, {} as any, "note.md");
        const container = document.createElement("div");

        await wrapper.renderMarkdownWrapper("![[]]", container, TextDirection.Ltr);

        const image = container.querySelector("img");
        expect(image).not.toBeNull();

        image?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await Promise.resolve();

        expect(MobileImagePreviewModal as jest.Mock).not.toHaveBeenCalled();
        expect(openMock).not.toHaveBeenCalled();
    });
});
