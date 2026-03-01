'use client';

import { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/components/ui/Toast';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language = 'python', showLineNumbers = true }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Normalize language names
  const langMap: Record<string, string> = {
    'py': 'python',
    'r': 'r',
    'js': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'sh': 'bash',
    'shell': 'bash',
    'yml': 'yaml',
  };
  const normalizedLang = langMap[language.toLowerCase()] || language.toLowerCase();

  // Split code into lines for line numbers
  const lines = code.split('\n');

  return (
    <div className="relative group rounded-lg overflow-hidden bg-[#1e1e1e] my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] border-b border-[#3d3d3d]">
        <span className="text-xs text-gray-400 uppercase">{normalizedLang}</span>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-[#3d3d3d] text-gray-400 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex overflow-x-auto">
        {showLineNumbers && lines.length > 1 && (
          <div className="flex-shrink-0 py-3 px-3 bg-[#1e1e1e] border-r border-[#3d3d3d] select-none text-right">
            {lines.map((_, i) => (
              <div key={i} className="text-xs text-gray-600 leading-5 font-mono">
                {i + 1}
              </div>
            ))}
          </div>
        )}
        <pre className={`!m-0 !rounded-t-none overflow-x-auto flex-1 ${showLineNumbers && lines.length > 1 ? '' : 'px-3'}`}>
          <code ref={codeRef} className={`language-${normalizedLang}`}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

// Markdown component override for code blocks
export function MarkdownCodeBlock({ children, className }: { children: string; className?: string }) {
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');
  
  return <CodeBlock code={code} language={match?.[1] || 'text'} />;
}
