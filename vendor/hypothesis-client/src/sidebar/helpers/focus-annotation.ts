import type { Annotation } from '../../types/api';
import type { SidebarStore } from '../store';
import { tabForAnnotationLink } from './tabs';

/** Reveal an annotation's whole thread and return its document anchor. */
export function focusAnnotation(
  store: SidebarStore,
  id: string,
): Annotation | undefined {
  const annotation = store.findAnnotationByID(id);
  if (!annotation) {
    return undefined;
  }

  const ancestors = annotation.references ?? [];
  const rootId = ancestors[0] ?? id;
  store.selectTab(
    tabForAnnotationLink(annotation, id => store.findAnnotationByID(id)),
  );
  // Selection filters top-level threads, while the focus request names the
  // individual card. Selecting a reply ID would hide its containing thread.
  store.selectAnnotations([rootId]);
  for (const ancestorId of ancestors) {
    store.setExpanded(ancestorId, true);
  }
  store.setAnnotationFocusRequest(id);
  return store.findAnnotationByID(rootId) ?? annotation;
}
