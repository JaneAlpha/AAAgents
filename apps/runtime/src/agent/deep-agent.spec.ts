import { extractChunk } from './deep-agent';

describe('extractChunk（流式分片来源判定）', () => {
  it('AI 消息 → source=ai', () => {
    expect(extractChunk([{ type: 'ai', content: 'hello' }])).toEqual({ delta: 'hello', source: 'ai' });
  });

  it('tool 消息 → source=tool', () => {
    expect(extractChunk([{ type: 'tool', content: 'ls -la' }])).toEqual({ delta: 'ls -la', source: 'tool' });
  });

  it('内容为数组时拼接文本', () => {
    expect(extractChunk([{ type: 'ai', content: [{ text: 'a' }, 'b'] }])).toEqual({ delta: 'ab', source: 'ai' });
  });

  it('空内容 → null（不产出空分片）', () => {
    expect(extractChunk([{ type: 'ai', content: '' }])).toBeNull();
  });

  it('无 type 的消息按 ai 处理', () => {
    expect(extractChunk({ content: 'x' })).toEqual({ delta: 'x', source: 'ai' });
  });
});
