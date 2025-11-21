import React from 'react';

// A very simple and basic Markdown to React component renderer.
// Supports: **bold**, *italic*, ```code blocks```, and * list items.

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const parts = content.split(/(```[\s\S]*?```|\*\*.*?\*\*|\*.*?\*)/g);

  const renderCodeBlock = (block: string) => {
    const code = block.replace(/```/g, '').trim();
    return (
      <pre className="bg-gray-900/70 p-2 rounded-md my-2">
        <code className="text-sm text-yellow-300 font-mono whitespace-pre-wrap">{code}</code>
      </pre>
    );
  };
  
  const renderList = (text: string) => {
      const items = text.split('\n').filter(line => line.trim().startsWith('* '));
      if(items.length === 0) return text; // Not a list, just text with asterisks
      return (
          <ul className="list-disc list-inside space-y-1 my-2">
              {items.map((item, i) => (
                  <li key={i}>{item.replace(/^\*\s*/, '')}</li>
              ))}
          </ul>
      )
  }

  const renderText = (text: string) => {
    if (text.trim().startsWith('* ')) {
        return renderList(text);
    }
    const elements = text.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return <span key={i}>{part}</span>;
    });
    return <p className="text-sm whitespace-pre-wrap">{elements}</p>
  }

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.startsWith('```') && part.endsWith('```')) {
          return <div key={index}>{renderCodeBlock(part)}</div>;
        }
        return <div key={index}>{renderText(part)}</div>;
      })}
    </>
  );
};
