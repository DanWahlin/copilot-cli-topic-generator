import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Wand2, RefreshCw } from 'lucide-react';
import { buildRandomizedSpinSequence, chooseTopic, sortTopicsForDisplay, topicTypeLabel, type Topic } from './topicPicker';
import { buildSmoothSpinTimeline } from './reelMotion';
import './styles.css';

type TopicPayload = {
  generatedAt: string;
  topicCount: number;
  types: string[];
  topics: Topic[];
};

const REEL_ITEM_HEIGHT = 96;
const REEL_CENTER_OFFSET = -REEL_ITEM_HEIGHT / 2;
const REEL_TEXT_VISUAL_NUDGE = -5;
const SELECTION_WINDOW_INSET = 80;

function isSameCommandSyntax(syntax?: string, display?: string): boolean {
  const left = syntax?.trim().toLowerCase();
  const right = display?.trim().toLowerCase();
  return Boolean(left && right && left === right);
}

const fallbackTopics: Topic[] = [
  {
    id: 'fallback-help',
    slug: 'command-help',
    type: 'command',
    title: '/help',
    displayText: '/help',
    synopsis: 'Show help for all interactive slash commands inside a Copilot CLI session.',
    details: 'Run /help when you want to see what Copilot CLI can do from inside an active session.',
    examples: ['/help  # list all slash commands'],
    syntax: '/help',
    category: 'getting-started',
  },
];

const idleTopic: Topic = {
  id: 'idle-spin-prompt',
  slug: 'idle-spin-prompt',
  type: 'command',
  title: 'Spin to start',
  displayText: 'Spin to start',
  synopsis: '',
  details: '',
  examples: [],
  category: 'idle',
};

function getForcedTopicFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('force') || params.get('topic') || params.get('slug');
}

