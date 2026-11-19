import { describe, expect, it } from 'vitest';
import type { ToolCallUpdate } from '@agentclientprotocol/sdk/experimental/v2/unstable';
import { ToolInfos } from './tool-info.ts';

const update = (u: Partial<ToolCallUpdate>) => ({ toolCallId: 't', ...u }) as ToolCallUpdate;

describe('ToolInfos', () => {
	it('says only what an update adds to its tool call', () => {
		const infos = new ToolInfos();
		expect(infos.has('t')).toBe(false);
		expect(
			infos.news(update({ title: 'Read File', kind: 'read', locations: [], rawInput: {} }))
		).toEqual({ title: 'Read File', toolKind: 'read', input: '{}' });
		expect(infos.has('t')).toBe(true);
		expect(
			infos.news(
				update({
					title: 'Read /w/a.txt',
					kind: 'read',
					locations: [{ path: '/w/a.txt', line: 1 }],
					rawInput: { file_path: '/w/a.txt' }
				})
			)
		).toEqual({
			title: 'Read /w/a.txt',
			locations: [{ path: '/w/a.txt', line: 1 }],
			input: '{"file_path":"/w/a.txt"}'
		});
		expect(
			infos.news(update({ status: 'completed', rawInput: { file_path: '/w/a.txt' } }))
		).toEqual({});
		// files it no longer names are news, once some were named
		expect(infos.news(update({ locations: [] }))).toEqual({ locations: [] });
	});

	it('holds a change to the input alone until there is other news, or the call ends', () => {
		const infos = new ToolInfos();
		expect(infos.news(update({ title: 'Edit', rawInput: {} }))).toEqual({
			title: 'Edit',
			input: '{}'
		});
		expect(infos.news(update({ rawInput: { old: 'ga' } }))).toEqual({});
		expect(infos.news(update({ rawInput: { old: 'gamma' } }))).toEqual({});
		expect(infos.news(update({ title: 'Edit a.txt' }))).toEqual({
			title: 'Edit a.txt',
			input: '{"old":"gamma"}'
		});
		expect(infos.news(update({ rawInput: { old: 'gamma', new: 'delta' } }))).toEqual({});
		expect(infos.news(update({ status: 'completed' }), true)).toEqual({
			input: '{"old":"gamma","new":"delta"}'
		});
	});

	it('takes kinds it does not know for other', () => {
		expect(new ToolInfos().news(update({ kind: 'teleport' }))).toEqual({ toolKind: 'other' });
	});
});
