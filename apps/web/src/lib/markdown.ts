import MarkdownIt from 'markdown-it';

/**
 * Renders agent output. Raw HTML is disabled (escaped), and markdown-it rejects unsafe link
 * protocols such as `javascript:`, so the result is safe to insert with `{@html}`.
 */
const md = new MarkdownIt({ html: false, linkify: true });

export const renderMarkdown = (text: string): string => md.render(text);
