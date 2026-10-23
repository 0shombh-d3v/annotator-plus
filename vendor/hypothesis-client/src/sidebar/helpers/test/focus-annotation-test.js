import { createSidebarStore } from '../../store';
import * as fixtures from '../../test/annotation-fixtures';
import { focusAnnotation } from '../focus-annotation';
import { threadAnnotations } from '../thread-annotations';

describe('sidebar/helpers/focus-annotation', () => {
  let store;

  beforeEach(() => {
    store = createSidebarStore({});
  });

  function visibleThreads() {
    return threadAnnotations({
      annotations: store.allAnnotations(),
      selection: {
        ...store.selectionState(),
        filterQuery: null,
        filters: {},
      },
      showTabs: true,
    }).rootThread.children;
  }

  it('reveals and expands the page-note thread containing a linked reply', () => {
    const root = { ...fixtures.oldPageNote(), id: 'root' };
    const reply = {
      ...fixtures.defaultAnnotation(),
      id: 'reply',
      references: ['root'],
    };
    store.addAnnotations([root, reply]);

    const anchor = focusAnnotation(store, 'reply');

    const [thread] = visibleThreads();
    assert.equal(anchor.id, 'root');
    assert.equal(store.selectedTab(), 'note');
    assert.equal(thread.id, 'root');
    assert.isFalse(thread.collapsed);
    assert.equal(thread.children[0].id, 'reply');
    assert.equal(store.annotationFocusRequest(), 'reply');
  });

  it('expands every ancestor of a linked nested reply', () => {
    const root = {
      ...fixtures.defaultAnnotation(),
      id: 'root',
      $orphan: false,
    };
    const reply = {
      ...fixtures.defaultAnnotation(),
      id: 'reply',
      references: ['root'],
    };
    const nested = { ...reply, id: 'nested', references: ['root', 'reply'] };
    store.addAnnotations([root, reply, nested]);

    focusAnnotation(store, 'nested');

    const [thread] = visibleThreads();
    assert.isFalse(thread.collapsed);
    assert.isFalse(thread.children[0].collapsed);
    assert.equal(thread.children[0].children[0].id, 'nested');
  });

  it('leaves the current selection intact for an unknown annotation', () => {
    store.selectAnnotations(['existing']);

    assert.isUndefined(focusAnnotation(store, 'missing'));
    assert.deepEqual(store.selectedAnnotations(), ['existing']);
  });
});
