import assert from 'node:assert/strict';
import { test } from 'node:test';
import { greeting } from './native-greeting.mjs';

test('greeting returns a nonempty string', () => {
	const message = greeting();
	assert.equal(typeof message, 'string');
	assert.ok(message.length > 0);
});
