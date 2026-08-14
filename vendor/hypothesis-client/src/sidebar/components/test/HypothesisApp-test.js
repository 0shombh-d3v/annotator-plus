import { mockImportedComponents } from '@hypothesis/frontend-testing';
import { mount } from '@hypothesis/frontend-testing';

import HypothesisApp, { $imports } from '../HypothesisApp';

describe('HypothesisApp', () => {
  let fakeApplyTheme;
  let fakeStore = null;
  let fakeAuth = null;
  let fakeFrameSync;
  let fakeServiceConfig = null;
  let fakeSession = null;
  let fakeShouldAutoDisplayTutorial = null;
  let fakeShouldShowYoutubeDisclaimer = null;
  let fakeSettings = null;
  let fakeToastMessenger = null;
  let fakeIsThirdPartyService;

  const createComponent = (props = {}) => {
    return mount(
      <HypothesisApp
        auth={fakeAuth}
        frameSync={fakeFrameSync}
        settings={fakeSettings}
        session={fakeSession}
        toastMessenger={fakeToastMessenger}
        {...props}
      />,
    );
  };

  beforeEach(() => {
    fakeApplyTheme = sinon.stub().returns({});
    fakeServiceConfig = sinon.stub();
    fakeShouldAutoDisplayTutorial = sinon.stub().returns(false);
    fakeShouldShowYoutubeDisclaimer = sinon.stub().returns(false);

    fakeStore = {
      clearGroups: sinon.stub(),
      closeSidebarPanel: sinon.stub(),
      openSidebarPanel: sinon.stub(),
      profile: sinon.stub().returns({
        userid: null,
        preferences: {
          show_sidebar_tutorial: false,
        },
      }),
      route: sinon.stub().returns('sidebar'),
    };

    fakeAuth = {
      login: sinon.stub().resolves(),
    };

    fakeSession = {
      load: sinon.stub().returns(Promise.resolve({ userid: null })),
      reload: sinon.stub().returns(Promise.resolve({ userid: null })),
    };

    fakeSettings = {};

    fakeFrameSync = {
      notifyHost: sinon.stub(),
    };

    fakeToastMessenger = {
      error: sinon.stub(),
      notice: sinon.stub(),
    };

    fakeIsThirdPartyService = sinon.stub().returns(false);

    $imports.$mock(mockImportedComponents());
    $imports.$mock({
      '../config/service-config': { serviceConfig: fakeServiceConfig },
      '../store': { useSidebarStore: () => fakeStore },
      '../helpers/session': {
        shouldAutoDisplayTutorial: fakeShouldAutoDisplayTutorial,
        shouldShowYoutubeDisclaimer: fakeShouldShowYoutubeDisclaimer,
      },
      '../helpers/theme': { applyTheme: fakeApplyTheme },
      '../helpers/is-third-party-service': {
        isThirdPartyService: fakeIsThirdPartyService,
      },
    });
  });

  afterEach(() => {
    $imports.$restore();
  });

  it('does not render content if route is not yet determined', () => {
    fakeStore.route.returns(null);
    const wrapper = createComponent();
    [
      'main',
      'AnnotationView',
      'NotebookView',
      'StreamView',
      'SidebarView',
    ].forEach(contentComponent => {
      assert.isFalse(wrapper.exists(contentComponent));
    });
  });

  [
    {
      route: 'annotation',
      contentComponent: 'AnnotationView',
    },
    {
      route: 'sidebar',
      contentComponent: 'SidebarView',
    },
    {
      route: 'notebook',
      contentComponent: 'NotebookView',
    },
    {
      route: 'profile',
      contentComponent: 'ProfileView',
    },
    {
      route: 'stream',
      contentComponent: 'StreamView',
    },
  ].forEach(({ route, contentComponent }) => {
    it('renders app content for route', () => {
      fakeStore.route.returns(route);
      const wrapper = createComponent();
      assert.isTrue(wrapper.find(contentComponent).exists());
    });
  });

  describe('auto-opening tutorial', () => {
    it('should open tutorial on profile load when criteria are met', () => {
      fakeShouldAutoDisplayTutorial.returns(true);
      createComponent();
      assert.calledOnce(fakeStore.openSidebarPanel);
    });

    it('should not open tutorial on profile load when criteria are not met', () => {
      fakeShouldAutoDisplayTutorial.returns(false);
      createComponent();
      assert.notCalled(fakeStore.openSidebarPanel);
    });
  });

  describe('YouTube disclaimer banner', () => {
    it('renders YouTubeDisclaimerBanner when not on modal route and shouldShowYoutubeDisclaimer returns true', () => {
      fakeStore.route.returns('sidebar');
      fakeShouldShowYoutubeDisclaimer.returns(true);

      const wrapper = createComponent();

      assert.isTrue(wrapper.find('YouTubeDisclaimerBanner').exists());
    });

    it('does not render YouTubeDisclaimerBanner when shouldShowYoutubeDisclaimer returns false', () => {
      fakeShouldShowYoutubeDisclaimer.returns(false);

      const wrapper = createComponent();

      assert.isFalse(wrapper.find('YouTubeDisclaimerBanner').exists());
    });

    it('does not render YouTubeDisclaimerBanner on modal routes', () => {
      fakeShouldShowYoutubeDisclaimer.returns(true);
      fakeStore.route.returns('profile');

      const wrapper = createComponent();

      assert.isFalse(wrapper.find('YouTubeDisclaimerBanner').exists());
    });
  });

  // Add tests for common behaviors shared between "Log in" and "Sign up" actions.
  function addCommonLoginTests(action) {
    const clickButton = wrapper =>
      wrapper
        .find('SidebarView')
        .prop(action === 'login' ? 'onLogin' : 'onSignUp')();

    it('clears groups', async () => {
      const wrapper = createComponent();
      await clickButton(wrapper);
      assert.called(fakeStore.clearGroups);
    });

    it('initiates the OAuth login flow', async () => {
      const wrapper = createComponent();
      await clickButton(wrapper);
      assert.calledWith(fakeAuth.login, { action });
    });

    it('reloads the session when login completes', async () => {
      const wrapper = createComponent();
      await clickButton(wrapper);
      assert.called(fakeSession.reload);
    });

    it('closes the login prompt panel', async () => {
      const wrapper = createComponent();
      await clickButton(wrapper);
      assert.called(fakeStore.closeSidebarPanel);
    });

    it('reports an error if login fails', async () => {
      fakeAuth.login.returns(Promise.reject(new Error('Login failed')));

      const wrapper = createComponent();
      await clickButton(wrapper);
      assert.called(fakeToastMessenger.error);
    });
  }

  describe('"Sign up" action', () => {
    const clickSignUp = wrapper =>
      wrapper.find('SidebarView').props().onSignUp();

    addCommonLoginTests('signup');

    context('when using a third-party service', () => {
      beforeEach(() => {
        fakeServiceConfig.returns({});
      });

      it('sends "signupRequested" event', () => {
        const wrapper = createComponent();
        clickSignUp(wrapper);
        assert.calledWith(fakeFrameSync.notifyHost, 'signupRequested');
      });

      it('does not log in', () => {
        const wrapper = createComponent();
        clickSignUp(wrapper);
        assert.notCalled(fakeAuth.login);
      });
    });
  });

  describe('"Log in" action', () => {
    const clickLogIn = wrapper => wrapper.find('SidebarView').props().onLogin();

    addCommonLoginTests('login');

    it('sends "loginRequested" event to host page if using a third-party service', async () => {
      // If the client is using a third-party annotation service then clicking
      // on a login button should notify the host frame (so that the partner
      // site we're embedded in can do its own login thing).
      fakeServiceConfig.returns({});

      const wrapper = createComponent();
      await clickLogIn(wrapper);

      assert.equal(fakeFrameSync.notifyHost.callCount, 1);
      assert.isTrue(
        fakeFrameSync.notifyHost.calledWithExactly('loginRequested'),
      );
    });
  });

  describe('theming', () => {
    const appSelector = '[data-testid="hypothesis-app"]';
    it('applies theme config', () => {
      const style = { backgroundColor: 'red' };
      fakeApplyTheme.returns({ backgroundColor: 'red' });

      const wrapper = createComponent();
      const background = wrapper.find(appSelector);

      assert.calledWith(fakeApplyTheme, ['appBackgroundColor'], fakeSettings);
      assert.deepEqual(background.prop('style'), style);
    });

    it('applies a clean-theme style when config sets theme to "clean"', () => {
      fakeSettings.theme = 'clean';

      const wrapper = createComponent();
      const container = wrapper.find(appSelector);

      assert.isTrue(container.hasClass('theme-clean'));
    });

    it('does not apply clean-theme style when config does not assert `clean` theme', () => {
      fakeSettings.theme = '';

      const wrapper = createComponent();
      const container = wrapper.find(appSelector);

      assert.isFalse(container.hasClass('theme-clean'));
    });
  });
});
