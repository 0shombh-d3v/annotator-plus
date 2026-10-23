import * as fixtures from '../../test/annotation-fixtures';
import * as tabs from '../tabs';

describe('sidebar/helpers/tabs', () => {
  describe('tabForAnnotationLink', () => {
    it('opens a reply to a page note in Page Notes', () => {
      const root = { ...fixtures.oldPageNote(), id: 'root' };
      const reply = { ...fixtures.defaultAnnotation(), references: ['root'] };
      assert.equal(
        tabs.tabForAnnotationLink(reply, () => root),
        'note',
      );
    });

    it('opens a reply to a highlight in Annotations', () => {
      const root = { ...fixtures.defaultAnnotation(), id: 'root' };
      const reply = { ...fixtures.defaultAnnotation(), references: ['root'] };
      assert.equal(
        tabs.tabForAnnotationLink(reply, () => root),
        'annotation',
      );
    });

    it('reveals a reply whose root was deleted in Unanchored', () => {
      const reply = {
        ...fixtures.defaultAnnotation(),
        references: ['deleted'],
      };
      assert.equal(
        tabs.tabForAnnotationLink(reply, () => undefined),
        'orphan',
      );
    });
  });

  describe('tabForAnnotation', () => {
    [
      {
        ann: fixtures.defaultAnnotation(),
        expectedTab: 'annotation',
      },
      {
        ann: fixtures.oldPageNote(),
        expectedTab: 'note',
      },
      {
        ann: Object.assign(fixtures.defaultAnnotation(), { $orphan: true }),
        expectedTab: 'orphan',
      },
    ].forEach(testCase => {
      it(`shows annotation in correct tab (${testCase.expectedTab})`, () => {
        const ann = testCase.ann;
        const expectedTab = testCase.expectedTab;
        assert.equal(tabs.tabForAnnotation(ann), expectedTab);
      });
    });
  });
});
