'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Camera, Video, FileText, Loader2, CheckCircle2 } from 'lucide-react';

interface ChatMediaUploaderProps {
    mode: 'photo' | 'video' | 'document';
    onUpload: (files: File[]) => Promise<void>;
    sending?: boolean;
    documentTypes?: Array<{ value: string; label: string }>;
}

const ACCEPT_MAP: Record<string, string> = {
    photo: 'image/jpeg,image/jpg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif,image/bmp',
    video: 'video/mp4,video/webm,video/quicktime,video/x-msvideo,video/3gpp,video/x-matroska,video/mpeg',
    document: 'application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/avif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
};

const LIMIT_MAP: Record<string, number> = {
    photo: 10,
    video: 2,
    document: 5,
};

const ICON_MAP: Record<string, React.ReactNode> = {
    photo: <Camera className="w-6 h-6" />,
    video: <Video className="w-6 h-6" />,
    document: <FileText className="w-6 h-6" />,
};

const LABEL_MAP: Record<string, string> = {
    photo: 'Upload Photos',
    video: 'Upload Videos',
    document: 'Upload Documents',
};

export default function ChatMediaUploader({ mode, onUpload, sending, documentTypes }: ChatMediaUploaderProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const limit = LIMIT_MAP[mode] || 10;

    const addFiles = useCallback((newFiles: FileList | File[]) => {
        const arr = Array.from(newFiles);
        setFiles(prev => {
            const combined = [...prev, ...arr].slice(0, limit);
            // Generate previews for images
            const newPreviews: string[] = [];
            combined.forEach(f => {
                if (f.type.startsWith('image/')) {
                    newPreviews.push(URL.createObjectURL(f));
                } else if (f.type.startsWith('video/')) {
                    newPreviews.push('video');
                } else {
                    newPreviews.push('doc');
                }
            });
            setPreviews(newPreviews);
            return combined;
        });
    }, [limit]);

    const removeFile = (idx: number) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
        setPreviews(prev => prev.filter((_, i) => i !== idx));
    };

    const handleUpload = async () => {
        if (files.length === 0 || uploading) return;
        setUploading(true);
        try {
            await onUpload(files);
            setDone(true);
        } catch {
            // Error handled by parent
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    };

    if (done) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm"
            >
                <CheckCircle2 className="w-4 h-4" />
                {files.length} {mode === 'photo' ? 'photo' : mode === 'video' ? 'video' : 'document'}{files.length > 1 ? 's' : ''} uploaded
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden"
        >
            {/* Drop zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer p-6 text-center transition-colors ${
                    dragOver
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-2 border-dashed border-emerald-400'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
                <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                    {ICON_MAP[mode]}
                    <span className="text-sm font-medium">{LABEL_MAP[mode]}</span>
                    <span className="text-xs text-slate-400">
                        {dragOver ? 'Drop files here' : `Click or drag & drop (max ${limit})`}
                    </span>
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT_MAP[mode]}
                    multiple={limit > 1}
                    onChange={e => e.target.files && addFiles(e.target.files)}
                    className="hidden"
                />
            </div>

            {/* Previews */}
            <AnimatePresence>
                {files.length > 0 && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="border-t border-slate-200 dark:border-slate-700 p-3"
                    >
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-3">
                            {files.map((file, idx) => (
                                <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700">
                                    {previews[idx] && previews[idx] !== 'video' && previews[idx] !== 'doc' ? (
                                        <img src={previews[idx]} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                            {previews[idx] === 'video' ? <Video className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                        </div>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[10px] text-white truncate">
                                        {file.name}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Upload button */}
                        <button
                            onClick={handleUpload}
                            disabled={uploading || sending}
                            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                            ) : (
                                <><Upload className="w-4 h-4" /> Upload {files.length} {mode}{files.length > 1 ? 's' : ''}</>
                            )}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
