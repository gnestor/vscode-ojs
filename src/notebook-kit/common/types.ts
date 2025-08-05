import { Cell, JavaScriptCell, TranspiledJavaScript } from "@observablehq/notebook-kit";

// Mapping between VS Code language IDs and Observable Kit modes
export const VSCODE_TO_OBSERVABLE_MODE_MAP: Record<string, Cell["mode"]> = {
    "markdown": "md",
    "javascript": "js",
    "ojs": "ojs",
    "html": "html",
    "css": "html", // CSS is treated as HTML in Observable Kit
    "tex": "tex",
    "sql": "sql",
    "dot": "dot"
};

export const OBSERVABLE_TO_VSCODE_MODE_MAP: Record<Cell["mode"], string> = {
    "md": "markdown",
    "js": "javascript",
    "ojs": "ojs",
    "html": "html",
    "tex": "tex",
    "sql": "sql",
    "dot": "dot"
};

export const OBSERVABLE_KIT_MIME = "application/observable-kit+json";

export interface NotebookCell {
    metadata: Cell;
    parsed: JavaScriptCell | undefined;
    transpiled: TranspiledJavaScript;
}