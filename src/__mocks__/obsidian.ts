// Minimal Obsidian mocks for unit testing.
// These provide just enough shape for imports to resolve and tests to run.

export class Plugin {
	app: App;
	manifest: any;
	constructor(app: App, manifest: any) {
		this.app = app;
		this.manifest = manifest;
	}
	async loadData(): Promise<any> {
		return {};
	}
	async saveData(_data: any): Promise<void> {}
	registerEditorSuggest(_suggest: any): void {}
	addSettingTab(_tab: any): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class App {}

export class Editor {
	getLine(_line: number): string {
		return "";
	}
	lineCount(): number {
		return 0;
	}
	replaceRange(_replacement: string, _from: EditorPosition, _to?: EditorPosition): void {}
	getCursor(): EditorPosition {
		return { line: 0, ch: 0 };
	}
}

export interface EditorPosition {
	line: number;
	ch: number;
}

export interface EditorSuggestTriggerInfo {
	start: EditorPosition;
	end: EditorPosition;
	query: string;
}

export interface EditorSuggestContext {
	start: EditorPosition;
	end: EditorPosition;
	query: string;
	editor: Editor;
	file: TFile | null;
}

export class EditorSuggest<T> {
	plugin: any;
	context: EditorSuggestContext | null = null;
	constructor(app: App) {}
	onTrigger(
		_cursor: EditorPosition,
		_editor: Editor,
		_file: TFile | null
	): EditorSuggestTriggerInfo | null {
		return null;
	}
	getSuggestions(_context: EditorSuggestContext): T[] | Promise<T[]> {
		return [];
	}
	renderSuggestion(_value: T, _el: HTMLElement): void {}
	selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
}

export class PluginSettingTab {
	app: App;
	plugin: any;
	containerEl: HTMLElement;
	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = {
			empty: () => {},
			createEl: (_tag: string, _attrs?: any) => ({
				setText: (_text: string) => {},
			}),
		} as any;
	}
	display(): void {}
	hide(): void {}
}

export class Setting {
	settingEl: HTMLElement;
	private containerEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
		this.settingEl = {} as HTMLElement;
	}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(cb: (text: TextComponent) => any): this {
		cb(new TextComponent());
		return this;
	}
}

export class TextComponent {
	inputEl: HTMLInputElement = {} as HTMLInputElement;
	setPlaceholder(_placeholder: string): this {
		return this;
	}
	setValue(_value: string): this {
		return this;
	}
	onChange(_callback: (value: string) => any): this {
		return this;
	}
}

export class TFile {
	path: string = "";
	basename: string = "";
	extension: string = "md";
	name: string = "";
}

/**
 * Mock of Obsidian's requestUrl. Default implementation throws —
 * tests should use vi.mocked(requestUrl).mockResolvedValue(...) to
 * provide scenario-specific responses.
 */
export async function requestUrl(_params: any): Promise<any> {
	throw new Error("requestUrl not mocked for this test");
}
