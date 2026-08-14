import { Button, CancelIcon } from '@hypothesis/frontend-shared';

import type { SidebarSettings } from '../../../types/config';
import { applyTheme } from '../../helpers/theme';
import { withServices } from '../../service-context';

export type AnnotationPublishControlProps = {
  /**
   * Should the save button be disabled? Hint: it will be if the annotation has
   * no content
   */
  isDisabled?: boolean;

  /** Callback for cancel button click */
  onCancel: () => void;

  /** Callback for save button click */
  onSave: () => void;

  // Injected
  settings: SidebarSettings;
};

/**
 * Render controls for saving or canceling an annotation edit.
 *
 * @param {AnnotationPublishControlProps} props
 */
function AnnotationPublishControl({
  isDisabled,
  onCancel,
  onSave,
  settings,
}: AnnotationPublishControlProps) {
  const buttonStyle = applyTheme(
    ['ctaTextColor', 'ctaBackgroundColor'],
    settings,
  );

  return (
    <div className="flex flex-row gap-x-3">
      <div>
        <Button
          data-testid="publish-control-button"
          style={buttonStyle}
          onClick={onSave}
          disabled={isDisabled}
          size="lg"
          variant="primary"
        >
          Save
        </Button>
      </div>
      <div>
        <Button data-testid="cancel-button" onClick={onCancel} size="lg">
          <CancelIcon />
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default withServices(AnnotationPublishControl, ['settings']);
