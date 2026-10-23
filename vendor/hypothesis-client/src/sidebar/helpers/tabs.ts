// Functions that determine which tab an annotation should be displayed in.
import type { Annotation } from '../../types/api';
import type { TabName } from '../../types/sidebar';
import * as metadata from '../helpers/annotation-metadata';

/**
 * Return the tab in which an annotation should be displayed.
 */
export function tabForAnnotation(ann: Annotation): TabName {
  if (metadata.isOrphan(ann)) {
    return 'orphan';
  } else if (metadata.isPageNote(ann)) {
    return 'note';
  } else {
    return 'annotation';
  }
}

/** Replies belong to their root thread's tab, including page-note threads. */
export function tabForAnnotationLink(
  annotation: Annotation,
  findAnnotation: (id: string) => Annotation | undefined,
): TabName {
  const rootId = annotation.references?.[0];
  const root = rootId ? findAnnotation(rootId) : annotation;
  return root ? tabForAnnotation(root) : 'orphan';
}
