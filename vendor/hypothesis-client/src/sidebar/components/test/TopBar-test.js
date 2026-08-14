import {
  checkAccessibility,
  mockImportedComponents,
} from '@hypothesis/frontend-testing';
import { mount } from '@hypothesis/frontend-testing';

import TopBar, { $imports } from '../TopBar';

describe('TopBar', () => {
  beforeEach(() => {
    $imports.$mock(mockImportedComponents());
  });

  afterEach(() => {
    $imports.$restore();
  });

  const createTopBar = (props = {}) =>
    mount(<TopBar isSidebar={true} {...props} />);

  it('shows only search and sort controls in the sidebar', () => {
    const wrapper = createTopBar();

    assert.isTrue(wrapper.exists('SearchIconButton'));
    assert.isTrue(wrapper.exists('SortMenu'));
    assert.isFalse(wrapper.exists('GroupList'));
    assert.isFalse(wrapper.exists('UserMenu'));
    assert.isFalse(wrapper.exists('TopBarToggleButton'));
  });

  it('displays search input outside the sidebar', () => {
    const wrapper = createTopBar({ isSidebar: false });

    assert.isTrue(wrapper.exists('StreamSearchInput'));
    assert.isFalse(wrapper.exists('SearchIconButton'));
    assert.isFalse(wrapper.exists('SortMenu'));
  });

  it(
    'should pass a11y checks',
    checkAccessibility([
      {
        name: 'in sidebar',
        content: () => createTopBar({ isSidebar: true }),
      },
      {
        name: 'outside sidebar',
        content: () => createTopBar({ isSidebar: false }),
      },
    ]),
  );
});
