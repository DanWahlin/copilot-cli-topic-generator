import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { getTopicPayloadUrl } from '../src/App';

const payload = {
  generatedAt: '2026-01-01T00:00:00Z',
  topicCount: 3,
  types: ['command'],
  topics: [
    {
      id: 'help-id',
      slug: 'command-help',
      type: 'command',
      title: '/help',
      displayText: '/help',
      synopsis: 'Show help for all interactive slash commands inside a Copilot CLI session.',
      details: 'Run /help when you want to see what Copilot CLI can do.',
      examples: ['/help  # list commands'],
      syntax: '/help',
      category: 'getting-started',
    },
    {
      id: 'review-id',
      slug: 'command-review',
      type: 'command',
      title: '/review',
      displayText: '/review',
      synopsis: 'Run a code review.',
      details: 'Ask Copilot to review code for issues.',
      examples: ['/review  # review current changes'],
      syntax: '/review [PROMPT]',
      category: 'code',
    },
    {
      id: 'mcp-show-id',
      slug: 'command-mcp-show',
      type: 'command',
      title: '/mcp',
      displayText: '/mcp',
      synopsis: 'Show MCP servers.',
      details: 'List configured MCP servers and status.',
      examples: ['/mcp show'],
      syntax: '/mcp [show|add|edit|delete|disable|enable|auth|reload] [SERVER]',
      category: 'mcp',
    },
  ],
};

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })));
}

describe('topic payload URL', () => {
  it('uses the Vite base path so GitHub Pages fetches the JSON from the repo subdirectory', () => {
    expect(getTopicPayloadUrl('/copilot-cli-topic-generator/')).toBe('/copilot-cli-topic-generator/data/topics.json');
  });

  it('keeps local dev and preview payload fetches rooted at slash', () => {
    expect(getTopicPayloadUrl('/')).toBe('/data/topics.json');
  });
});

