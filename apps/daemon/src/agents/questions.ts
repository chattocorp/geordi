import { randomUUID } from 'node:crypto';
import {
	CreateElicitationRequest,
	ElicitationPropertySchema,
	MultiSelectItems
} from '@agentclientprotocol/sdk/unstable';
import type { Agent, Question } from '@geordi/protocol';
import type { HostEvent } from '../host.ts';

type CreateElicitationResponse =
	| { action: 'decline' }
	| { action: 'cancel' }
	| { action: 'accept'; content: Record<string, string | string[]> };
const CODEX_OTHER = 'None of the above';
export function sessionQuestions(
	provider: Agent,
	sessionId: () => string,
	emit: (event: HostEvent) => void
) {
	const questions = new Map<string, (answers?: string[]) => void>();
	const request = ({
		params,
		signal
	}: {
		params: CreateElicitationRequest;
		signal: AbortSignal;
	}): Promise<CreateElicitationResponse> | CreateElicitationResponse => {
		if (
			!CreateElicitationRequest.isForm(params) ||
			!('sessionId' in params) ||
			params.sessionId !== sessionId()
		)
			return { action: 'decline' };
		const { properties = {}, required } = params.requestedSchema;
		// Where an answer in the person's own words goes, if not into the field itself:
		// Claude has a `_custom` field beside a question, Codex a note beside a choice
		// that offers "None of the above".
		const notes = new Map<string, string>();
		for (const [name, field] of Object.entries(properties)) {
			const codex = (field._meta as { codex?: { role?: unknown; questionId?: unknown } })?.codex;
			if (
				provider === 'codex' &&
				codex?.role === 'user_note' &&
				typeof codex.questionId === 'string' &&
				properties[codex.questionId]
			)
				notes.set(codex.questionId, name);
			else if (
				provider === 'claude' &&
				/^question_\d+_custom$/.test(name) &&
				field.type === 'string' &&
				properties[name.slice(0, -7)]
			)
				notes.set(name.slice(0, -7), name);
		}
		const companions = new Set(notes.values());
		const fields = Object.entries(properties).filter(([name]) => !companions.has(name));
		const items: Question[] = [];
		for (const [name, field] of fields) {
			const multiple = ElicitationPropertySchema.isArray(field);
			if (!multiple && !ElicitationPropertySchema.isString(field)) return { action: 'decline' };
			const titled = multiple
				? MultiSelectItems.isTitled(field.items)
					? field.items.anyOf
					: undefined
				: field.oneOf;
			const values = multiple
				? MultiSelectItems.isString(field.items)
					? field.items.enum
					: undefined
				: field.enum;
			// The native Codex tool puts the prompt in title and the short heading in description.
			const meta = field._meta?.codex;
			const nativeQuestion =
				provider === 'codex' && meta && typeof meta === 'object' && 'isOther' in meta;
			const header = nativeQuestion ? field.description : field.title;
			const prompt = nativeQuestion ? field.title : field.description;
			const question = prompt ?? (fields.length === 1 ? params.message : field.title) ?? name;
			items.push({
				question,
				...(header && header !== question ? { header } : {}),
				...(!required?.includes(name) ? { optional: true } : {}),
				options: (
					titled?.map((o) => ({ label: o.const, description: o.description ?? o.title })) ??
					values?.map((label) => ({ label })) ??
					[]
				).filter((o) => !(notes.has(name) && o.label === CODEX_OTHER)),
				multiSelect: multiple
			});
		}
		if (!items.length) return { action: 'decline' };
		if (signal.aborted) return { action: 'cancel' };
		const codex = params._meta?.codex;
		const asyncQuestion =
			provider === 'codex' &&
			typeof codex === 'object' &&
			codex !== null &&
			'delivery' in codex &&
			codex.delivery === 'async';
		const key = randomUUID();
		return new Promise((resolve) => {
			const abort = () => answer();
			function answer(answers?: string[]) {
				questions.delete(key);
				signal.removeEventListener('abort', abort);
				if (answers?.length !== fields.length) {
					emit({ kind: 'question.closed', id: key });
					return resolve({ action: 'cancel' });
				}
				const content: Record<string, string | string[]> = {};
				for (const [i, [name]] of fields.entries()) {
					const value = answers[i];
					if (!value) continue;
					const item = items[i];
					const picks = item.multiSelect ? value.split('\n') : [value];
					const note = notes.get(name);
					if (note && picks.some((pick) => !item.options.some((o) => o.label === pick))) {
						content[note] = value;
						if (provider === 'codex') content[name] = CODEX_OTHER;
					} else {
						content[name] = item.multiSelect ? picks : value;
					}
				}
				resolve({ action: 'accept', content });
				emit({ kind: 'answer.received', id: key });
			}
			questions.set(key, answer);
			signal.addEventListener('abort', abort, { once: true });
			emit({ kind: 'question', id: key, questions: items, blocking: !asyncQuestion });
		});
	};
	return {
		request,
		answer: (key: string, answers: string[]) => questions.get(key)?.(answers),
		cancel() {
			for (const cancel of questions.values()) cancel();
		}
	};
}
