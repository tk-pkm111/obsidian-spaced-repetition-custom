import { App, MarkdownRenderer, Platform, TFile } from "obsidian";

import SRPlugin from "src/main";
import { MobileImagePreviewModal } from "src/ui/obsidian-ui-components/modals/mobile-image-preview-modal";
import EmulatedPlatform from "src/utils/platform-detector";
import { TextDirection } from "src/utils/strings";

export class RenderMarkdownWrapper {
    private app: App;
    private notePath: string;
    private plugin: SRPlugin;

    constructor(app: App, plugin: SRPlugin, notePath: string) {
        this.app = app;
        this.notePath = notePath;
        this.plugin = plugin;
    }

    // slightly modified version of the renderMarkdown function in
    // https://github.com/mgmeyers/obsidian-kanban/blob/main/src/KanbanView.tsx
    async renderMarkdownWrapper(
        markdownString: string,
        containerEl: HTMLElement,
        textDirection: TextDirection,
        recursiveDepth = 0,
    ): Promise<void> {
        if (recursiveDepth > 4) return;

        let el: HTMLElement;
        if (textDirection === TextDirection.Rtl) {
            el = containerEl.createDiv();
            el.setAttribute("dir", "rtl");
        } else el = containerEl;

        MarkdownRenderer.render(this.app, markdownString, el, this.notePath, this.plugin);

        // Keep wiki-link navigation support in review UI.
        el.findAll("a.internal-link").forEach((linkEl) => {
            linkEl.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const href =
                    linkEl.getAttribute("data-href") || linkEl.getAttribute("href") || "";
                if (href) {
                    this.app.workspace.openLinkText(href, this.notePath, false);
                }
            });
        });

        // Keep dead-link fallback, but do not override rendered embeds.
        // This preserves Obsidian/Excalidraw native image click behavior.
        el.findAll(".internal-embed").forEach((embedEl) => {
            const link = this.parseLink(embedEl.getAttribute("src"));
            if (!link.target) {
                embedEl.innerText = link.text;
                return;
            }

            if (link.target instanceof TFile && link.target.extension === "md") {
                // Markdown transclusions are handled by MarkdownRenderer.render().
            }
        });

        this.stabilizeBlobBackedImages(el);
    }

    private parseLink(src: string) {
        const linkComponentsRegex =
            /^(?<file>[^#^]+)?(?:#(?!\^)(?<heading>.+)|#\^(?<blockId>.+)|#)?$/;
        const matched = typeof src === "string" && src.match(linkComponentsRegex);
        const file = matched.groups.file || this.notePath;
        const target = this.plugin.app.metadataCache.getFirstLinkpathDest(file, this.notePath);
        return {
            text: matched[0],
            file: matched.groups.file,
            heading: matched.groups.heading,
            blockId: matched.groups.blockId,
            target: target,
        };
    }

    private stabilizeBlobBackedImages(rootEl: HTMLElement) {
        this.observeAddedBlobImages(rootEl);
        this.prepareBlobImages(rootEl);
        this.scheduleBlobImagePreparation(rootEl);
    }

    private observeAddedBlobImages(rootEl: HTMLElement) {
        type ObservedRoot = HTMLElement & {
            srBlobImageObserver?: MutationObserver;
            srBlobImageObserverCleanup?: number;
        };

        const observedRoot = rootEl as ObservedRoot;
        if (observedRoot.srBlobImageObserver) return;

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    if (node instanceof HTMLImageElement) {
                        this.prepareBlobImage(node);
                    }
                    node.querySelectorAll?.("img").forEach((imageEl) => {
                        if (imageEl instanceof HTMLImageElement) {
                            this.prepareBlobImage(imageEl);
                        }
                    });
                });
            }
        });

        observer.observe(rootEl, {
            subtree: true,
            childList: true,
        });

        observedRoot.srBlobImageObserver = observer;
        observedRoot.srBlobImageObserverCleanup = window.setTimeout(() => {
            observer.disconnect();
            observedRoot.srBlobImageObserver = undefined;
            observedRoot.srBlobImageObserverCleanup = undefined;
        }, 3000);
    }

    private prepareBlobImages(rootEl: HTMLElement) {
        rootEl.querySelectorAll("img").forEach((imageEl) => {
            if (!(imageEl instanceof HTMLImageElement)) return;
            this.prepareBlobImage(imageEl);
        });
    }

    private scheduleBlobImagePreparation(rootEl: HTMLElement) {
        type ScheduledRoot = HTMLElement & { srBlobImageTimers?: number[] };
        const scheduledRoot = rootEl as ScheduledRoot;
        if (scheduledRoot.srBlobImageTimers?.length) return;

        const delays = [80, 240, 700];
        scheduledRoot.srBlobImageTimers = delays.map((delay, index) =>
            window.setTimeout(() => {
                this.prepareBlobImages(rootEl);
                if (index === delays.length - 1) {
                    scheduledRoot.srBlobImageTimers = [];
                }
            }, delay),
        );
    }

    private prepareBlobImage(imageEl: HTMLImageElement) {
        type PreparedImage = HTMLImageElement & {
            srBlobPrepared?: boolean;
            srStableImageSrc?: string;
            srBlobFetchPromise?: Promise<void>;
            srFallbackImageSrc?: string;
            srMobilePreviewBound?: boolean;
        };
        const preparedImage = imageEl as PreparedImage;

        if (!preparedImage.srBlobPrepared) {
            preparedImage.srBlobPrepared = true;
            imageEl.addEventListener("load", () => {
                const currentLoadSrc = imageEl.currentSrc || imageEl.src || "";
                if (this.isLiveBlobSource(currentLoadSrc)) {
                    this.cacheBlobImageSource(imageEl, currentLoadSrc);
                }
            });
            imageEl.addEventListener("click", () => this.prepareImageForToolkit(imageEl), {
                capture: true,
            });
            imageEl.addEventListener("error", () => this.normalizeBrokenBlobBackedImage(imageEl));
        }

        if (this.isMobilePreviewEnabled() && !preparedImage.srMobilePreviewBound) {
            preparedImage.srMobilePreviewBound = true;
            imageEl.addEventListener(
                "click",
                (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void this.openMobileImagePreview(imageEl);
                },
                { capture: true },
            );
        }

        const currentSrc = imageEl.currentSrc || imageEl.src || "";
        if (preparedImage.srStableImageSrc && this.isBlobSource(currentSrc)) {
            imageEl.src = preparedImage.srStableImageSrc;
            imageEl.removeAttribute("srcset");
            return;
        }

        if (this.isLiveBlobSource(currentSrc)) {
            this.cacheBlobImageSource(imageEl, currentSrc);
        }
    }

    private prepareImageForToolkit(imageEl: HTMLImageElement) {
        const preparedImage = imageEl as HTMLImageElement & {
            srStableImageSrc?: string;
            srFallbackImageSrc?: string;
        };
        const currentSrc = imageEl.currentSrc || imageEl.src || "";

        if (preparedImage.srStableImageSrc) {
            if (currentSrc !== preparedImage.srStableImageSrc) {
                imageEl.src = preparedImage.srStableImageSrc;
                imageEl.removeAttribute("srcset");
            }
            return;
        }

        if (this.isLiveBlobSource(currentSrc)) {
            this.cacheBlobImageSource(imageEl, currentSrc);
            return;
        }

        this.normalizeBrokenBlobBackedImage(imageEl);
    }

    private async openMobileImagePreview(imageEl: HTMLImageElement): Promise<void> {
        const previewSrc = await this.resolveMobilePreviewSrc(imageEl);
        if (!previewSrc) return;

        new MobileImagePreviewModal(
            this.app,
            previewSrc,
            imageEl.getAttribute("alt") || imageEl.getAttribute("aria-label") || "",
        ).open();
    }

    private async resolveMobilePreviewSrc(
        imageEl: HTMLImageElement,
    ): Promise<string | null> {
        type PreparedImage = HTMLImageElement & {
            srStableImageSrc?: string;
            srBlobFetchPromise?: Promise<void>;
            srFallbackImageSrc?: string;
        };
        const preparedImage = imageEl as PreparedImage;
        const currentSrc = imageEl.currentSrc || imageEl.src || "";

        if (preparedImage.srStableImageSrc) {
            return preparedImage.srStableImageSrc;
        }

        if (currentSrc && !this.isBlobSource(currentSrc)) {
            return currentSrc;
        }

        if (this.isLiveBlobSource(currentSrc) && !preparedImage.srBlobFetchPromise) {
            this.cacheBlobImageSource(imageEl, currentSrc);
        }

        if (preparedImage.srBlobFetchPromise) {
            await preparedImage.srBlobFetchPromise;
        }

        if (preparedImage.srStableImageSrc) {
            return preparedImage.srStableImageSrc;
        }

        this.normalizeBrokenBlobBackedImage(imageEl);
        return (
            preparedImage.srStableImageSrc ||
            preparedImage.srFallbackImageSrc ||
            imageEl.currentSrc ||
            imageEl.src ||
            null
        );
    }

    private normalizeBrokenBlobBackedImage(imageEl: HTMLImageElement) {
        const preparedImage = imageEl as HTMLImageElement & {
            srStableImageSrc?: string;
            srFallbackImageSrc?: string;
        };
        const currentSrc = imageEl.currentSrc || imageEl.src || "";
        if (!this.isBlobSource(currentSrc)) return;

        if (preparedImage.srStableImageSrc) {
            imageEl.src = preparedImage.srStableImageSrc;
            imageEl.removeAttribute("srcset");
            return;
        }

        const fallbackDataUrl = this.captureImageAsDataUrl(imageEl);
        if (!fallbackDataUrl) {
            console.warn("SR image normalize: failed to stabilize blob image", {
                notePath: this.notePath,
                currentSrc,
                naturalWidth: imageEl.naturalWidth,
                naturalHeight: imageEl.naturalHeight,
            });
            return;
        }

        preparedImage.srFallbackImageSrc = fallbackDataUrl;
        imageEl.src = fallbackDataUrl;
        imageEl.removeAttribute("srcset");
    }

    private cacheBlobImageSource(imageEl: HTMLImageElement, blobSrc: string) {
        type PreparedImage = HTMLImageElement & {
            srStableImageSrc?: string;
            srBlobFetchPromise?: Promise<void>;
            srFallbackImageSrc?: string;
        };
        const preparedImage = imageEl as PreparedImage;
        if (preparedImage.srStableImageSrc || preparedImage.srBlobFetchPromise) return;

        preparedImage.srBlobFetchPromise = fetch(blobSrc)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.blob();
            })
            .then((blob) =>
                this.readBlobAsStableUrl(blob, imageEl).then((dataUrl) => ({
                    dataUrl,
                    blobType: blob.type,
                })),
            )
            .then(({ dataUrl, blobType }) => {
                preparedImage.srStableImageSrc = dataUrl;
                if (
                    imageEl.currentSrc === blobSrc ||
                    imageEl.src === blobSrc ||
                    imageEl.currentSrc === preparedImage.srFallbackImageSrc ||
                    imageEl.src === preparedImage.srFallbackImageSrc
                ) {
                    imageEl.src = dataUrl;
                    imageEl.removeAttribute("srcset");
                }
                void blobType;
            })
            .catch((error) => {
                console.warn("SR image normalize: failed to cache live blob image", {
                    notePath: this.notePath,
                    blobSrc,
                    error,
                });
            })
            .finally(() => {
                preparedImage.srBlobFetchPromise = undefined;
            });
    }

    private async readBlobAsStableUrl(
        blob: Blob,
        imageEl: HTMLImageElement,
    ): Promise<string> {
        if (blob.type.includes("image/svg+xml")) {
            const svgText = await blob.text();
            return this.upscaleSvgDataUrl(svgText, imageEl);
        }

        return this.readBlobAsDataUrl(blob);
    }

    private readBlobAsDataUrl(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") {
                    resolve(reader.result);
                } else {
                    reject(new Error("Failed to read blob as data url"));
                }
            };
            reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
            reader.readAsDataURL(blob);
        });
    }

    private upscaleSvgDataUrl(svgText: string, imageEl: HTMLImageElement): string {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, "image/svg+xml");
            const svgEl = doc.querySelector("svg");
            if (!svgEl) {
                return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
            }

            const viewBox = svgEl.getAttribute("viewBox");
            let width = this.parseSvgLength(svgEl.getAttribute("width"));
            let height = this.parseSvgLength(svgEl.getAttribute("height"));

            if ((!width || !height) && viewBox) {
                const [, , vbWidth, vbHeight] = viewBox.split(/[\s,]+/).map(Number);
                if (!width && Number.isFinite(vbWidth)) width = vbWidth;
                if (!height && Number.isFinite(vbHeight)) height = vbHeight;
            }

            if (!width || !height) {
                width = imageEl.naturalWidth || imageEl.clientWidth || 800;
                height = imageEl.naturalHeight || imageEl.clientHeight || 600;
            }

            const targetWidth = Math.max(width, 1600);
            const scale = targetWidth / width;
            const targetHeight = Math.max(Math.round(height * scale), height);

            svgEl.setAttribute("width", `${targetWidth}`);
            svgEl.setAttribute("height", `${targetHeight}`);
            if (!viewBox) {
                svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
            }

            const serialized = new XMLSerializer().serializeToString(svgEl);
            return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
        } catch {
            return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
        }
    }

    private parseSvgLength(value: string | null): number | null {
        if (!value) return null;
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private captureImageAsDataUrl(imageEl: HTMLImageElement): string | null {
        if (!imageEl.naturalWidth || !imageEl.naturalHeight) return null;

        const canvas = document.createElement("canvas");
        canvas.width = imageEl.naturalWidth;
        canvas.height = imageEl.naturalHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        try {
            ctx.drawImage(imageEl, 0, 0);
            return canvas.toDataURL("image/png");
        } catch {
            return null;
        }
    }

    private isBlobSource(src: string): boolean {
        return src.startsWith("blob:");
    }

    private isLiveBlobSource(src: string): boolean {
        return src.startsWith("blob:");
    }

    private isMobilePreviewEnabled(): boolean {
        return Platform.isMobile || EmulatedPlatform().isMobile;
    }
}
