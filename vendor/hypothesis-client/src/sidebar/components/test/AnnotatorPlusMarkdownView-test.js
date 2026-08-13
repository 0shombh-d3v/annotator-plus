import { mockImportedComponents, mount } from '@hypothesis/frontend-testing';

import AnnotatorPlusMarkdownView, {
  $imports,
} from '../AnnotatorPlusMarkdownView';

describe('AnnotatorPlusMarkdownView', () => {
  afterEach(() => {
    delete window.renderObsidianMarkdown;
    $imports.$restore();
  });

  it('uses the upstream renderer when the Obsidian bridge is unavailable', () => {
    $imports.$mock(mockImportedComponents());
    const wrapper = mount(<AnnotatorPlusMarkdownView markdown="plain" />);

    assert.isTrue(wrapper.find('MarkdownView').exists());
  });

  it('uses the Obsidian renderer when the bridge is available', () => {
    window.renderObsidianMarkdown = sinon.stub().returns('<em>rendered</em>');
    const wrapper = mount(
      <AnnotatorPlusMarkdownView markdown="*rendered*" classes="note" />,
    );

    assert.calledWith(window.renderObsidianMarkdown, '*rendered*');
    assert.equal(
      wrapper.find('div.note').html(),
      '<div class="note"><em>rendered</em></div>',
    );
  });
});
