import SRButtonComponent from "src/ui/sr-button";

export default class MinimizeToFloatingBarButtonComponent extends SRButtonComponent {
    public constructor(
        container: HTMLElement,
        minimizeToFloatingBar: () => void,
        classNames?: string[],
    ) {
        super(container, {
            classNames: ["sr-minimize-to-floating-bar-button", ...(classNames ?? [])],
            icon: "panel-bottom",
            tooltip: "フローティングバーにする",
            onClick: () => {
                minimizeToFloatingBar();
            },
        });
    }
}
