import { describe, it, expect } from 'vitest';
import removeMd from 'remove-markdown';

describe('Markdown Stripping for TTS', () => {
    it('should remove bold formatting', () => {
        const input = 'The **banana** is great!';
        const output = removeMd(input);
        expect(output).toBe('The banana is great!');
    });

    it('should remove italic formatting', () => {
        const input = 'The *apple* is delicious!';
        const output = removeMd(input);
        expect(output).toBe('The apple is delicious!');
    });

    it('should remove headers', () => {
        const input = '## Summary\nThis is the content.';
        const output = removeMd(input);
        expect(output).toContain('Summary');
        expect(output).toContain('This is the content');
        expect(output).not.toContain('##');
    });

    it('should remove links but keep text', () => {
        const input = 'Check out [this link](https://example.com)';
        const output = removeMd(input);
        expect(output).toBe('Check out this link');
    });

    it('should remove list formatting', () => {
        const input = '- Item 1\n- Item 2\n- Item 3';
        const output = removeMd(input);
        expect(output).toContain('Item 1');
        expect(output).toContain('Item 2');
        expect(output).not.toContain('-');
    });

    it('should handle complex markdown summary', () => {
        const input = '## Meeting Summary\n\n**Key Points:**\n- The *discussion* was about **bananas**\n- [More info](link.com)';
        const output = removeMd(input);

        expect(output).not.toContain('**');
        expect(output).not.toContain('##');
        expect(output).not.toContain('*');
        expect(output).not.toContain('[');
        expect(output).toContain('bananas');
        expect(output).toContain('discussion');
    });
});
