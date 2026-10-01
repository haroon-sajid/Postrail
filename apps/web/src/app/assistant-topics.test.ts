import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOPICS, matchTopic } from './assistant-topics';

describe('matchTopic', () => {
  it.each([
    ['How do I send my first email?', 'first-email'],
    ['three emails FAILED last night', 'failures'],
    ['what is my daily limit', 'limits'],
    ['can you notify my server', 'webhooks'],
  ])('routes "%s" to %s', (question, id) => {
    expect(matchTopic(question)?.id).toBe(id);
  });

  it('returns undefined for a question none of the topics covers', () => {
    expect(matchTopic('what is the weather in Lahore')).toBeUndefined();
  });

  it('finds every topic from its own suggested prompt', () => {
    for (const topic of ASSISTANT_TOPICS) {
      expect(matchTopic(topic.prompt)?.id).toBe(topic.id);
    }
  });
});
