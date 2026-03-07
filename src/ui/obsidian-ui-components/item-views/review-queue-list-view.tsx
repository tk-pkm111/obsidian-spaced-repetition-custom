import { ItemView, Menu, Modal, Notice, TFile, WorkspaceLeaf } from "obsidian";

import { TICKS_PER_DAY } from "src/constants";
import SRPlugin from "src/main";
import { NextNoteReviewHandler } from "src/note/next-note-review-handler";
import { NoteReviewDeck, SchedNote } from "src/note/note-review-deck";
import { NoteReviewQueue } from "src/note/note-review-queue";
import { SRSettings } from "src/settings";
import { formatDateYYYYMMDD, globalDateProvider } from "src/utils/dates";

export const REVIEW_QUEUE_VIEW_TYPE = "review-queue-list-view";

// ─── Today Notes Modal ───
class TodayNotesModal extends Modal {
    private todayNotesByDeck: Map<string, SchedNote[]>;

    constructor(app: import("obsidian").App, todayNotesByDeck: Map<string, SchedNote[]>) {
        super(app);
        this.todayNotesByDeck = todayNotesByDeck;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("sr-today-modal");

        const header = contentEl.createDiv("sr-today-modal-header");
        header.setText("📝 本日分のノート");

        if (this.todayNotesByDeck.size === 0) {
            contentEl.createDiv("sr-today-modal-empty").setText("本日分のノートはありません");
            return;
        }

        for (const [deckKey, notes] of this.todayNotesByDeck) {
            const deckSection = contentEl.createDiv("sr-today-modal-deck");
            deckSection.createDiv("sr-today-modal-deck-header").setText(deckKey);

            const noteList = deckSection.createDiv("sr-today-modal-note-list");
            for (const sNote of notes) {
                const noteItem = noteList.createDiv("sr-today-modal-note-item");
                noteItem.createDiv("sr-note-dot");
                noteItem.createDiv("sr-note-name").setText(sNote.note.basename);
                noteItem.addEventListener("click", () => {
                    this.app.workspace.openLinkText(sNote.note.path, "", false);
                    this.close();
                });
            }
        }
    }
}

// ─── Main View ───
export class ReviewQueueListView extends ItemView {
    private get noteReviewQueue(): NoteReviewQueue {
        return this.nextNoteReviewHandler.noteReviewQueue;
    }
    private settings: SRSettings;
    private nextNoteReviewHandler: NextNoteReviewHandler;
    private plugin: SRPlugin;
    // Persistent toggle state: Map<deckKey, Set<folderId>> — survives redraws
    private _userToggles: Map<string, Set<string>> = new Map();

    constructor(
        leaf: WorkspaceLeaf,
        nextNoteReviewHandler: NextNoteReviewHandler,
        settings: SRSettings,
        plugin: SRPlugin,
    ) {
        super(leaf);
        this.nextNoteReviewHandler = nextNoteReviewHandler;
        this.settings = settings;
        this.plugin = plugin;

        if (this.settings.enableNoteReviewPaneOnStartup) {
            this.registerEvent(this.app.workspace.on("file-open", () => this.redraw()));
            this.registerEvent(this.app.vault.on("rename", () => this.redraw()));
        }
    }

    public getViewType(): string {
        return REVIEW_QUEUE_VIEW_TYPE;
    }

    public getDisplayText(): string {
        return "Notes Review Queue";
    }

    public getIcon(): string {
        return "SpacedRepIcon";
    }

    public onHeaderMenu(menu: Menu): void {
        menu.addItem((item) => {
            item.setTitle("Close")
                .setIcon("cross")
                .onClick(() => {
                    this.app.workspace.detachLeavesOfType(REVIEW_QUEUE_VIEW_TYPE);
                });
        });
    }

