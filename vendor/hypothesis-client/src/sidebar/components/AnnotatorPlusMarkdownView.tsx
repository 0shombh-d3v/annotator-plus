import { MarkdownView } from '@hypothesis/annotation-ui';
import type { MarkdownViewProps } from '@hypothesis/annotation-ui';

export default function AnnotatorPlusMarkdownView(props: MarkdownViewProps) {
  const renderObsidianMarkdown = (
    window as Window & {
      renderObsidianMarkdown?: (markdown: string) => string;
    }
  ).renderObsidianMarkdown;

  if (!renderObsidianMarkdown) {
    return <MarkdownView {...props} />;
  }

  return (
    <div
      className={props.classes}
      style={props.style}
      dangerouslySetInnerHTML={{
        __html: renderObsidianMarkdown(props.markdown),
      }}
    />
  );
}
