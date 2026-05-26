import { describe, expect, it } from 'vitest';
import { chooseTopic, buildRandomizedSpinSequence, buildSpinSequence, buildUpwardSpinSequence, sortTopicsForDisplay, topicTypeLabel, type Topic } from '../src/topicPicker';

const topics: Topic[] = [
  { id: '1', slug: 'help', type: 'command', title: '/help', displayText: '/help', synopsis: 'Shows help.', details: 'Lists commands and usage.', category: 'getting-started' },
  { id: '2', slug: 'mcp-show', type: 'command', title: '/mcp', displayText: '/mcp', synopsis: 'Shows MCP servers.', details: 'Lists configured MCP servers.', category: 'mcp', syntax: '/mcp [show|add|edit|delete|disable|enable|auth|reload] [SERVER]' },
  { id: '3', slug: 'review', type: 'command', title: '/review', displayText: '/review', synopsis: 'Reviews code.', details: 'Runs code review.', category: 'code' },
];

describe('topic picker', () => {
  it('can force a specific command by slug while preserving a spin sequence', () => {
    const picked = chooseTopic(topics, 'mcp-show');
    expect(picked.slug).toBe('mcp-show');

    const sequence = buildSpinSequence(topics, picked, { cycles: 2, random: () => 0.1 });
    expect(sequence.at(-1)?.slug).toBe('mcp-show');
    expect(sequence.length).toBeGreaterThan(topics.length);
  });

  it('falls back to deterministic random selection when no forced command is present', () => {
    const picked = chooseTopic(topics, undefined, () => 0.99);
    expect(picked.slug).toBe('review');
  });

  it('sorts commands by cheatsheet category then display text', () => {
    const sorted = sortTopicsForDisplay(topics);
    expect(sorted.map((topic) => topic.title)).toEqual(['/review', '/help', '/mcp']);
  });

  it('can force by a partial syntax/title match for public-friendly hidden entry', () => {
    const picked = chooseTopic(topics, '/mcp show');
    expect(picked.title).toBe('/mcp');
  });

  it('keeps spin sequences bounded even with a large topic set', () => {
    const manyTopics = Array.from({ length: 1209 }, (_, index): Topic => ({
      id: `id-${index}`,
      slug: `command-${index}`,
      type: 'command',
      title: `/command-${index}`,
      displayText: `/command-${index}`,
      synopsis: 'Short summary.',
      details: 'Details.',
    }));
    const finalTopic = manyTopics[100];
    const sequence = buildSpinSequence(manyTopics, finalTopic, { cycles: 5, random: () => 0.42 });

    expect(sequence).toHaveLength(61);
    expect(sequence.at(-1)).toBe(finalTopic);
  });

  it('can place the selected landing item near the start, middle, or end of a randomized reel sequence', () => {
    const finalTopic = topics[1];

    const start = buildRandomizedSpinSequence(topics, finalTopic, { cycles: 2, landingPosition: 'start', random: () => 0.2 });
    const middle = buildRandomizedSpinSequence(topics, finalTopic, { cycles: 2, landingPosition: 'middle', random: () => 0.2 });
    const end = buildRandomizedSpinSequence(topics, finalTopic, { cycles: 2, landingPosition: 'end', random: () => 0.2 });

    expect(start.sequence[start.landingIndex]).toBe(finalTopic);
    expect(middle.sequence[middle.landingIndex]).toBe(finalTopic);
    expect(end.sequence[end.landingIndex]).toBe(finalTopic);
    expect(start.landingIndex).toBeLessThan(middle.landingIndex);
    expect(middle.landingIndex).toBeLessThan(end.landingIndex);
    expect(end.landingIndex).toBe(end.sequence.length - 1);
  });


  it('does not place duplicate commands next to each other in the visible reel when alternatives exist', () => {
    const finalTopic = topics[1];

    const { sequence } = buildRandomizedSpinSequence(topics, finalTopic, {
      cycles: 2,
      landingPosition: 'middle',
      random: () => 0.60,
    });

    sequence.forEach((topic, topicIndex) => {
      if (topicIndex === 0) return;
      expect(topic.displayText).not.toBe(sequence[topicIndex - 1].displayText);
    });
  });

  it('does not mirror the same command above and below the selected landing item', () => {
    const finalTopic = topics[1];

    const { sequence, landingIndex } = buildRandomizedSpinSequence(topics, finalTopic, {
      cycles: 2,
      landingPosition: 'middle',
      random: () => 0.20,
    });

    expect(sequence[landingIndex - 1].displayText).not.toBe(sequence[landingIndex + 1].displayText);
  });

  it('builds circular upward spin sequences with varied landing positions instead of always ending at the list edge', () => {
    const early = buildUpwardSpinSequence(topics, topics[1], { previousTopic: topics[0], cycles: 2, random: () => 0.10 });
    const middle = buildUpwardSpinSequence(topics, topics[1], { previousTopic: topics[0], cycles: 2, random: () => 0.50 });
    const late = buildUpwardSpinSequence(topics, topics[1], { previousTopic: topics[0], cycles: 2, random: () => 0.90 });

    expect(early.startIndex).toBe(0);
    expect(early.sequence[early.startIndex]).toBe(topics[0]);
    expect(early.sequence[early.landingIndex]).toBe(topics[1]);
    expect(middle.sequence[middle.landingIndex]).toBe(topics[1]);
    expect(late.sequence[late.landingIndex]).toBe(topics[1]);
    expect(new Set([early.landingIndex, middle.landingIndex, late.landingIndex]).size).toBeGreaterThan(1);
    expect([early, middle, late].some((result) => result.landingIndex !== result.sequence.length - 1)).toBe(true);
    expect(middle.sequence.slice(1, -1).map((topic) => topic.displayText)).not.toEqual(early.sequence.slice(1, -1).map((topic) => topic.displayText));
  });

  it('labels cheatsheet items as commands', () => {
    expect(topicTypeLabel('command')).toBe('Command');
  });
});
