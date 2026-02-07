'use client';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useEffect } from 'react';

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange: (value: string | undefined) => void;
  height?: string;
}

export default function CodeEditor({ value, language = 'groovy', onChange, height = "400px" }: CodeEditorProps) {
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      // 定义 Nextflow 简单的语法高亮 (基于 Groovy 扩展)
      monaco.languages.register({ id: 'nextflow' });
      monaco.languages.setMonarchTokensProvider('nextflow', {
        tokenizer: {
          root: [
            [/(process|workflow|input|output|script|when|channel)/, "keyword"],
            [/[a-z_$][\w$]*/, "identifier"],
            [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
          ],
          string: [
            [/[^"]+/, "string"],
            [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
          ]
        }
      });
    }
  }, [monaco]);

  return (
    // 🛠️ 修复：添加 style={{ height }}，确保外层容器能接收并应用 "100%" 高度
    <div 
      className="border border-gray-700 rounded-lg overflow-hidden shadow-inner bg-[#1e1e1e]"
      style={{ height }} 
    >
      <Editor
        height="100%" // 内部始终填满外层容器
        defaultLanguage={language}
        language={language === 'nextflow' ? 'nextflow' : language}
        value={value}
        theme="vs-dark"
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 16, bottom: 16 }
        }}
      />
    </div>
  );
}