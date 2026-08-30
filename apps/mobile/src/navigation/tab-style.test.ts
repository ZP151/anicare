import { tabVisualContract } from './tab-style';

describe('bottom navigation visual contract', () => {
  it('keeps the five destinations readable within the approved 80pt chrome', () => {
    expect(tabVisualContract).toEqual({
      barHeight: 80,
      iconSize: 31,
      labelFontSize: 12,
      labelLineHeight: 15,
      topPadding: 7,
      bottomPadding: 9,
    });
  });
});
