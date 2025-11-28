
import React from 'react';

// Improved Markdown Renderer supporting Headers, Code Blocks, Lists, Tables and basic formatting.

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  // Split content by lines to process block elements
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  let inTable = false;
  let tableRows: string[] = [];

  const cleanSplit = (rowStr: string) => {
      const parts = rowStr.split('|');
      // Remove first and last if empty (common in standard markdown tables like | a | b |)
      if (parts.length > 1 && parts[0].trim() === '') parts.shift();
      if (parts.length > 0 && parts[parts.length - 1].trim() === '') parts.pop();
      return parts.map(p => p.trim());
  };

  const flushTable = (keyIndex: number) => {
      if (tableRows.length === 0) {
          inTable = false;
          return;
      }

      const headerRow = tableRows[0];
      const realHeaders = cleanSplit(headerRow);
      
      let bodyRowsRaw = tableRows.slice(1);
      
      // Check for separator row (e.g. |---|---|)
      if (bodyRowsRaw.length > 0) {
          const separatorCheck = bodyRowsRaw[0].replace(/[\s|:-]/g, '');
          if (separatorCheck === '') {
              bodyRowsRaw = bodyRowsRaw.slice(1);
          }
      }

      const realRows = bodyRowsRaw.map(r => cleanSplit(r));

      elements.push(
          <div key={`table-${keyIndex}`} className="overflow-x-auto my-4 border border-zinc-700 rounded-lg">
              <table className="min-w-full divide-y divide-zinc-700 bg-zinc-900 text-sm">
                  <thead className="bg-zinc-800">
                      <tr>
                          {realHeaders.map((h, i) => (
                              <th key={i} className="px-4 py-3 text-left font-semibold text-white uppercase tracking-wider text-xs whitespace-nowrap">
                                  {formatInline(h)}
                              </th>
                          ))}
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700">
                      {realRows.map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800/50'}>
                              {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-4 py-3 text-gray-300 whitespace-pre-wrap min-w-[120px]">
                                      {formatInline(cell)}
                                  </td>
                              ))}
                              {/* Fill missing cells */}
                              {row.length < realHeaders.length && 
                                Array(realHeaders.length - row.length).fill(null).map((_, i) => (
                                    <td key={`empty-${i}`} className="px-4 py-3"></td>
                                ))
                              }
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      );
      
      tableRows = [];
      inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- CODE BLOCKS ---
    if (line.trim().startsWith('```')) {
      if (inTable) flushTable(i); // Flush table if code block starts
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
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // --- TABLES ---
    // Detect table line: starts with | 
    if (line.trim().startsWith('|')) {
        inTable = true;
        tableRows.push(line);
        continue;
    }

    // If we were in a table but this line is not a table line, flush.
    if (inTable) {
        flushTable(i);
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

  // Handle unclosed blocks
  if (inCodeBlock && codeBlockContent.length > 0) {
      elements.push(
          <pre key="code-end" className="bg-zinc-900/80 p-3 rounded-lg my-3 overflow-x-auto border border-zinc-800">
            <code className="text-sm text-yellow-300 font-mono whitespace-pre-wrap">
              {codeBlockContent.join('\n')}
            </code>
          </pre>
      );
  }

  if (inTable && tableRows.length > 0) {
      flushTable(lines.length);
  }

  return <>{elements}</>;
};

// Helper for bold/italic/code inline
const formatInline = (text: string): React.ReactNode => {
    // Basic regex split that keeps delimiters. Note: this is a simple parser.
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
