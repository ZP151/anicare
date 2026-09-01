import { tabVisualContract } from './tab-style';

describe('bottom navigation visual contract', () => {
  it('keeps the five destinations readable within the approved 88pt chrome', () => {
    expect(tabVisualContract).toEqual({
      barHeight: 88,
      iconSize: 28,
      labelFontSize: 10,
      labelLineHeight: 13,
      topPadding: 5,
      bottomPadding: 11,
    });
  });
});