function App() {
  const [payload, setPayload] = useState<TopicPayload | null>(null);
  const [current, setCurrent] = useState<Topic>(idleTopic);
  const [selected, setSelected] = useState<Topic | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [reelSequence, setReelSequence] = useState<Topic[]>([idleTopic]);
  const [reelIndex, setReelIndex] = useState(0);
  const [reelOffset, setReelOffset] = useState(REEL_CENTER_OFFSET);
  const [reelTransition, setReelTransition] = useState('none');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isDetailsRevealed, setIsDetailsRevealed] = useState(false);
  const [forced, setForced] = useState(getForcedTopicFromUrl() ?? '');
  const [draftForced, setDraftForced] = useState(getForcedTopicFromUrl() ?? '');
  const [isForceDialogOpen, setIsForceDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeouts = useRef<number[]>([]);
  const settleTimeout = useRef<number | null>(null);

  const topics = useMemo(() => sortTopicsForDisplay(payload?.topics?.length ? payload.topics : fallbackTopics), [payload]);

  useEffect(() => {
    fetch('/data/topics.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Missing topic payload (${response.status})`);
        return response.json();
      })
      .then((data: TopicPayload) => {
        const sorted = sortTopicsForDisplay(data.topics);
        const initial = sorted[0] ?? fallbackTopics[0];
        setPayload({ ...data, topics: sorted });
        setCurrent(idleTopic);
        setReelSequence([idleTopic]);
        setReelIndex(0);
        setReelOffset(REEL_CENTER_OFFSET);
        setReelTransition('none');
        setIsBrowsing(false);
        setIsDetailsRevealed(false);
      })
      .catch((err: Error) => {
        setError(`${err.message}. Run npm run ingest to generate the JSON payload.`);
      });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '`' && !isTyping) {
        event.preventDefault();
        setDraftForced(forced);
        setIsForceDialogOpen(true);
      }
      if (event.key === 'Escape') {
        setIsForceDialogOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [forced]);

  useEffect(() => {
    return () => {
      timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
      if (settleTimeout.current) window.clearTimeout(settleTimeout.current);
    };
  }, []);

  function spin() {
    if (isSpinning) return;
    timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    timeouts.current = [];
    if (settleTimeout.current) {
      window.clearTimeout(settleTimeout.current);
      settleTimeout.current = null;
    }

    const finalTopic = chooseTopic(topics, forced || getForcedTopicFromUrl());
    const { sequence, landingIndex } = buildRandomizedSpinSequence(topics, finalTopic, { cycles: 5 });
    setIsSpinning(true);
    setIsBrowsing(false);
    setIsDetailsRevealed(false);
    setSelected(null);
    const timeline = buildSmoothSpinTimeline({
      itemCount: sequence.length,
      itemHeight: REEL_ITEM_HEIGHT,
      centerOffset: REEL_CENTER_OFFSET,
      landingIndex,
    });
    const startSegment = timeline[0];
    const startIndex = startSegment?.index ?? 0;

    setReelSequence(sequence);
    setReelIndex(startIndex);
    setCurrent(sequence[startIndex] ?? sequence[0]);
    setReelTransition('none');
    setReelOffset(startSegment?.offset ?? REEL_CENTER_OFFSET);

    let elapsed = 0;
    timeline.slice(1).forEach((segment, segmentOffset) => {
      const isFinalSegment = segmentOffset === timeline.length - 2;
      const startAt = elapsed;
      elapsed += segment.durationMs;
      const timeout = window.setTimeout(() => {
        const topic = sequence[segment.index];
        setReelTransition(`${segment.durationMs}ms ${segment.easing}`);
        setReelOffset(segment.offset);
        setReelIndex(segment.index);
        setCurrent(topic);
        if (isFinalSegment) {
          settleTimeout.current = window.setTimeout(() => {
            setIsSpinning(false);
            setSelected(topic);
            setReelTransition('none');
            settleTimeout.current = null;
          }, segment.durationMs);
        }
      }, startAt);
      timeouts.current.push(timeout);
    });
  }

  function browseByWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (isSpinning || !topics.length) return;
    event.preventDefault();

    const direction = event.deltaY >= 0 ? 1 : -1;
    const browsingIndex = isBrowsing ? reelIndex : -1;
    const nextIndex = (browsingIndex + direction + topics.length) % topics.length;
    const nextTopic = topics[nextIndex];

    setIsBrowsing(true);
    setIsDetailsRevealed(false);
    setSelected(nextTopic);
    setReelSequence(topics);
    setReelIndex(nextIndex);
    setCurrent(nextTopic);
    setReelTransition('180ms cubic-bezier(.18, .72, .2, 1)');
    setReelOffset(REEL_CENTER_OFFSET - nextIndex * REEL_ITEM_HEIGHT);
  }

  function chooseBrowsedTopic(topic: Topic) {
    if (isSpinning) return;
    const topicIndex = topics.findIndex((candidate) => candidate.id === topic.id);
    const index = topicIndex >= 0 ? topicIndex : reelIndex;
    setSelected(topic);
    setIsDetailsRevealed(false);
    setCurrent(topic);
    setReelSequence(topics);
    setReelIndex(index);
    setReelTransition('none');
    setReelOffset(REEL_CENTER_OFFSET - index * REEL_ITEM_HEIGHT);
  }

  function storeForcedCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForced(draftForced.trim());
    setIsForceDialogOpen(false);
  }

  const reelItems = reelSequence.length ? reelSequence : [current];
  const reelTransform = `translate3d(0, ${reelOffset}px, 0)`;
  const selectedSyntax = selected?.syntax?.trim();
  const selectedDisplay = (selected?.displayText || selected?.title || '').trim();
  const showSelectedSyntax = Boolean(selectedSyntax && !isSameCommandSyntax(selectedSyntax, selectedDisplay));
  const canRevealDetails = Boolean(selected && !isSpinning);

  return (
    <main className="shell">
      <section className="hero">
        <a className="eyebrow" href="https://github.com/github/copilot-cli-for-beginners" target="_blank" rel="noreferrer">
          Copilot CLI for Beginners Course
        </a>
        <h1>Learn Copilot CLI</h1>
        <p>
          Spin the reel. Name the command. Reveal the answer.
        </p>
      </section>

      <section className="stage" aria-live="polite">
        <div className="reelFrame">
          <div className="scanline" />
          <div className="reelGlow" />
          <div className="bulbRail bulbRailTop" aria-hidden="true">
            {Array.from({ length: 21 }).map((_, index) => <span className="bulb" key={`top-${index}`} />)}
          </div>
          <div className="bulbRail bulbRailRight" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => <span className="bulb" key={`right-${index}`} />)}
          </div>
          <div className="bulbRail bulbRailBottom" aria-hidden="true">
            {Array.from({ length: 21 }).map((_, index) => <span className="bulb" key={`bottom-${index}`} />)}
          </div>
          <div className="bulbRail bulbRailLeft" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => <span className="bulb" key={`left-${index}`} />)}
          </div>
          <span className="cornerBulb cornerTopLeft" aria-hidden="true" />
          <span className="cornerBulb cornerTopRight" aria-hidden="true" />
          <span className="cornerBulb cornerBottomLeft" aria-hidden="true" />
          <span className="cornerBulb cornerBottomRight" aria-hidden="true" />
          <div className="reelViewport" aria-label="Command reel" data-testid="reel-window" data-state={isSpinning ? 'spinning' : 'settled'} data-mode={isBrowsing ? 'browsing' : 'idle'} onWheel={browseByWheel} style={{ '--reel-offset': `${REEL_CENTER_OFFSET}px`, '--selection-window-inset': `${SELECTION_WINDOW_INSET}px`, '--reel-item-height': `${REEL_ITEM_HEIGHT}px`, '--reel-text-nudge': `${REEL_TEXT_VISUAL_NUDGE}px` } as React.CSSProperties}>
            <div className={`reelStrip ${isSpinning ? 'rolling' : 'settled'}`} data-testid="reel-strip" style={{ transform: reelTransform, transition: `transform ${reelTransition}` }}>
              {reelItems.map((topic, index) => {
                const label = topic.displayText || topic.title;
                return (
                  <div className={`reelItem ${index === reelIndex ? 'active' : ''} ${topic.id === 'idle-spin-prompt' ? 'idleReelItem' : ''}`} data-testid="reel-item" style={{ textAlign: 'center' }} key={`${topic.id}-${index}`}>
                    {isBrowsing && index === reelIndex ? (
                      <button className="reelChoice" type="button" aria-label={`Choose ${label}`} onClick={() => chooseBrowsedTopic(topic)}>
                        <span className="reelText">{label}</span>
                      </button>
                    ) : (
                      <span className="reelText">{label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`controls ${canRevealDetails ? 'hasSecondaryControl' : 'singleControl'}`} data-testid="controls">
          <button className="primary" onClick={spin} disabled={isSpinning}>
            {isSpinning ? <RefreshCw className="spinIcon" size={20} /> : <Wand2 size={20} />}
            {isSpinning ? 'Spinning…' : 'Spin'}
          </button>
          {canRevealDetails ? (
            <button className="secondary revealButton" type="button" onClick={() => setIsDetailsRevealed((value) => !value)}>
              {isDetailsRevealed ? 'Hide Details' : 'Show Details'}
            </button>
          ) : null}
        </div>

        {selected && isDetailsRevealed ? (
          <section className="detailsCard" data-testid="details-card">
            <div className="detailsHeader">
              <span className={`typePill type-${selected.type}`}>{topicTypeLabel(selected.type)}</span>
            </div>
            <h2>{selected.title}</h2>
            {showSelectedSyntax ? <p className="syntaxLine" style={{ maxWidth: '100%' }}><code>{selectedSyntax}</code></p> : null}
            <p className="synopsis">{selected.synopsis}</p>
            <p>{selected.details}</p>
            {selected.examples?.length ? (
              <pre><code>{selected.examples.slice(0, 2).join('\n\n')}</code></pre>
            ) : null}
          </section>
        ) : null}
      </section>

      {error && <p className="error">{error}</p>}

      {isForceDialogOpen ? (
        <div className="dialogBackdrop" role="presentation">
          <form className="forceDialog" role="dialog" aria-modal="true" aria-labelledby="force-dialog-title" onSubmit={storeForcedCommand}>
            <h2 id="force-dialog-title">Set the landing command</h2>
            <p>Enter a command, slug, or id. The spin still looks random, then lands here.</p>
            <label>
              <span>Forced command</span>
              <input
                autoFocus
                aria-label="Forced command"
                value={draftForced}
                onChange={(event) => setDraftForced(event.target.value)}
                placeholder="/mcp show, command-mcp-show, or topic id"
              />
            </label>
            <div className="dialogActions">
              <button type="button" className="secondary" onClick={() => { setDraftForced(''); setForced(''); setIsForceDialogOpen(false); }}>Clear</button>
              <button type="button" className="secondary" onClick={() => setIsForceDialogOpen(false)}>Cancel</button>
              <button type="submit" className="primary compact">Store Command</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

export default App;