    public redraw(): void {
        if (!this.noteReviewQueue.reviewDecks) return;

        // Clear activeFolders then restore user's manual toggles
        for (const [deckKey, deck] of this.noteReviewQueue.reviewDecks) {
            deck.activeFolders.clear();
            const saved = this._userToggles.get(deckKey);
            if (saved) {
                for (const id of saved) deck.activeFolders.add(id);
            }
        }

        this.contentEl.empty();
        this.contentEl.addClass("sr-note-review-page");

        const now = Date.now();
        const maxDaysToRender = this.settings.maxNDaysNotesReviewQueue;
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const todayDateStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
        const activeFile = this.app.workspace.getActiveFile();

        // Compute totals across all decks
        let totalOverdue = 0;
        let totalDueToday = 0;
        let totalNew = 0;
        for (const [, deck] of this.noteReviewQueue.reviewDecks) {
            for (const sNote of deck.scheduledNotes) {
                const nDays = Math.ceil((sNote.dueUnix - now) / TICKS_PER_DAY);
                if (nDays < 0) totalOverdue++;
                else if (nDays === 0) totalDueToday++;
            }
            totalNew += deck.newNotes.length;
        }

        // — Container —
        const containerEl = createDiv("sr-review-queue-container");
        this.contentEl.appendChild(containerEl);

        // — Dashboard Card —
        const dashCard = containerEl.createDiv("sr-dashboard-card");

        // Date header with action buttons
        const dateHeader = dashCard.createDiv("sr-dashboard-header");
        const dateStr = new Date().toLocaleDateString("ja-JP", {
            month: "long",
            day: "numeric",
            weekday: "short",
        });
        dateHeader.createDiv("sr-dashboard-header-text").setText(`今日  ${dateStr}`);

        const headerBtns = dateHeader.createDiv("sr-dashboard-header-btns");

        // Reveal Active File button
        const revealBtn = headerBtns.createDiv("sr-collapse-all-btn");
        revealBtn.setAttribute("aria-label", "アクティブファイルを表示");
        revealBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;
        revealBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._revealActiveFile(containerEl);
        });

        // Collapse All button
        const collapseAllBtn = headerBtns.createDiv("sr-collapse-all-btn");
        collapseAllBtn.setAttribute("aria-label", "全デッキを閉じる");
        collapseAllBtn.setText("▲");
        collapseAllBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._userToggles.clear();
            this.redraw();
        });

        // Stats
        const statsEl = dashCard.createDiv("sr-dashboard-stats");
        if (totalOverdue > 0) {
            const overdueRow = statsEl.createDiv("sr-stat-row sr-stat-overdue");
            overdueRow.createDiv("sr-stat-label").setText("期限切れ");
            overdueRow.createDiv("sr-stat-count").setText(String(totalOverdue));
        }

        // Due today stat (clickable)
        const todayNotesByDeck = new Map<string, SchedNote[]>();
        const reviewRow = statsEl.createDiv("sr-stat-row sr-stat-review sr-clickable");
        reviewRow.createDiv("sr-stat-label").setText("本日分");
        reviewRow.createDiv("sr-stat-count").setText(String(totalDueToday));
        reviewRow.addEventListener("click", () => {
            new TodayNotesModal(this.app, todayNotesByDeck).open();
        });

        // New stat
        const newRow = statsEl.createDiv("sr-stat-row sr-stat-new");
        newRow.createDiv("sr-stat-label").setText("新規");
        newRow.createDiv("sr-stat-count").setText(String(totalNew));

        // Progress bar
        const todayKey = todayDateStr;
        const storedDate = localStorage.getItem("sr-progress-date");
        const storedInitial = parseInt(localStorage.getItem("sr-progress-initial") || "0", 10);
        let todayInitial: number;
        if (storedDate === todayKey && storedInitial > 0) {
            todayInitial = storedInitial;
            if (totalDueToday > storedInitial) {
                todayInitial = totalDueToday;
                localStorage.setItem("sr-progress-initial", String(todayInitial));
            }
        } else {
            todayInitial = totalDueToday;
            localStorage.setItem("sr-progress-date", todayKey);
            localStorage.setItem("sr-progress-initial", String(todayInitial));
        }
        const todayProcessed = Math.max(0, todayInitial - totalDueToday);
        const progressPercent =
            todayInitial === 0 ? 100 : Math.round((todayProcessed / todayInitial) * 100);

        const progressContainer = dashCard.createDiv("sr-progress-container");
        const progressLabel = progressContainer.createDiv("sr-progress-label");
        if (todayInitial > 0) progressLabel.setText(`${todayProcessed}/${todayInitial}`);
        const progressTrack = progressContainer.createDiv("sr-progress-track");
        const progressBar = progressTrack.createDiv("sr-progress-bar");
        progressBar.style.width = `${progressPercent}%`;

        // — Deck Sections —
        const deckOrder: string[] =
            (this.plugin?.data?.settings as any)?.deckOrder || [];
        const deckEntries = [...this.noteReviewQueue.reviewDecks.entries()];
        deckEntries.sort((a, b) => {
            const ai = deckOrder.indexOf(a[0]);
            const bi = deckOrder.indexOf(b[0]);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });

        let draggedDeckEl: HTMLElement | null = null;

        for (const [deckKey, deck] of deckEntries) {
            const deckEl = containerEl.createDiv("sr-deck-section");
            deckEl.dataset.deckKey = deckKey;

            // Classify notes into time groups
            const groups = {
                overdue: [] as SchedNote[],
                today: [] as SchedNote[],
                thisWeek: new Map<string, SchedNote[]>(),
                later: new Map<string, SchedNote[]>(),
            };
            const newNotes = deck.newNotes;

            const dayOfWeek = todayDate.getDay() || 7;
            const daysUntilSunday = 7 - dayOfWeek;

            for (const sNote of deck.scheduledNotes) {
                const nDays = Math.ceil((sNote.dueUnix - now) / TICKS_PER_DAY);
                if (nDays > maxDaysToRender) continue;

                if (nDays < 0) {
                    groups.overdue.push(sNote);
                } else if (nDays === 0) {
                    groups.today.push(sNote);
                    if (!todayNotesByDeck.has(deckKey)) todayNotesByDeck.set(deckKey, []);
                    todayNotesByDeck.get(deckKey)!.push(sNote);
                } else if (nDays <= daysUntilSunday) {
                    const d = new Date(sNote.dueUnix);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    if (!groups.thisWeek.has(key)) groups.thisWeek.set(key, []);
                    groups.thisWeek.get(key)!.push(sNote);
                } else {
                    const d = new Date(sNote.dueUnix);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    if (!groups.later.has(key)) groups.later.set(key, []);
                    groups.later.get(key)!.push(sNote);
                }
            }

            const totalCount =
                groups.overdue.length +
                groups.today.length +
                newNotes.length +
                [...groups.thisWeek.values()].reduce((s, a) => s + a.length, 0) +
                [...groups.later.values()].reduce((s, a) => s + a.length, 0);

            // Deck header
            const deckHeader = deckEl.createDiv("sr-deck-section-header");
            deckHeader.setAttribute("draggable", "true");
            const deckChevron = deckHeader.createDiv("sr-deck-section-chevron");
            deckChevron.setText("▶");
            const deckTitle = deckHeader.createDiv("sr-deck-section-title");
            deckTitle.setText(deckKey);
            deckHeader.createDiv("sr-time-group-badge").setText(String(totalCount));

            const deckContent = deckEl.createDiv("sr-deck-section-content");

            // Default: deck collapsed, UNLESS it has today's notes (and user hasn't explicitly closed it)
            const hasTodayNotes = groups.today.length > 0;
            const userSet = this._userToggles.get(deckKey);
            const hasUserAction = userSet && userSet.size > 0;
            let autoOpened = false;
            if (!deck.activeFolders.has(deckKey)) {
                if (hasUserAction) {
                    // User has interacted: respect their choice
                    if (!userSet!.has(deckKey)) {
                        deckEl.addClass("sr-collapsed");
                        deckContent.style.display = "none";
                    }
                } else if (hasTodayNotes) {
                    // No user action + has today's notes: auto-expand deck + today only
                    deck.activeFolders.add(deckKey);
                    deck.activeFolders.add("today");
                    autoOpened = true;
                } else {
                    // No user action + no today's notes: collapsed
                    deckEl.addClass("sr-collapsed");
                    deckContent.style.display = "none";
                }
            }

            // When auto-opened, apply CSS class to hide non-today groups
            if (autoOpened) {
                deckContent.addClass("sr-today-only");
            }

            // Deck header toggle
            deckHeader.addEventListener("click", () => {
                const willCollapse = !deckEl.hasClass("sr-collapsed");
                deckEl.toggleClass("sr-collapsed", willCollapse);
                deckContent.style.display = willCollapse ? "none" : "";
                // When user interacts, show all groups (remove today-only restriction)
                deckContent.removeClass("sr-today-only");
                if (!this._userToggles.has(deckKey)) this._userToggles.set(deckKey, new Set());
                if (willCollapse) {
                    deck.activeFolders.delete(deckKey);
                    this._userToggles.get(deckKey)!.delete(deckKey);
                } else {
                    deck.activeFolders.add(deckKey);
                    this._userToggles.get(deckKey)!.add(deckKey);
                }
            });

            // Deck D&D
            deckHeader.addEventListener("dragstart", (e) => {
                e.dataTransfer!.setData("text/deck-key", deckKey);
                e.dataTransfer!.effectAllowed = "move";
                draggedDeckEl = deckEl;
                deckEl.addClass("sr-dragging");
                e.stopPropagation();
            });
            deckHeader.addEventListener("dragend", () => {
                deckEl.removeClass("sr-dragging");
                draggedDeckEl = null;
            });
            deckEl.addEventListener("dragover", (e) => {
                if (draggedDeckEl && draggedDeckEl !== deckEl) {
                    e.preventDefault();
                    containerEl
                        .querySelectorAll(".sr-drag-over-deck")
                        .forEach((el) => el.removeClass("sr-drag-over-deck"));
                    deckEl.addClass("sr-drag-over-deck");
                }
            });
            deckEl.addEventListener("dragleave", () => deckEl.removeClass("sr-drag-over-deck"));
            deckEl.addEventListener("drop", async (e) => {
                e.preventDefault();
                deckEl.removeClass("sr-drag-over-deck");
                if (!draggedDeckEl || draggedDeckEl === deckEl) return;
                const fromKey = e.dataTransfer!.getData("text/deck-key");
                if (!fromKey) return;
                const allDeckEls = [...containerEl.querySelectorAll(".sr-deck-section")];
                const keys = allDeckEls.map((el) => (el as HTMLElement).dataset.deckKey!);
                const fromIdx = keys.indexOf(fromKey);
                const toIdx = keys.indexOf(deckKey);
                if (fromIdx === -1 || toIdx === -1) return;
                keys.splice(fromIdx, 1);
                keys.splice(toIdx, 0, fromKey);
                if (this.plugin?.data) {
                    (this.plugin.data.settings as any).deckOrder = keys;
                    await this.plugin.savePluginData();
                }
                this.redraw();
            });

            // Render groups — "today" default expansion already handled above

            if (groups.overdue.length > 0) {
                const grp = this.createTimeGroup(
                    deckContent,
                    "期限切れ",
                    groups.overdue.length,
                    "overdue",
                    !deck.activeFolders.has("overdue"),
                    deck,
                    deckKey,
                    todayDateStr,
                );
                for (const sNote of groups.overdue) {
                    const fileIsOpen =
                        activeFile && sNote.note.tfile && sNote.note.path === activeFile.path;
                    this.createNoteItem(
                        grp,
                        sNote.note.tfile,
                        !!fileIsOpen,
                        deck,
                        deckKey,
                    );
                }
            }

            if (groups.today.length > 0) {
                const grp = this.createTimeGroup(
                    deckContent,
                    "今日",
                    groups.today.length,
                    "today",
                    !deck.activeFolders.has("today"),
                    deck,
                    deckKey,
                    todayDateStr,
                );
                for (const sNote of groups.today) {
                    const fileIsOpen =
                        activeFile && sNote.note.tfile && sNote.note.path === activeFile.path;
                    this.createNoteItem(
                        grp,
                        sNote.note.tfile,
                        !!fileIsOpen,
                        deck,
                        deckKey,
                    );
                }
            }

            if (newNotes.length > 0) {
                const grp = this.createTimeGroup(
                    deckContent,
                    "新規",
                    newNotes.length,
                    "new",
                    !deck.activeFolders.has("new"),
                    deck,
                    deckKey,
                    todayDateStr,
                );
                for (const nf of newNotes) {
                    const fileIsOpen = activeFile && nf.tfile && nf.path === activeFile.path;
                    this.createNoteItem(grp, nf.tfile, !!fileIsOpen, deck, deckKey);
                }
            }

            // This week wrapper
            if (groups.thisWeek.size > 0) {
                const thisWeekTotal = [...groups.thisWeek.values()].reduce(
                    (s, a) => s + a.length,
                    0,
                );
                const wrapperEl = this.createGroupWrapper(
                    deckContent,
                    "今週",
                    thisWeekTotal,
                    "wrapper-thisweek",
                    deck,
                    deckKey,
                );
                const childrenEl = wrapperEl.querySelector(
                    ".sr-group-wrapper-children",
                ) as HTMLElement;
                for (const [dateKey, notes] of groups.thisWeek) {
                    const d = new Date(dateKey + "T00:00:00");
                    const label = `${d.getMonth() + 1}/${d.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})`;
                    const grp = this.createTimeGroup(
                        childrenEl,
                        label,
                        notes.length,
                        dateKey,
                        !deck.activeFolders.has(dateKey),
                        deck,
                        deckKey,
                        todayDateStr,
                    );
                    for (const sNote of notes) {
                        const fileIsOpen =
                            activeFile &&
                            sNote.note.tfile &&
                            sNote.note.path === activeFile.path;
                        this.createNoteItem(
                            grp,
                            sNote.note.tfile,
                            !!fileIsOpen,
                            deck,
                            deckKey,
                        );
                    }
                }
            }

            // Later wrapper
            if (groups.later.size > 0) {
                const laterTotal = [...groups.later.values()].reduce(
                    (s, a) => s + a.length,
                    0,
                );
                const wrapperEl = this.createGroupWrapper(
                    deckContent,
                    "来週以降",
                    laterTotal,
                    "wrapper-later",
                    deck,
                    deckKey,
                );
                const childrenEl = wrapperEl.querySelector(
                    ".sr-group-wrapper-children",
                ) as HTMLElement;
                for (const [dateKey, notes] of groups.later) {
                    const d = new Date(dateKey + "T00:00:00");
                    const label = `${d.getMonth() + 1}/${d.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})`;
                    const grp = this.createTimeGroup(
                        childrenEl,
                        label,
                        notes.length,
                        dateKey,
                        !deck.activeFolders.has(dateKey),
                        deck,
                        deckKey,
                        todayDateStr,
                    );
                    for (const sNote of notes) {
                        const fileIsOpen =
                            activeFile &&
                            sNote.note.tfile &&
                            sNote.note.path === activeFile.path;
                        this.createNoteItem(
                            grp,
                            sNote.note.tfile,
                            !!fileIsOpen,
                            deck,
                            deckKey,
                        );
                    }
                }
            }
        }
    }

    // ─── Time group ───
    private createTimeGroup(
        parentEl: HTMLElement,
        title: string,
        count: number,
        folderId: string,
        collapsed: boolean,
        deck: NoteReviewDeck,
        deckKey: string,
        _todayDateStr: string,
    ): HTMLElement {
        const colorClass =
            folderId === "overdue"
                ? "sr-time-group-overdue"
                : folderId === "today"
                    ? "sr-time-group-today"
                    : folderId === "new"
                        ? "sr-time-group-new"
                        : "sr-time-group-week";
        const groupEl = parentEl.createDiv(`sr-time-group ${colorClass}`);
        if (collapsed) groupEl.addClass("sr-collapsed");

        const headerEl = groupEl.createDiv("sr-time-group-header");
        const titleEl = headerEl.createDiv("sr-time-group-title");
        titleEl.setText(title);
        headerEl.createDiv("sr-time-group-badge").setText(String(count));
        headerEl.createDiv("sr-time-group-chevron").setText("▶");

        const childrenEl = groupEl.createDiv("sr-time-group-children");
        if (collapsed) childrenEl.style.display = "none";

        headerEl.addEventListener("click", () => {
            const willCollapse = !groupEl.hasClass("sr-collapsed");
            groupEl.toggleClass("sr-collapsed", willCollapse);
            childrenEl.style.display = willCollapse ? "none" : "";
            if (!this._userToggles.has(deckKey))
                this._userToggles.set(deckKey, new Set());
            if (willCollapse) {
                deck.activeFolders.delete(folderId);
                this._userToggles.get(deckKey)!.delete(folderId);
            } else {
                deck.activeFolders.add(folderId);
                this._userToggles.get(deckKey)!.add(folderId);
            }
        });

        return childrenEl;
    }

    // ─── Group wrapper (今週/来週以降) ───
    private createGroupWrapper(
        parentEl: HTMLElement,
        title: string,
        count: number,
        wrapperId: string,
        deck: NoteReviewDeck,
        deckKey: string,
    ): HTMLElement {
        const wrapperEl = parentEl.createDiv("sr-group-wrapper");
        const collapsed = !deck.activeFolders.has(wrapperId);
        if (collapsed) wrapperEl.addClass("sr-collapsed");

        const headerEl = wrapperEl.createDiv("sr-group-wrapper-header");
        headerEl.createDiv("sr-group-wrapper-title").setText(title);
        headerEl.createDiv("sr-time-group-badge").setText(String(count));
        headerEl.createDiv("sr-time-group-chevron").setText("▶");

        const childrenEl = wrapperEl.createDiv("sr-group-wrapper-children");
        if (collapsed) childrenEl.style.display = "none";

        headerEl.addEventListener("click", () => {
            const willCollapse = !wrapperEl.hasClass("sr-collapsed");
            wrapperEl.toggleClass("sr-collapsed", willCollapse);
            childrenEl.style.display = willCollapse ? "none" : "";
            if (!this._userToggles.has(deckKey))
                this._userToggles.set(deckKey, new Set());
            if (willCollapse) {
                deck.activeFolders.delete(wrapperId);
                this._userToggles.get(deckKey)!.delete(wrapperId);
            } else {
                deck.activeFolders.add(wrapperId);
                this._userToggles.get(deckKey)!.add(wrapperId);
            }
        });

        return wrapperEl;
    }

    // ─── Note item ───
    private createNoteItem(
        childrenEl: HTMLElement,
        file: TFile,
        isActive: boolean,
        deck: NoteReviewDeck,
        deckKey: string | null,
    ): void {
        const itemEl = childrenEl.createDiv("sr-note-item");
        if (isActive) itemEl.addClass("is-active");
        itemEl.setAttribute("draggable", "true");

        itemEl.createDiv("sr-note-dot");
        itemEl.createDiv("sr-note-name").setText(file.basename);

        // Action bar
        if (deckKey) {
            const actionBar = itemEl.createDiv("sr-note-action-bar");

            // Reschedule buttons
            for (const days of [1, 3, 7]) {
                const reschedBtn = actionBar.createDiv("sr-note-resched-btn");
                reschedBtn.setText(`${days}`);
                reschedBtn.setAttribute("aria-label", `${days}日後にリスケ`);
                reschedBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    await this.rescheduleNote(file, days, itemEl);
                });
            }

            // Completion button
            const completeBtn = actionBar.createDiv("sr-note-complete-btn");
            completeBtn.setText("✓");
            completeBtn.setAttribute("aria-label", "処理完了");
            completeBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await this.removeNoteFromReview(file, deckKey, itemEl);
            });
        }

        // Click to open
        itemEl.addEventListener("click", async () => {
            await this.nextNoteReviewHandler.openNote(deck.deckName, file);
        });

        // D&D
        itemEl.addEventListener("dragstart", (e) => {
            e.dataTransfer!.setData("text/note-path", file.path);
            e.dataTransfer!.effectAllowed = "move";
            itemEl.addClass("sr-dragging");
            e.stopPropagation();
        });
        itemEl.addEventListener("dragend", () => {
            itemEl.removeClass("sr-dragging");
        });
    }

    // ─── Reschedule ───
    private async rescheduleNote(file: TFile, days: number, itemEl: HTMLElement): Promise<void> {
        const newDue = new Date();
        newDue.setDate(newDue.getDate() + days);
        const dueStr = formatDateYYYYMMDD(
            globalDateProvider.today.add(days, "days"),
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.app.fileManager.processFrontMatter(file, (fm: any) => {
            fm["sr-due"] = dueStr;
            fm["sr-interval"] = days;
            if (!fm["sr-ease"]) fm["sr-ease"] = this.settings.baseEase;
        });

        itemEl.addClass("sr-note-removing");
        setTimeout(() => {
            itemEl.remove();
            this._updateGroupBadges();
        }, 200);

        new Notice(`📅 ${file.basename} → ${days}日後`);
    }

    // ─── Remove from review ───
    private async removeNoteFromReview(
        file: TFile,
        deckKey: string,
        itemEl: HTMLElement,
    ): Promise<void> {
        // Collect all review tag names to remove (both with and without # prefix)
        const reviewTags = new Set<string>();
        const tagName = deckKey.startsWith("#") ? deckKey.slice(1) : deckKey;
        reviewTags.add(tagName);
        reviewTags.add("#" + tagName);
        if (this.settings?.tagsToReview) {
            for (const t of this.settings.tagsToReview) {
                const bare = t.startsWith("#") ? t.slice(1) : t;
                reviewTags.add(bare);
                reviewTags.add("#" + bare);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.app.fileManager.processFrontMatter(file, (frontmatter: any) => {
            if (frontmatter.tags) {
                if (Array.isArray(frontmatter.tags)) {
                    frontmatter.tags = frontmatter.tags.filter(
                        (t: string) => !reviewTags.has(t),
                    );
                    if (frontmatter.tags.length === 0) delete frontmatter.tags;
                } else if (typeof frontmatter.tags === "string") {
                    if (reviewTags.has(frontmatter.tags)) delete frontmatter.tags;
                }
            }
            delete frontmatter["sr-due"];
            delete frontmatter["sr-interval"];
            delete frontmatter["sr-ease"];
            if (frontmatter["notetoolbar"] === "srs") {
                delete frontmatter["notetoolbar"];
            }
        });

        itemEl.addClass("sr-note-removing");
        setTimeout(() => {
            itemEl.remove();
            this._updateGroupBadges();
        }, 200);

        new Notice(`✓ ${file.basename} の処理を完了しました`);
    }

    // ─── Badge update util ───
    private _updateGroupBadges(): void {
        const container = this.contentEl.querySelector(".sr-review-queue-container");
        if (!container) return;
        container.querySelectorAll(".sr-time-group").forEach((group) => {
            const children = group.querySelector(".sr-time-group-children");
            if (!children) return;
            const count = children.querySelectorAll(".sr-note-item").length;
            const badge = group.querySelector(".sr-time-group-badge");
            if (badge) badge.setText(String(count));
            if (count === 0) (group as HTMLElement).style.display = "none";
        });
    }

    // ─── Reveal active file ───
    private _revealActiveFile(containerEl: HTMLElement): void {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        const now2 = Date.now();
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        let foundDeckKey: string | null = null;
        let foundGroupId: string | null = null;
        let foundWrapperId: string | null = null;

        for (const [deckKey, deck] of this.noteReviewQueue.reviewDecks) {
            for (const nf of deck.newNotes) {
                if (nf.tfile && nf.tfile.path === activeFile.path) {
                    foundDeckKey = deckKey;
                    foundGroupId = "new";
                    break;
                }
            }
            if (foundDeckKey) break;

            for (const sNote of deck.scheduledNotes) {
                if (sNote.note && sNote.note.path === activeFile.path) {
                    foundDeckKey = deckKey;
                    const nDays = Math.ceil((sNote.dueUnix - now2) / TICKS_PER_DAY);
                    if (nDays < 0) {
                        foundGroupId = "overdue";
                    } else if (nDays === 0) {
                        foundGroupId = "today";
                    } else {
                        const dayOfWeek = todayDate.getDay() || 7;
                        const daysUntilSunday = 7 - dayOfWeek;
                        const d = new Date(sNote.dueUnix);
                        foundGroupId = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        foundWrapperId =
                            nDays <= daysUntilSunday ? "wrapper-thisweek" : "wrapper-later";
                    }
                    break;
                }
            }
            if (foundDeckKey) break;
        }

        if (!foundDeckKey) {
            this._showRevealBanner(
                containerEl,
                `✅ ${activeFile.basename} はデッキにないノートです`,
            );
            return;
        }

        const toggleSet = this._userToggles.get(foundDeckKey) || new Set<string>();
        toggleSet.add(foundDeckKey);
        if (foundGroupId) toggleSet.add(foundGroupId);
        if (foundWrapperId) toggleSet.add(foundWrapperId);
        this._userToggles.set(foundDeckKey, toggleSet);

        this.redraw();

        setTimeout(() => {
            const activeItem = this.contentEl.querySelector(".sr-note-item.is-active");
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
                activeItem.addClass("sr-note-reveal-flash");
                setTimeout(() => activeItem.removeClass("sr-note-reveal-flash"), 1500);
            }
        }, 50);
    }

    private _showRevealBanner(containerEl: HTMLElement, message: string): void {
        const existing = containerEl.querySelector(".sr-reveal-banner");
        if (existing) existing.remove();

        const dashCard = containerEl.querySelector(".sr-dashboard-card");
        if (!dashCard) return;

        const banner = createDiv("sr-reveal-banner");
        banner.setText(message);
        dashCard.after(banner);

        setTimeout(() => {
            banner.addClass("sr-reveal-banner-fade");
            setTimeout(() => banner.remove(), 400);
        }, 3000);
    }
}