beforeEach(() => {
  mockFetch();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App slot machine behavior', () => {
  it('links the course eyebrow to the Copilot CLI for Beginners Course GitHub repo', async () => {
    render(<App />);

    const courseLink = await screen.findByRole('link', { name: /copilot cli for beginners course/i });
    expect(courseLink).toHaveAttribute('href', 'https://github.com/github/copilot-cli-for-beginners');
  });

  it('uses concise gamified slot-machine intro copy', async () => {
    render(<App />);

    expect(await screen.findByText('Spin the reel. Name the command. Reveal the answer.')).toBeInTheDocument();
    expect(screen.queryByText('Spin, land on a Copilot CLI command, and see how to use it.')).not.toBeInTheDocument();
    expect(screen.queryByText('Spin the reel, land on a Copilot CLI command, and see when to use it.')).not.toBeInTheDocument();
  });

  it('shows Spin to start centered in the idle reel without the Copilot logo', () => {
    render(<App />);

    expect(screen.getByTestId('reel-strip')).toHaveStyle({ transform: 'translate3d(0, -48px, 0)' });
    expect(screen.getByText('Spin to start', { selector: '.reelText' })).toBeInTheDocument();
    expect(screen.queryByText('Press Spin')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /copilot logo/i })).not.toBeInTheDocument();
  });

  it('does not repeat the command as syntax when syntax is identical to the title', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: /spin/i });

    await userEvent.keyboard('`');
    await userEvent.type(screen.getByLabelText(/forced command/i), '/help');
    await userEvent.click(screen.getByRole('button', { name: /store command/i }));

    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('button', { name: /hide details/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '/help' })).toBeInTheDocument();
    expect(screen.queryByText('/help', { selector: '.syntaxLine code' })).not.toBeInTheDocument();
  });

  it('does not make the page wider after a command is selected on mobile', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: /spin/i });

    await userEvent.keyboard('`');
    await userEvent.type(screen.getByLabelText(/forced command/i), '/mcp show');
    await userEvent.click(screen.getByRole('button', { name: /store command/i }));

    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument(), { timeout: 4000 });
    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('heading', { name: '/mcp' })).toBeInTheDocument();
    const syntax = screen.getByText('/mcp [show|add|edit|delete|disable|enable|auth|reload] [SERVER]');
    const syntaxLine = syntax.closest('.syntaxLine');
    expect(syntaxLine).toHaveClass('syntaxLine');
    expect(getComputedStyle(syntaxLine as Element).maxWidth).toBe('100%');
  });

  it('hides details after spin until the settled command is previewed, then toggles to hide', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: /spin/i });

    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show details/i })).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('button', { name: /hide details/i })).toBeInTheDocument();
    expect(screen.getByTestId('details-card')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /hide details/i }));
    expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument();
    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();
  });

  it('keeps the selected item in the reel after settling instead of collapsing and snapping back', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: /spin/i });

    expect(screen.getAllByTestId('reel-item')).toHaveLength(1);

    fireEvent.click(button);

    expect(screen.getByTestId('reel-window')).toHaveAttribute('data-state', 'spinning');
    expect(screen.getAllByTestId('reel-item').length).toBeGreaterThan(8);

    await waitFor(() => expect(screen.getByTestId('reel-window')).toHaveAttribute('data-state', 'settled'), { timeout: 4000 });
    await waitFor(() => expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument(), { timeout: 1000 });

    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('reel-item').length).toBeGreaterThan(8);
    expect(screen.getByTestId('reel-strip')).toHaveClass('settled');
    expect(document.querySelectorAll('.reelItem.active')).toHaveLength(1);
  });

  it('shows idle text instead of a topic before the first spin', async () => {
    render(<App />);

    await screen.findByRole('button', { name: /spin/i });
    const reelWindow = screen.getByTestId('reel-window');

    expect(reelWindow).toHaveStyle({ '--reel-offset': '-48px' });
    expect(reelWindow).toHaveStyle({ '--selection-window-inset': '80px' });
    expect(reelWindow).toHaveStyle({ '--reel-item-height': '96px' });
    expect(reelWindow).toHaveStyle({ '--reel-text-nudge': '-5px' });
    expect(screen.getByText('Spin to start', { selector: '.reelText' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /copilot logo/i })).not.toBeInTheDocument();
    expect(screen.queryByText('/review', { selector: '.reelText' })).not.toBeInTheDocument();
    expect(screen.queryByText('Or scroll the window, then click the centered item.')).not.toBeInTheDocument();
  });

  it('keeps details hidden for the centered item while browsing until reveal is clicked', async () => {
    render(<App />);

    await screen.findByRole('button', { name: /spin/i });
    const reelWindow = screen.getByTestId('reel-window');

    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();

    fireEvent.wheel(reelWindow, { deltaY: 120 });
    const controls = screen.getByTestId('controls');

    expect(controls).toHaveClass('hasSecondaryControl');
    expect(Array.from(controls.querySelectorAll('button')).map((button) => button.textContent?.trim())).toEqual(['Spin', 'Show Details']);
    expect(reelWindow).toHaveAttribute('data-mode', 'browsing');
    expect(screen.getByText('/review', { selector: '.reelText' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument();
    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show details/i }));

    expect(screen.getByRole('heading', { name: '/review' })).toBeInTheDocument();
    expect(screen.getByText('Ask Copilot to review code for issues.')).toBeInTheDocument();
  });

  it('hides revealed details again when browsing moves to a new centered item', async () => {
    render(<App />);

    await screen.findByRole('button', { name: /spin/i });
    const reelWindow = screen.getByTestId('reel-window');

    fireEvent.wheel(reelWindow, { deltaY: 120 });
    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('heading', { name: '/review' })).toBeInTheDocument();

    fireEvent.wheel(reelWindow, { deltaY: 120 });

    expect(screen.getByText('/help', { selector: '.reelText' })).toBeInTheDocument();
    expect(screen.queryByTestId('details-card')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument();
  });

  it('lets users browse commands with the mouse wheel before revealing one', async () => {
    render(<App />);

    await screen.findByRole('button', { name: /spin/i });
    const reelWindow = screen.getByTestId('reel-window');

    fireEvent.wheel(reelWindow, { deltaY: 120 });

    expect(reelWindow).toHaveAttribute('data-mode', 'browsing');
    expect(screen.getAllByTestId('reel-item')).toHaveLength(payload.topics.length);
    expect(screen.getByText('/review', { selector: '.reelText' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '/review' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /choose \/review/i }));

    expect(screen.queryByRole('heading', { name: '/review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument();
  });

  it('ignores browse wheel input while the reel is spinning', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: /spin/i });
    const reelWindow = screen.getByTestId('reel-window');

    fireEvent.click(button);
    const spinningItemCount = screen.getAllByTestId('reel-item').length;

    fireEvent.wheel(reelWindow, { deltaY: 120 });

    expect(reelWindow).toHaveAttribute('data-state', 'spinning');
    expect(screen.getAllByTestId('reel-item')).toHaveLength(spinningItemCount);
  });

  it('opens a hidden forced-command dialog with the backtick key and uses it on the next spin', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: /spin/i });

    expect(screen.queryByLabelText(/forced command/i)).not.toBeInTheDocument();

    await userEvent.keyboard('`');
    const input = screen.getByLabelText(/forced command/i);
    await userEvent.type(input, '/mcp show');
    await userEvent.click(screen.getByRole('button', { name: /store command/i }));

    expect(screen.queryByLabelText(/forced command/i)).not.toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.queryByRole('heading', { name: '/mcp' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('heading', { name: '/mcp' })).toBeInTheDocument();
    expect(screen.getByText('/mcp [show|add|edit|delete|disable|enable|auth|reload] [SERVER]')).toBeInTheDocument();
  });
});
