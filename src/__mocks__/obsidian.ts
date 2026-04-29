// Minimal Obsidian mocks for unit testing.
// These provide just enough shape for imports to resolve and tests to run.

export class Component {
	load(): void {}
	unload(): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class MarkdownRenderChild extends Component {
	containerEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.containerEl = containerEl;
	}
	onload(): void {}
	onunload(): void {}
}

export class MarkdownPostProcessorContext {
	docId: string = "";
	sourcePath: string = "";
	addChild(_child: any): void {}
	getSectionInfo(): null {
		return null;
	}
}

export class Notice {
	message: string;
	timeout?: number;
	static instances: Notice[] = [];
	constructor(message: string, timeout?: number) {
		this.message = message;
		this.timeout = timeout;
		Notice.instances.push(this);
	}
	static reset(): void {
		Notice.instances = [];
	}
}

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
	addStatusBarItem(): { setText: (text: string) => void } {
		return { setText: (_text: string) => {} };
	}
}

export class App {
	vault: Vault = new Vault();
	workspace = {
		getActiveFile: (): TFile | null => {
			const f = new TFile();
			f.path = "test.md";
			return f;
		},
		activeEditor: {
			editor: new Editor(),
		} as any,
		// Default returns empty list — tests override per scenario via:
		//   plugin.app.workspace.getLeavesOfType = vi.fn(() => [<mock leaf>]);
		getLeavesOfType: (_type: string): any[] => [],
	};
}

/**
 * Mock of Obsidian's Vault — minimal shape for canvas / file-patch tests.
 *
 * Mirrors the documented atomic `process(file, fn)` contract from
 * obsidian.d.ts (since 1.1.0): "Atomically read, modify, and save the
 * contents of a note." This is the primitive the closed-leaf JSON-patch
 * fallback (D-04) relies on — using vault.read + vault.modify would be
 * non-atomic and is the anti-pattern called out in 16-RESEARCH.md
 * Anti-Pattern 1.
 *
 * Only test code reaches this class — Vitest's vi.mock("obsidian") only
 * resolves it inside test files; production imports resolve to the real
 * obsidian module.
 */
export class Vault {
	// Test-private file store keyed by path.
	private files: Map<string, { file: TFile; content: string }> = new Map();

	/**
	 * Test helper — NOT part of real Obsidian API. Seeds an in-memory file.
	 * Returns the TFile so tests can pass it to process().
	 */
	_seed(path: string, content: string): TFile {
		const f = new TFile();
		f.path = path;
		const slash = path.lastIndexOf("/");
		const base = slash >= 0 ? path.slice(slash + 1) : path;
		const dot = base.lastIndexOf(".");
		f.basename = dot > 0 ? base.slice(0, dot) : base;
		f.extension = dot > 0 ? base.slice(dot + 1) : "";
		f.name = base;
		this.files.set(path, { file: f, content });
		return f;
	}

	getFileByPath(path: string): TFile | null {
		return this.files.get(path)?.file ?? null;
	}

	/**
	 * Mirrors Obsidian's Vault.process — atomic read-modify-write.
	 * Calls fn with current content, stores returned content, returns it.
	 */
	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const entry = this.files.get(file.path);
		if (!entry) {
			throw new Error(`Vault.process called on non-existent file: ${file.path}`);
		}
		const next = fn(entry.content);
		this.files.set(file.path, { file: entry.file, content: next });
		return next;
	}

	// Test helper — read seeded content directly (NOT in real Obsidian API).
	_read(path: string): string | undefined {
		return this.files.get(path)?.content;
	}
}

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
	setCursor(_pos: EditorPosition): void {}
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

export class Modal {
	app: App;
	containerEl: HTMLElement;
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	constructor(app: App) {
		this.app = app;
		this.containerEl = {} as HTMLElement;
		this.modalEl = {} as HTMLElement;
		this.titleEl = {} as HTMLElement;
		this.contentEl = {
			empty: () => {},
			createEl: (_tag: string, _attrs?: any) => ({
				createEl: (_t: string, _a?: any) => ({}),
				setText: (_text: string) => {},
				addEventListener: (_event: string, _cb: () => void) => {},
			}),
			createDiv: (_attrs?: any) => ({
				createEl: (_tag: string, _attrs?: any) => ({
					addEventListener: (_event: string, _cb: () => void) => {},
				}),
			}),
		} as any;
	}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
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
	addButton(cb: (btn: any) => any): this {
		const btn: any = {};
		btn.setButtonText = (_t: string) => btn;
		btn.setCta = () => btn;
		btn.onClick = (_cb: () => void) => btn;
		cb(btn);
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
