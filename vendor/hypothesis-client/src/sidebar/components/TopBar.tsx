import classnames from 'classnames';

import SortMenu from './SortMenu';
import SearchIconButton from './search/SearchIconButton';
import StreamSearchInput from './search/StreamSearchInput';

export type TopBarProps = {
  /** Flag indicating whether the app is in a sidebar context */
  isSidebar: boolean;
};

/**
 * The toolbar which appears at the top of the sidebar providing search and
 * sorting controls.
 */
function TopBar({ isSidebar }: TopBarProps) {
  return (
    <div
      className={classnames(
        'absolute h-10 left-0 top-0 right-0 z-4',
        'text-grey-7 border-b theme-clean:border-b-0 bg-white',
      )}
      data-testid="top-bar"
    >
      <div
        className={classnames(
          'container flex items-center h-full',
          // Text sizing will size icons in buttons correctly
          'text-[16px]',
        )}
        data-testid="top-bar-content"
      >
        {!isSidebar && <StreamSearchInput />}
        <div className="grow flex items-center justify-end">
          {isSidebar && (
            <>
              <SearchIconButton />
              <SortMenu />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default TopBar;
