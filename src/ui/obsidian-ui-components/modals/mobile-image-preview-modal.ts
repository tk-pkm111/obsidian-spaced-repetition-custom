import { App } from "obsidian";

export class MobileImagePreviewModal {
    private static activePreview: MobileImagePreviewModal | null = null;
    private static readonly MIN_SCALE = 1;
    private static readonly MAX_SCALE = 4;

    private overlayEl: HTMLDivElement | null = null;
    private stageEl: HTMLDivElement | null = null;
    private imageEl: HTMLImageElement | null = null;
    private scale = MobileImagePreviewModal.MIN_SCALE;
    private translateX = 0;
    private translateY = 0;
    private pinchStartDistance = 0;
    private pinchStartScale = MobileImagePreviewModal.MIN_SCALE;
    private panStartX = 0;
    private panStartY = 0;
    private panStartTranslateX = 0;
    private panStartTranslateY = 0;
    private keydownHandler = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            this.close();
        }
    };
    private readonly touchStartHandler = (event: TouchEvent) => {
        if (!this.imageEl || !this.stageEl) return;

        if (event.touches.length >= 2) {
            event.preventDefault();
            this.pinchStartDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
            this.pinchStartScale = this.scale;
            return;
        }

        if (event.touches.length === 1 && this.scale > MobileImagePreviewModal.MIN_SCALE) {
            event.preventDefault();
            this.panStartX = event.touches[0].clientX;
            this.panStartY = event.touches[0].clientY;
            this.panStartTranslateX = this.translateX;
            this.panStartTranslateY = this.translateY;
        }
    };
    private readonly touchMoveHandler = (event: TouchEvent) => {
        if (!this.imageEl || !this.stageEl) return;

        if (event.touches.length >= 2) {
            event.preventDefault();
            const nextDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
            if (!this.pinchStartDistance) {
                this.pinchStartDistance = nextDistance;
                this.pinchStartScale = this.scale;
                return;
            }

            const nextScale = this.pinchStartScale * (nextDistance / this.pinchStartDistance);
            this.applyScale(nextScale);
            return;
        }

        if (event.touches.length === 1 && this.scale > MobileImagePreviewModal.MIN_SCALE) {
            event.preventDefault();
            const deltaX = event.touches[0].clientX - this.panStartX;
            const deltaY = event.touches[0].clientY - this.panStartY;
            this.applyTranslation(
                this.panStartTranslateX + deltaX,
                this.panStartTranslateY + deltaY,
            );
        }
    };
    private readonly touchEndHandler = (event: TouchEvent) => {
        if (event.touches.length >= 2) {
            this.pinchStartDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
            this.pinchStartScale = this.scale;
            return;
        }

        if (event.touches.length === 1 && this.scale > MobileImagePreviewModal.MIN_SCALE) {
            this.panStartX = event.touches[0].clientX;
            this.panStartY = event.touches[0].clientY;
            this.panStartTranslateX = this.translateX;
            this.panStartTranslateY = this.translateY;
            return;
        }

        this.pinchStartDistance = 0;
        this.pinchStartScale = this.scale;
        if (this.scale <= MobileImagePreviewModal.MIN_SCALE + 0.01) {
            this.resetTransform();
        } else {
            this.applyTranslation(this.translateX, this.translateY);
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
        this.resetTransform();

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
        this.stageEl = stage;

        const image = document.createElement("img");
        image.className = "sr-mobile-image-preview-image";
        image.src = this.imageSrc;
        image.alt = this.altText || "Flashcard image preview";
        image.draggable = false;
        stage.append(image);
        this.imageEl = image;

        const hint = document.createElement("div");
        hint.className = "sr-mobile-image-preview-hint";
        hint.textContent = "2本指で拡大・縮小、1本指で移動";
        stage.append(hint);

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                this.close();
            }
        });
        stage.addEventListener("touchstart", this.touchStartHandler, { passive: false });
        stage.addEventListener("touchmove", this.touchMoveHandler, { passive: false });
        stage.addEventListener("touchend", this.touchEndHandler, { passive: false });
        stage.addEventListener("touchcancel", this.touchEndHandler, { passive: false });

        document.body.append(overlay);
        document.addEventListener("keydown", this.keydownHandler, true);
        this.overlayEl = overlay;
        MobileImagePreviewModal.activePreview = this;
        this.updateTransform();
    }

    close(): void {
        if (!this.overlayEl) return;

        this.overlayEl.remove();
        this.overlayEl = null;
        this.stageEl = null;
        this.imageEl = null;
        document.removeEventListener("keydown", this.keydownHandler, true);

        if (MobileImagePreviewModal.activePreview === this) {
            MobileImagePreviewModal.activePreview = null;
        }
    }

    private resetTransform(): void {
        this.scale = MobileImagePreviewModal.MIN_SCALE;
        this.translateX = 0;
        this.translateY = 0;
        this.pinchStartDistance = 0;
        this.pinchStartScale = this.scale;
    }

    private applyScale(nextScale: number): void {
        const clampedScale = this.clamp(
            nextScale,
            MobileImagePreviewModal.MIN_SCALE,
            MobileImagePreviewModal.MAX_SCALE,
        );
        this.scale = clampedScale;

        const translation = this.clampTranslation(this.translateX, this.translateY, clampedScale);
        this.translateX = translation.x;
        this.translateY = translation.y;

        if (this.scale <= MobileImagePreviewModal.MIN_SCALE + 0.01) {
            this.translateX = 0;
            this.translateY = 0;
        }

        this.updateTransform();
    }

    private applyTranslation(nextX: number, nextY: number): void {
        const translation = this.clampTranslation(nextX, nextY, this.scale);
        this.translateX = translation.x;
        this.translateY = translation.y;
        this.updateTransform();
    }

    private clampTranslation(nextX: number, nextY: number, scale: number) {
        if (!this.stageEl || !this.imageEl) {
            return { x: nextX, y: nextY };
        }

        const maxTranslateX = Math.max(
            0,
            (this.imageEl.clientWidth * scale - this.stageEl.clientWidth) / 2,
        );
        const maxTranslateY = Math.max(
            0,
            (this.imageEl.clientHeight * scale - this.stageEl.clientHeight) / 2,
        );

        return {
            x: this.clamp(nextX, -maxTranslateX, maxTranslateX),
            y: this.clamp(nextY, -maxTranslateY, maxTranslateY),
        };
    }

    private updateTransform(): void {
        if (!this.stageEl || !this.imageEl) return;

        const isZoomed = this.scale > MobileImagePreviewModal.MIN_SCALE + 0.01;
        this.stageEl.classList.toggle("is-zoomed", isZoomed);
        this.imageEl.classList.toggle("is-zoomed", isZoomed);
        this.imageEl.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.scale})`;
    }

    private getTouchDistance(firstTouch: Touch, secondTouch: Touch): number {
        const deltaX = secondTouch.clientX - firstTouch.clientX;
        const deltaY = secondTouch.clientY - firstTouch.clientY;
        return Math.hypot(deltaX, deltaY);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }
}
