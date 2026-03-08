import { App, Modal } from "obsidian";

export class MobileImagePreviewModal extends Modal {
    private imageSrc: string;
    private altText: string;

    constructor(app: App, imageSrc: string, altText = "") {
        super(app);
        this.imageSrc = imageSrc;
        this.altText = altText;
    }

    onOpen(): void {
        this.modalEl.classList.add("sr-mobile-image-preview-modal");
        this.contentEl.replaceChildren();
        this.contentEl.classList.add("sr-mobile-image-preview-content");

        const toolbar = document.createElement("div");
        toolbar.className = "sr-mobile-image-preview-toolbar";
        const caption = document.createElement("div");
        caption.className = "sr-mobile-image-preview-caption";
        caption.textContent = this.altText;
        toolbar.append(caption);

        const closeButton = document.createElement("button");
        closeButton.className = "sr-mobile-image-preview-close";
        closeButton.textContent = "閉じる";
        closeButton.type = "button";
        closeButton.onclick = () => this.close();
        toolbar.append(closeButton);

        const stage = document.createElement("div");
        stage.className = "sr-mobile-image-preview-stage";

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
            event.stopPropagation();
            stage.classList.toggle("is-zoomed");
            image.classList.toggle("is-zoomed");
        });

        stage.addEventListener("click", (event) => {
            if (event.target === stage) {
                this.close();
            }
        });

        this.contentEl.append(toolbar, stage);
    }
}
