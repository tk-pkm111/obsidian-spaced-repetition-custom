import { CardType } from "src/card/questions/question";
import { ParsedQuestionInfo } from "src/parser";

const CORNELL_CUE_LINE_REGEX = /^\s*>\s*\[!cue\]\s*(.*)$/i;
const CORNELL_BLOCKQUOTE_LINE_REGEX = /^\s*>\s?(.*)$/;
const HORIZONTAL_RULE_REGEX = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

export interface CornellFrontBack {
    front: string;
    back: string;
}

export function isCornellCueLine(line: string): boolean {
    return CORNELL_CUE_LINE_REGEX.test(line);
}

export function parseCornellQuestionText(questionText: string): CornellFrontBack {
    const lines = questionText.replaceAll("\r\n", "\n").split("\n");
    if (lines.length === 0) return { front: "", back: "" };

    const cueMatch = lines[0].match(CORNELL_CUE_LINE_REGEX);
    if (!cueMatch) return { front: "", back: "" };

    const front = cueMatch[1].trim();
    const answerLines = lines.slice(1).map((line) => {
        if (line.trim() === ">") return "";

        const quotedMatch = line.match(CORNELL_BLOCKQUOTE_LINE_REGEX);
        return quotedMatch ? quotedMatch[1] : line;
    });

    return {
        front,
        back: trimBlankLines(answerLines).join("\n").trimEnd(),
    };
}

export function parseCornellQuestions(text: string): ParsedQuestionInfo[] {
    const cards: ParsedQuestionInfo[] = [];
    const lines = text.replaceAll("\r\n", "\n").split("\n");

    for (let i = 0; i < lines.length; i++) {
        if (!isCornellCueLine(lines[i])) continue;

        let blockEndLine = lines.length - 1;
        for (let j = i + 1; j < lines.length; j++) {
            if (isCornellCueLine(lines[j])) {
                blockEndLine = j - 1;
                break;
            }

            if (HORIZONTAL_RULE_REGEX.test(lines[j])) {
                let k = j + 1;
                while (k < lines.length && lines[k].trim() === "") k++;
                if (k < lines.length && isCornellCueLine(lines[k])) {
                    blockEndLine = j - 1;
                    break;
                }
            }
        }

        while (blockEndLine >= i && lines[blockEndLine].trim() === "") {
            blockEndLine--;
        }

        if (blockEndLine < i) continue;

        const questionText = lines.slice(i, blockEndLine + 1).join("\n");
        const { front, back } = parseCornellQuestionText(questionText);
        if (front.length === 0 || back.length === 0) continue;

        cards.push(new ParsedQuestionInfo(CardType.Cornell, questionText, i, blockEndLine));
        i = blockEndLine;
    }

    return cards;
}

function trimBlankLines(lines: string[]): string[] {
    let start = 0;
    let end = lines.length - 1;

    while (start <= end && lines[start].trim() === "") start++;
    while (end >= start && lines[end].trim() === "") end--;

    return lines.slice(start, end + 1);
}
