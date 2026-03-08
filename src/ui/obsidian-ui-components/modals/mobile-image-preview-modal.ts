import { App } from "obsidian";

export class MobileImagePreviewModal {
    private static activePreview: MobileImagePreviewModal | null = null;

    private overlayEl: HTMLDivElement | null = null;
    private keydownHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            this.close();
        }
    };

    constructor(
        private readonly app: App,
        private readonly imageSrc: string,
        private readonly altText = "",
    ) {}

    open(): void {
        void this.app;
        MobileImagePreviewModal.activePreview?.close();

        const overlay = document.createElement("div");
        overlay.className = "sr-mobile-image-preview-overlay";

        const shell = document.createElement("div");
        shell.className = "sr-mobile-image-preview-shell";
        overlay.append(shell);

        const toolbar = document.createElement("div");
        toolbar.className = "sr-mobile-image-preview-toolbar";
        shell.append(toolbar);

        const caption = document.createElement("div");
        caption.className = "sr-mobile-image-preview-caption";
        caption.textContent = this.altText;
        toolbar.append(caption);

        const closeButton = document.createElement("button");
        closeButton.className = "sr-mobile-image-preview-close";
        closeButton.textContent = "閉じる";
        closeButton.type = "button";
        closeButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.close();
        };
        toolbar.append(closeButton);

        const stage = document.createElement("div");
        stage.className = "sr-mobile-image-preview-stage";
        shell.append(stage);

        const image = document.createElement("img");
        image.className = "sr-mobile-image-preview-image";
        image.src = this.imageSrc;
        image.alt = this.altText || "Flashcard image preview";
        image.draggable = false;
        stage.append(image);

        const hint = document.createElement("div");
        hint.className = "sr-mobile-image-preview-hint";
        hint.textContent = "画像をタップで拡大・縮小";
        stage.append(hint);

        image.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            stage.classList.toggle("is-zoomed");
            image.classList.toggle("is-zoomed");
        });

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay || event.target === stage) {
                this.close();
            }
        });

        document.body.append(overlay);
        document.addEventListener("keydown", this.keydownHandler, true);
        this.overlayEl = overlay;
        MobileImagePreviewModal.activePreview = this;
    }

    close(): void {
        if (!this.overlayEl) return;

        this.overlayEl.remove();
        this.overlayEl = null;
        document.removeEventListener("keydown", this.keydownHandler, true);

        if (MobileImagePreviewModal.activePreview === this) {
            MobileImagePreviewModal.activePreview = null;
        }
    }
}
