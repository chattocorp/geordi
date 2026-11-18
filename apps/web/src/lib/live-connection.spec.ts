import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ForgeConnection } from './forge-connection.svelte.ts';

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

it('counts the initial grace period across failed attempts and recovers', () => {
	const connection = new ForgeConnection();
	connection.waiting();
	vi.advanceTimersByTime(1000);
	connection.waiting();
	vi.advanceTimersByTime(999);
	expect(connection.state).toBe('connecting');
	vi.advanceTimersByTime(1);
	expect(connection.state).toBe('lost');
	connection.opened();
	expect(connection.state).toBe('connected');
});

it('hides brief outages and gives the next outage its own grace period', () => {
	const connection = new ForgeConnection();
	connection.waiting();
	connection.opened();
	connection.waiting();
	vi.advanceTimersByTime(1500);
	connection.opened();
	vi.advanceTimersByTime(2000);
	expect(connection.state).toBe('connected');
	connection.waiting();
	expect(connection.state).toBe('connecting');
	vi.advanceTimersByTime(2000);
	expect(connection.state).toBe('lost');
	connection.opened();
	expect(connection.state).toBe('connected');
});
