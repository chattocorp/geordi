import type { GeordiEvent, StoredEvent } from './events/index.ts';

const lineLimit = 600;

// Decisions often follow the explanation. Reserve two thirds of a long reply for its conclusion.
function replyExcerpt(text: string) {
	const budget = lineLimit - 'text '.length;
	if (text.length <= budget) return text;
	const tail = Math.floor((budget * 2) / 3);
	const gap = ' … ';
	return text.slice(0, budget - tail - gap.length) + gap + text.slice(-tail);
}

// Name the actual interval, even when a late result edits a tool from an earlier turn.
// Use short excerpts so the extra prompt stays small.
export function recapActivity(events: StoredEvent<GeordiEvent>[], openQuestions: string[]) {
	const activity: string[] = [];
	let lastText = -1;
	let finalReply = -1;
	for (const event of events) {
		let detail: string;
		if (event.type === 'workspace.message') detail = event.data.text;
		else if (event.type === 'workspace.undeliverable') detail = event.data.reason;
		else if (event.type === 'workspace.answered') detail = 'Question answered';
		else if (event.type === 'workspace.output') {
			const item = event.data.event;
			if (item.kind === 'turn.completed' || item.kind === 'turn.failed') {
				if (lastText >= 0) finalReply = lastText;
				lastText = -1;
			}
			switch (item.kind) {
				case 'text':
					lastText = activity.length;
					detail = replyExcerpt(item.text);
					break;
				case 'tool':
					detail = item.title ?? item.name;
					break;
				case 'tool.result':
					detail = item.output;
					break;
				case 'tool.update':
					detail = item.title ?? item.id;
					break;
				case 'question':
					detail = item.questions.map((q) => q.question).join(' ');
					break;
				case 'plan':
					detail = JSON.stringify(item.plan);
					break;
				case 'turn.failed':
					detail = item.error;
					break;
				case 'subagent':
					{
						const child = item.update;
						detail =
							child.kind === 'message'
								? child.text
								: child.kind === 'info'
									? [child.title, child.state, child.description].filter(Boolean).join(' ')
									: (child.title ?? child.name ?? child.id);
					}
					break;
				case 'turn.completed':
					detail =
						item.diff?.files
							.map((f) => f.operation + ' ' + f.path)
							.slice(0, 12)
							.join(', ') ?? '';
					break;
				case 'answer.received':
					detail = 'Answer delivered';
					break;
				case 'turn.started':
					lastText = -1;
					detail = '';
					break;
				case 'question.closed':
					detail = '';
					break;
				default:
					continue;
			}
			detail = item.kind + ' ' + detail;
		} else if (event.type === 'workspace.continued' || event.type === 'workspace.switched')
			detail = event.type;
		else continue;
		activity.push(event.at + ' ' + detail.slice(0, lineLimit));
	}
	const lines =
		activity.length > 40 ? [...activity.slice(0, 5), '…', ...activity.slice(-35)] : activity;
	// Later tool activity can push the last completed reply out of the retained window.
	if (finalReply >= 5 && finalReply < activity.length - 35)
		lines.splice(6, 1, activity[finalReply]);
	return lines.join('\n') + '\nCurrently open questions: ' + (openQuestions.join('\n') || 'none');
}
