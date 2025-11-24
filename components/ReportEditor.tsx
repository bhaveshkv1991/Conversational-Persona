import React, { useState } from 'react';
import { ArrowLeftIcon, DocumentIcon, DownloadIcon, EyeIcon, PencilSquareIcon, XIcon } from './icons/Icons';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ReportEditorProps {
    initialContent: string;
    title?: string;
    timestamp?: number;
    onClose: () => void;
    onSave?: (updatedContent: string) => void;
    readOnly?: boolean;
}

export const ReportEditor: React.FC<ReportEditorProps> = ({ 
    initialContent, 
    title = "Report", 
    timestamp = Date.now(), 
    onClose, 
    onSave,
    readOnly = false
}) => {
    const [content, setContent] = useState(initialContent);
    const [isEditing, setIsEditing] = useState(false);

    const handleSave = () => {
        if (onSave) {
            onSave(content);
        }
        setIsEditing(false);
    };

    const handleDownload = () => {
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-${new Date(timestamp).toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-900 w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-zinc-700 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-800/50">
                    <div>
                        <h3 className="text-lg font-semibold text-white flex items-center">
                            <DocumentIcon className="w-5 h-5 mr-2 text-blue-400"/>
                            {title}
                        </h3>
                        <p className="text-xs text-zinc-400">{new Date(timestamp).toLocaleString()}</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white p-2 rounded-full hover:bg-zinc-700 transition-colors">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between p-2 border-b border-zinc-700 bg-zinc-800">
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setIsEditing(false)}
                            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center ${!isEditing ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'}`}
                        >
                            <EyeIcon className="w-4 h-4 mr-2" /> Preview
                        </button>
                        {!readOnly && onSave && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center ${isEditing ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'}`}
                            >
                                <PencilSquareIcon className="w-4 h-4 mr-2" /> Edit
                            </button>
                        )}
                    </div>
                    <div className="flex space-x-2">
                        <button
                            onClick={handleDownload}
                            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm font-medium flex items-center transition-colors"
                        >
                            <DownloadIcon className="w-4 h-4 mr-2" /> Download
                        </button>
                        {isEditing && (
                            <button
                                onClick={handleSave}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition-colors"
                            >
                                Save Changes
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-grow overflow-hidden relative bg-zinc-950">
                    {isEditing ? (
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full h-full bg-zinc-950 text-gray-200 p-6 font-mono text-sm resize-none focus:outline-none"
                            spellCheck={false}
                        />
                    ) : (
                        <div className="w-full h-full overflow-y-auto p-6 prose prose-invert max-w-none">
                            <MarkdownRenderer content={content} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};