import { useEffect } from 'react';
import { marked } from 'marked';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';

marked.setOptions({
  breaks: true,
  gfm: true
});

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  useEffect(() => {
    Prism.highlightAll();
  }, [content]);

  const rawHtml = marked.parse(content || '') as string;

  return (
    <div 
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: rawHtml }} 
    />
  );
}
