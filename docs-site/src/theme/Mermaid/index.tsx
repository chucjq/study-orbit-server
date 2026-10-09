import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import ErrorBoundary from '@docusaurus/ErrorBoundary';
import {ErrorBoundaryErrorMessageFallback} from '@docusaurus/theme-common';
import {MermaidContainerClassName, useMermaidConfig} from '@docusaurus/theme-mermaid/client';

// Overrides the theme's Mermaid component (swizzled, same props) so diagrams render one
// at a time. Mermaid is a shared singleton that is re-initialised before every render, and
// the stock component starts every diagram's render at once and again whenever the colour
// mode changes. In dark mode that left the second diagram on a page empty. A queue, a
// fresh id per render and a guard against stale results avoid the overlap.

type RenderResult = {svg: string; bindFunctions?: (element: Element) => void};
type MermaidConfig = ReturnType<typeof useMermaidConfig>;

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

function enqueueRender(text: string, config: MermaidConfig): Promise<RenderResult> {
  const run = async (): Promise<RenderResult> => {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize(config);
    counter += 1;
    const id = `mermaid-svg-${counter}`;
    try {
      return await mermaid.render(id, text);
    } catch (error) {
      // Mermaid leaves an error element in the page when a render fails.
      document.querySelector(`#d${id}`)?.remove();
      throw error;
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

function MermaidRenderer({value}: {value: string}): ReactNode {
  const config = useMermaidConfig();
  const [result, setResult] = useState<RenderResult | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    enqueueRender(value, config)
      .then((rendered) => {
        if (current) setResult(rendered);
      })
      .catch((error: unknown) => {
        // Hands the error to the error boundary below.
        if (current) {
          setResult(() => {
            throw error;
          });
        }
      });
    return () => {
      current = false;
    };
  }, [value, config]);

  useEffect(() => {
    if (result && ref.current) result.bindFunctions?.(ref.current);
  }, [result]);

  if (result === null) return null;
  return (
    <div
      ref={ref}
      className={MermaidContainerClassName}
      dangerouslySetInnerHTML={{__html: result.svg}}
    />
  );
}

export default function Mermaid(props: {value: string}): ReactNode {
  return (
    <ErrorBoundary fallback={(params) => <ErrorBoundaryErrorMessageFallback {...params} />}>
      <MermaidRenderer {...props} />
    </ErrorBoundary>
  );
}
