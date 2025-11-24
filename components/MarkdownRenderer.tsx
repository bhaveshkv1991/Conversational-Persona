import React from 'react';

// Improved Markdown Renderer supporting Headers, Code Blocks, Lists, and basic formatting.

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  // Split content by lines to process block elements
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- CODE BLOCKS ---
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        elements.push(
          <pre key={`code-${i}`} className="bg-zinc-900/80 p-3 rounded-lg my-3 overflow-x-auto border border-zinc-800">
            <code className="text-sm text-yellow-300 font-mono whitespace-pre-wrap">
              {codeBlockContent.join('\n')}
            </code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockLang = line.replace('```', '').trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // --- HEADERS ---
    if (line.startsWith('#')) {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const sizes = {
          1: 'text-2xl font-bold text-white mt-6 mb-3 border-b border-zinc-700 pb-2',
          2: 'text-xl font-bold text-white mt-5 mb-2',
          3: 'text-lg font-semibold text-blue-100 mt-4 mb-2',
          4: 'text-base font-semibold text-gray-100 mt-3 mb-1',
          5: 'text-sm font-bold text-gray-200 mt-2',
          6: 'text-xs font-bold text-gray-300 mt-2'
        };
        const className = sizes[level as keyof typeof sizes];
        elements.push(<div key={`h-${i}`} className={className}>{formatInline(text)}</div>);
        continue;
      }
    }

    // --- LISTS ---
    if (line.match(/^(\*|-|\d+\.)\s/)) {
        const isOrdered = /^\d+\./.test(line);
        const indent = line.search(/\S/);
        const text = line.replace(/^(\s*)(\*|-|\d+\.)\s+/, '');
        
        elements.push(
            <div key={`list-${i}`} className={`flex items-start ml-${indent > 0 ? 4 : 0} my-1`}>
                <span className="mr-2 text-zinc-400 text-xs mt-1.5">{isOrdered ? line.match(/^\d+\./)?.[0] : '•'}</span>
                <span className="text-gray-200">{formatInline(text)}</span>
            </div>
        );
        continue;
    }

    // --- EMPTY LINES ---
    if (!line.trim()) {
        elements.push(<div key={`empty-${i}`} className="h-2"></div>);
        continue;
    }

    // --- PARAGRAPHS / PLAIN TEXT ---
    elements.push(
        <p key={`p-${i}`} className="text-sm leading-relaxed text-gray-200 mb-1">
            {formatInline(line)}
        </p>
    );
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
      elements.push(
          <pre key="code-end" className="bg-zinc-900/80 p-3 rounded-lg my-3 overflow-x-auto border border-zinc-800">
            <code className="text-sm text-yellow-300 font-mono whitespace-pre-wrap">
              {codeBlockContent.join('\n')}
            </code>
          </pre>
      );
  }

  return <>{elements}</>;
};

// Helper for bold/italic/code inline
const formatInline = (text: string): React.ReactNode => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={index} className="bg-zinc-800 px-1 py-0.5 rounded text-yellow-200 font-mono text-xs">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="font-bold text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={index} className="italic text-gray-300">{part.slice(1, -1)}</em>;
        }
        return <span key={index}>{part}</span>;
    });
};