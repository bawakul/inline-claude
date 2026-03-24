import { MarkdownRenderChild } from "obsidian";
import { formatElapsed } from "./callout";
import { retryRequest } from "./suggest";
import type ClaudeChatPlugin from "./main";

/**
 * A MarkdownRenderChild that renders a pulsing dot + live elapsed timer
 * into a [!claude] callout's DOM while the request is pending.
 * Injected by the post-processor when it finds a callout whose rid
 * maps to a 'thinking' PendingRequest.
 *
 * Lifecycle: Obsidian calls onload() when the element enters the viewport
 * and onunload() when it leaves (or the section re-renders). The interval
 * is registered via Component.registerInterval for automatic cleanup, plus
 * an explicit clearInterval in onunload as belt-and-suspenders.
 */
export class ThinkingRenderChild extends MarkdownRenderChild {
	private startTime: number;
	private isRetry: boolean;
	private intervalId: number | null = null;
	private dotEl: HTMLSpanElement | null = null;
	private timerEl: HTMLSpanElement | null = null;
	private retryHintEl: HTMLSpanElement | null = null;

	constructor(containerEl: HTMLElement, startTime: number, isRetry = false) {
		super(containerEl);
		this.startTime = startTime;
		this.isRetry = isRetry;
	}

	onload(): void {
		const titleInner = this.containerEl.querySelector(
			".callout-title-inner"
		);
		const content = this.containerEl.querySelector(".callout-content");

		// Pulsing dot goes into the title area
		if (titleInner) {
			this.dotEl = document.createElement("span");
			this.dotEl.className = "claude-pulse-dot";
			this.dotEl.textContent = "●";
			titleInner.appendChild(this.dotEl);
		}

		// Timer text goes into the callout content area
		if (content) {
			this.timerEl = document.createElement("span");
			this.timerEl.className = "claude-timer";
			this.timerEl.textContent = formatElapsed(
				Date.now() - this.startTime
			);
			content.appendChild(this.timerEl);

			// Show "(retry)" hint when this is a retry attempt
			if (this.isRetry) {
				this.retryHintEl = document.createElement("span");
				this.retryHintEl.className = "claude-retry-hint";
				this.retryHintEl.textContent = "(retry)";
				content.appendChild(this.retryHintEl);
			}
		}

		// Start ticking every second
		const id = setInterval(() => {
			if (this.timerEl) {
				this.timerEl.textContent = formatElapsed(
					Date.now() - this.startTime
				);
			}
		}, 1000);

		this.intervalId = id as unknown as number;
		this.registerInterval(this.intervalId);
	}

	onunload(): void {
		// Belt-and-suspenders: explicit clear alongside registerInterval cleanup
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		// Remove injected DOM elements
		if (this.dotEl) {
			this.dotEl.remove();
			this.dotEl = null;
		}
		if (this.timerEl) {
			this.timerEl.remove();
			this.timerEl = null;
		}
		if (this.retryHintEl) {
			this.retryHintEl.remove();
			this.retryHintEl = null;
		}
	}
}

/**
 * A MarkdownRenderChild that renders error state into a [!claude] callout.
 * Adds `.claude-error` class (orange styling), shows error message text,
 * and conditionally renders a Retry button when the error is retryable.
 *
 * Lifecycle: Obsidian calls onload() when the element enters the viewport
 * and onunload() when it leaves (or the section re-renders).
 */
export class ErrorRenderChild extends MarkdownRenderChild {
	private errorMessage: string;
	private retryable: boolean;
	private rid: string;
	private plugin: ClaudeChatPlugin;
	private msgEl: HTMLSpanElement | null = null;
	private btnEl: HTMLButtonElement | null = null;

	constructor(
		containerEl: HTMLElement,
		errorMessage: string,
		retryable: boolean,
		rid: string,
		plugin: ClaudeChatPlugin
	) {
		super(containerEl);
		this.errorMessage = errorMessage;
		this.retryable = retryable;
		this.rid = rid;
		this.plugin = plugin;
	}

	onload(): void {
		// Add orange error styling class
		this.containerEl.classList.add("claude-error");

		const content = this.containerEl.querySelector(".callout-content");
		if (!content) return;

		// Error message text
		this.msgEl = document.createElement("span");
		this.msgEl.className = "claude-error-msg";
		this.msgEl.textContent = `⚠️ ${this.errorMessage}`;
		content.appendChild(this.msgEl);

		// Retry button (only for retryable errors)
		if (this.retryable) {
			this.btnEl = document.createElement("button");
			this.btnEl.className = "claude-retry-btn";
			this.btnEl.textContent = "↻ Retry";
			this.btnEl.addEventListener("click", () => {
				console.log(`Retry button clicked for rid ${this.rid}`);
				retryRequest(this.plugin, this.rid);
			});
			content.appendChild(this.btnEl);
		}
	}

	onunload(): void {
		this.containerEl.classList.remove("claude-error");
		if (this.msgEl) {
			this.msgEl.remove();
			this.msgEl = null;
		}
		if (this.btnEl) {
			this.btnEl.remove();
			this.btnEl = null;
		}
	}
}

/**
 * Regex to extract the request ID from a callout's innerHTML.
 * Matches both actual HTML comments and literal text.
 * The rid is captured in group 1.
 */
const RID_REGEX = /<!-- rid:([\w-]+) -->/;

/**
 * Register a markdown post-processor that decorates pending [!claude] callouts
 * with a ThinkingRenderChild (pulsing dot + live timer).
 *
 * How it works:
 * 1. Obsidian calls the post-processor for each rendered section.
 * 2. We find all `.callout[data-callout="claude"]` elements in the section.
 * 3. For each, we extract the `<!-- rid:UUID -->` from innerHTML.
 * 4. If the rid maps to a 'thinking' PendingRequest, we create a
 *    ThinkingRenderChild and register it via ctx.addChild().
 * 5. Callouts with no rid, no matching pending request, or non-thinking
 *    status are silently skipped.
 *
 * Observability: logs when a callout is decorated or when a rid lookup
 * fails to find a matching pending request.
 */
export function registerClaudePostProcessor(plugin: ClaudeChatPlugin): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const callouts = el.querySelectorAll(
			'.callout[data-callout="claude"]'
		);

		callouts.forEach((calloutEl) => {
			const match = calloutEl.innerHTML.match(RID_REGEX);
			if (!match) {
				return; // No rid marker — skip
			}

			const rid = match[1];
			const pending = plugin.pendingRequests.get(rid);

			if (!pending) {
				console.log(
					`Post-processor: rid ${rid} not found in pendingRequests — skipping decoration`
				);
				return;
			}

			if (pending.status !== "thinking" && pending.status !== "error") {
				return; // Only decorate thinking and error states
			}

			if (pending.status === "thinking") {
				const child = new ThinkingRenderChild(
					calloutEl as HTMLElement,
					pending.startTime,
					!!pending.retryOf
				);
				ctx.addChild(child);
				console.log(
					`Post-processor: decorated thinking callout for rid ${rid}`
				);
			} else if (pending.status === "error") {
				const child = new ErrorRenderChild(
					calloutEl as HTMLElement,
					pending.errorMessage ?? "Unknown error",
					pending.retryable ?? false,
					rid,
					plugin
				);
				ctx.addChild(child);
				console.log(
					`Post-processor: decorated error callout for rid ${rid}`
				);
			}
		});
	});
}
