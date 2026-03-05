import { t } from "src/lang/helpers";
import SRButtonComponent from "src/ui/sr-button";

export default class PreviousCardButtonComponent extends SRButtonComponent {
    public constructor(
        container: HTMLElement,
        previousCardHandler: () => void,
        classNames?: string[],
    ) {
        super(container, {
            classNames: ["sr-previous-card-button", ...(classNames ?? [])],
            icon: "chevron-left",
            tooltip: t("BACK"),
            onClick: () => {
                previousCardHandler();
            },
        });
    }
}
