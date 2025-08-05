import * as vscode from "vscode";
import { TextDecoder, TextEncoder } from "util";
import { deserialize, serialize, type Notebook, type Cell } from "@observablehq/notebook-kit";
import { DOMParser } from "./dom-polyfill";
import { selectOne, selectAll } from "css-select";
import { OBSERVABLE_TO_VSCODE_MODE_MAP, VSCODE_TO_OBSERVABLE_MODE_MAP } from "../common/types";

// Adapter to make xmldom nodes compatible with css-select
const xmldomAdapter = {
    isTag: (node: Node): node is Element => node.nodeType === 1, // ELEMENT_NODE

    getAttributeValue: (elem: Element, name: string): string | undefined => {
        return elem.getAttribute(name) || undefined;
    },

    getChildren: (node: Node): Node[] => {
        return Array.from(node.childNodes || []);
    },

    getName: (elem: Element): string => {
        return elem.nodeName?.toLowerCase() || "";
    },

    getParent: (node: Element): Node | null => {
        return node.parentNode;
    },

    getSiblings: (node: Node): Node[] => {
        if (!node.parentNode) return [node];
        return Array.from(node.parentNode.childNodes || []);
    },

    getText: (node: Node): string => {
        return node.textContent || "";
    },

    hasAttrib: (elem: Element, name: string): boolean => {
        return elem.hasAttribute(name);
    },

    removeSubsets: (nodes: Node[]): Node[] => {
        return nodes.filter((node, i) => {
            return !nodes.some((other, j) => {
                return i !== j && other.contains && other.contains(node);
            });
        });
    },

    equals: (a: Node, b: Node): boolean => {
        return a === b;
    }
};

class DOMParserEx extends DOMParser {
    constructor() {
        super();
    }

    parseFromString(data, contentType) {
        const doc = super.parseFromString(data, contentType);
        doc["querySelector"] = (selector: string) => {
            try {
                // Use css-select with our xmldom adapter to find the first matching element
                // Start from the document element or the document itself
                const rootElement = doc.documentElement || doc as any;
                const result = selectOne(selector, rootElement, { adapter: xmldomAdapter });
                return result || null;
            } catch (error) {
                console.error("Error in querySelector:", error);
                return null;
            }
        };

        doc["querySelectorAll"] = (selector: string) => {
            try {
                // Use css-select with our xmldom adapter to find all matching elements
                // Start from the document element or the document itself
                const rootElement = doc.documentElement || doc as any;
                const results = selectAll(selector, rootElement, { adapter: xmldomAdapter });
                // Return a NodeList-like array
                return results;
            } catch (error) {
                console.error("Error in querySelectorAll:", error);
                return [];
            }
        };

        return doc;
    }
}

let serializer: NotebookKitSerializer;

export class NotebookKitSerializer implements vscode.NotebookSerializer {

    private readonly _textDecoder = new TextDecoder();
    private readonly _textEncoder = new TextEncoder();

    protected constructor() { }

    static attach(): NotebookKitSerializer {
        if (!serializer) {
            serializer = new NotebookKitSerializer();
        }
        return serializer;
    }

    async deserializeNotebook(
        content: Uint8Array,
        token: vscode.CancellationToken
    ): Promise<vscode.NotebookData> {
        const contentStr = this._textDecoder.decode(content);
        if (this.isObservableKitFormat(contentStr)) {
            return this.deserializeObservableKitNotebook(contentStr);
        }
    }

    async serializeNotebook(
        data: vscode.NotebookData,
        token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        // Default to Observable Kit format for new notebooks
        const htmlContent = this.serializeToObservableKitFormat(data);
        return this._textEncoder.encode(htmlContent);
    }

    private isObservableKitFormat(content: string): boolean {
        return content.includes("<notebook") && content.includes("<!doctype html>");
    }

    private deserializeObservableKitNotebook(content: string): vscode.NotebookData {
        const parser = new DOMParserEx();

        const notebook: Notebook = deserialize(content, { parser: parser as any });
        const cells: vscode.NotebookCellData[] = [];

        for (const cell of notebook.cells) {
            const cellKind = cell.mode === "md"
                ? vscode.NotebookCellKind.Markup
                : vscode.NotebookCellKind.Code;

            const language = OBSERVABLE_TO_VSCODE_MODE_MAP[cell.mode] || "javascript";

            const cellData = new vscode.NotebookCellData(
                cellKind,
                cell.value,
                language
            );

            // Ensure pinned property is explicitly boolean
            const metadata = { ...cell };
            if (metadata.pinned === undefined || metadata.pinned === null) {
                metadata.pinned = false;
            }
            cellData.metadata = metadata;
            cells.push(cellData);
        }

        const notebookData = new vscode.NotebookData(cells);
        notebookData.metadata = notebook;

        return notebookData;
    }

    private serializeToObservableKitFormat(data: vscode.NotebookData): string {
        // Convert VSCode notebook data to Observable Kit format
        const cells: Cell[] = [];
        let cellIdCounter = 1;

        for (const cell of data.cells) {
            const cellId = cell.metadata?.id ? parseInt(cell.metadata.id) : cellIdCounter++;
            const mode = VSCODE_TO_OBSERVABLE_MODE_MAP[cell.languageId] || "js";
            const pinned = cell.metadata?.pinned ?? false;

            cells.push({
                id: cellId,
                value: cell.value,
                mode,
                pinned
            });
        }

        const notebook: Notebook = {
            title: data.metadata?.title || "Untitled Notebook",
            theme: data.metadata?.theme || "air",
            readOnly: data.metadata?.readOnly || false,
            cells
        };

        // Use the official Observable Kit serialize function
        return serialize(notebook);
    }

}
