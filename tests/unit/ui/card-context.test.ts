import { formatCardContextText } from "src/ui/obsidian-ui-components/content-container/card-container/deck-info/card-context";

describe("formatCardContextText", () => {
    test("omits Summary headings from the rendered card context", () => {
        expect(formatCardContextText("Paper", ["Summary"])).toBe("Paper");
    });

    test("keeps non-summary headings in the rendered card context", () => {
        expect(formatCardContextText("Paper", ["Key Ideas", "Evidence"])).toBe(
            "Paper > Key Ideas > Evidence",
        );
    });

    test("uses link aliases and still omits Summary headings", () => {
        expect(formatCardContextText("Paper", ["[[Topic|Alias]]", "summary"])).toBe(
            "Paper > Alias",
        );
    });
});
