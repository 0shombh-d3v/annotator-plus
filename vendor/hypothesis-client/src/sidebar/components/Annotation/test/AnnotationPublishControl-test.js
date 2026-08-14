import {
  checkAccessibility,
  mockImportedComponents,
} from '@hypothesis/frontend-testing';
import { mount } from '@hypothesis/frontend-testing';
import sinon from 'sinon';

import AnnotationPublishControl, {
  $imports,
} from '../AnnotationPublishControl';

describe('AnnotationPublishControl', () => {
  let fakeApplyTheme;
  let fakeOnCancel;
  let fakeOnSave;
  let fakeSettings;

  const createControl = (props = {}) =>
    mount(
      <AnnotationPublishControl
        isDisabled={false}
        onCancel={fakeOnCancel}
        onSave={fakeOnSave}
        settings={fakeSettings}
        {...props}
      />,
    );

  beforeEach(() => {
    fakeApplyTheme = sinon.stub();
    fakeOnCancel = sinon.stub();
    fakeOnSave = sinon.stub();
    fakeSettings = {
      branding: {
        ctaTextColor: '#0f0',
        ctaBackgroundColor: '#00f',
      },
    };

    $imports.$mock(mockImportedComponents());
    $imports.$mock({
      '../../helpers/theme': { applyTheme: fakeApplyTheme },
    });
  });

  afterEach(() => {
    $imports.$restore();
  });

  const getSaveButton = wrapper =>
    wrapper.find('Button[data-testid="publish-control-button"]');

  it('renders a plain Save button without sharing controls', () => {
    const wrapper = createControl();

    assert.equal(getSaveButton(wrapper).text(), 'Save');
    assert.isFalse(wrapper.exists('Menu'));
  });

  it('applies theme styles', () => {
    const fakeStyle = { foo: 'bar' };
    fakeApplyTheme.returns(fakeStyle);

    const button = getSaveButton(createControl());

    assert.calledWith(
      fakeApplyTheme,
      ['ctaTextColor', 'ctaBackgroundColor'],
      fakeSettings,
    );
    assert.include(button.prop('style'), fakeStyle);
  });

  it('supports disabled and save states', () => {
    assert.isTrue(
      getSaveButton(createControl({ isDisabled: true })).prop('disabled'),
    );

    const button = getSaveButton(createControl());
    button.props().onClick();
    assert.calledOnce(fakeOnSave);
  });

  it('cancels the edit', () => {
    const cancelButton = createControl().find(
      'Button[data-testid="cancel-button"]',
    );

    cancelButton.props().onClick();
    assert.calledOnce(fakeOnCancel);
  });

  it(
    'should pass a11y checks',
    checkAccessibility({ content: () => createControl() }),
  );
});
