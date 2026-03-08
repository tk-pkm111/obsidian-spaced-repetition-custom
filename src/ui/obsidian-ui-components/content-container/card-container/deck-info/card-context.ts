const HIDDEN_CARD_CONTEXT_LABELS = new Set(["summary"]);

function normalizeCardContextSegment(context: string): string {
    let normalizedContext = context;

    if (normalizedContext.startsWith("[[") && normalizedContext.endsWith("]]")) {
        normalizedContext = normalizedContext.replace("[[", "").replace("]]", "");
        if (normalizedContext.includes("|")) {
            normalizedContext = normalizedContext.split("|")[1];
        }
    }

    return normalizedContext.trim();
}

function shouldHideCardContextSegment(context: string): boolean {
    return HIDDEN_CARD_CONTEXT_LABELS.has(context.toLowerCase());
}

export function formatCardContextText(noteBasename: string, questionContext: string[]): string {
    const separator = " > ";
    const visibleContext = questionContext
        .map(normalizeCardContextSegment)
        .filter((context) => context.length > 0 && !shouldHideCardContextSegment(context));

    return [noteBasename, ...visibleContext].join(separator);
}
