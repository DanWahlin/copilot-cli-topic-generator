export type TopicType = 'command';

export type Topic = {
  id: string;
  slug: string;
  type: TopicType | string;
  title: string;
  displayText: string;
  synopsis: string;
  details: string;
  source_path?: string;
  source_heading?: string;
  chapter?: string;
  examples?: string[];
  keywords?: string[];
  syntax?: string;
  category?: string;
  note?: string;
  source_kind?: string;
  sources?: string[];
  official_purpose?: string;
  official_aliases?: string[];
  docs_url?: string;
};

type SpinOptions = {
  cycles?: number;
  random?: () => number;
  landingPosition?: 'start' | 'middle' | 'end';
};

export type SpinSequenceResult = {
  sequence: Topic[];
  landingIndex: number;
};

function commandTokens(value?: string): string[] {
  return (value ?? '')
    .toLowerCase()
    .replace(/[\[\]{}()|,]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(length - 1, value));
}

function landingIndexFor(length: number, landingPosition: SpinOptions['landingPosition'], random: () => number): number {
  if (length <= 1) return 0;
  if (landingPosition === 'start') return clampIndex(Math.floor(length * 0.18), length);
  if (landingPosition === 'middle') return clampIndex(Math.floor(length * 0.5), length);
  if (landingPosition === 'end') return length - 1;

  const zones = [
    clampIndex(Math.floor(length * 0.18), length),
    clampIndex(Math.floor(length * 0.5), length),
    length - 1,
  ];
  return zones[Math.min(zones.length - 1, Math.floor(random() * zones.length))];
}

function randomTopic(topics: Topic[], random: () => number): Topic {
  return topics[Math.min(topics.length - 1, Math.floor(random() * topics.length))];
}

function topicIdentity(topic: Topic): string {
  return (topic.displayText || topic.title || topic.slug || topic.id).trim().toLowerCase();
}

function randomTopicExcept(topics: Topic[], random: () => number, disallowed: Set<string>): Topic {
  const candidates = topics.filter((topic) => !disallowed.has(topicIdentity(topic)));
  return randomTopic(candidates.length ? candidates : topics, random);
}

function visibleWindowIndexes(centerIndex: number, length: number, radius = 2): number[] {
  const start = Math.max(0, centerIndex - radius);
  const end = Math.min(length - 1, centerIndex + radius);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

function replacementTopic(topics: Topic[], random: () => number, disallowed: Set<string>): Topic | null {
  const candidates = topics.filter((topic) => !disallowed.has(topicIdentity(topic)));
  return candidates.length ? randomTopic(candidates, random) : null;
}

function smoothVisibleWindowDuplicates(sequence: Topic[], protectedIndex: number, topics: Topic[], random: () => number): Topic[] {
  const smoothed = [...sequence];
  const protectedIdentity = topicIdentity(smoothed[protectedIndex]);

  for (const index of visibleWindowIndexes(protectedIndex, sequence.length)) {
    if (index === protectedIndex) continue;

    const identity = topicIdentity(smoothed[index]);
    const mirroredIndex = protectedIndex + (protectedIndex - index);
    const mirrorsSameCommand = mirroredIndex >= 0
      && mirroredIndex < smoothed.length
      && mirroredIndex !== index
      && topicIdentity(smoothed[mirroredIndex]) === identity;
    const previous = smoothed[index - 1];
    const next = smoothed[index + 1];
    const adjacentDuplicate = (previous && topicIdentity(previous) === identity) || (next && topicIdentity(next) === identity);

    if (!mirrorsSameCommand && !adjacentDuplicate) continue;

    const disallowed = new Set<string>([protectedIdentity, identity]);
    if (previous) disallowed.add(topicIdentity(previous));
    if (next) disallowed.add(topicIdentity(next));

    const replacement = replacementTopic(topics, random, disallowed);
    if (replacement) smoothed[index] = replacement;
  }

  return smoothed;
}

export function chooseTopic(topics: Topic[], force?: string | null, random: () => number = Math.random): Topic {
  if (!topics.length) {
    throw new Error('Cannot choose a command from an empty list. Run ingestion first.');
  }

  const normalizedForce = force?.trim().toLowerCase();
  if (normalizedForce) {
    const exactForced = topics.find((topic) =>
      [topic.slug, topic.id, topic.title, topic.displayText, topic.syntax]
        .filter(Boolean)
        .some((value) => value!.toLowerCase() === normalizedForce),
    );
    if (exactForced) return exactForced;

    const containsForced = topics.find((topic) =>
      [topic.slug, topic.id, topic.title, topic.displayText, topic.syntax]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedForce)),
    );
    if (containsForced) return containsForced;

    const forcedTokens = commandTokens(normalizedForce);
    const tokenForced = topics.find((topic) => {
      const candidateTokens = commandTokens([topic.slug, topic.id, topic.title, topic.displayText, topic.syntax].filter(Boolean).join(' '));
      return forcedTokens.length > 0 && forcedTokens.every((token) => candidateTokens.includes(token));
    });
    if (tokenForced) return tokenForced;
  }

  return randomTopic(topics, random);
}

export function buildSpinSequence(topics: Topic[], finalTopic: Topic, options: SpinOptions = {}): Topic[] {
  return buildRandomizedSpinSequence(topics, finalTopic, { ...options, landingPosition: 'end' }).sequence;
}

export function buildRandomizedSpinSequence(topics: Topic[], finalTopic: Topic, options: SpinOptions = {}): SpinSequenceResult {
  if (!topics.length) return { sequence: [finalTopic], landingIndex: 0 };

  const cycles = options.cycles ?? 5;
  const random = options.random ?? Math.random;
  const length = Math.max(18, Math.min(topics.length * cycles, 60)) + 1;
  const landingIndex = landingIndexFor(length, options.landingPosition, random);
  const sequence: Topic[] = [];
  for (let index = 0; index < length; index += 1) {
    const previous = sequence.at(-1);
    const adjacentToLanding = index === landingIndex - 1 || index === landingIndex + 1;
    const disallowed = new Set<string>();
    if (previous) disallowed.add(topicIdentity(previous));
    if (adjacentToLanding) disallowed.add(topicIdentity(finalTopic));
    sequence.push(randomTopicExcept(topics, random, disallowed));
  }
  sequence[landingIndex] = finalTopic;

  return { sequence: smoothVisibleWindowDuplicates(sequence, landingIndex, topics, random), landingIndex };
}

export function topicTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    command: 'Command',
  };
  return labels[type] ?? type.replace(/^./, (char) => char.toUpperCase());
}

export function sortTopicsForDisplay(topics: Topic[]): Topic[] {
  return [...topics].sort((a, b) => {
    const categoryDelta = (a.category || '').localeCompare(b.category || '');
    if (categoryDelta) return categoryDelta;
    return (a.displayText || a.title).localeCompare(b.displayText || b.title);
  });
}
