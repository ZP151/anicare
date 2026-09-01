import { getReportCopy } from './report-copy';

describe('report hub copy', () => {
  it('has the same complete, human-facing copy contract in English and Simplified Chinese', () => {
    const english = getReportCopy('en');
    const chinese = getReportCopy('zh-CN');

    expect(Object.keys(english).sort()).toEqual(Object.keys(chinese).sort());
    expect(english.startAction).toBe('Start a report');
    expect(chinese.startAction).toBe('开始报告');
  });

  it('does not make an AI, model, or candidate promise in the report hub', () => {
    expect(JSON.stringify([getReportCopy('en'), getReportCopy('zh-CN')])).not.toMatch(/\bAI\b|model|candidate|suggest/i);
  });
});
