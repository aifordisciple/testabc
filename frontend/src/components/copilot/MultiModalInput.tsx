'use client';

import { useState, useRef, useCallback } from 'react';
import { 
  Mic, MicOff, Image, Paperclip, X, 
  Upload, Loader2, AlertCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MultiModalInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onFilesSelected: (files: File[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function MultiModalInput({
  value,
  onChange,
  onSubmit,
  onFilesSelected,
  isLoading,
  disabled,
  placeholder = "Type a message..."
}: MultiModalInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files]);
      onFilesSelected([...attachedFiles, ...files]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [attachedFiles, onFilesSelected]);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      onFilesSelected(newFiles);
      return newFiles;
    });
  }, [onFilesSelected]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        // Convert to text using Web Speech API
        setIsProcessingVoice(true);
        try {
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          // Use Speech Recognition API
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            
            recognition.onresult = (event: any) => {
              const transcript = event.results[0][0].transcript;
              onChange(value + ' ' + transcript);
            };
            
            recognition.onerror = () => {
              console.error('Speech recognition failed');
            };
            
            recognition.start();
          }
        } catch (e) {
          console.error('Voice processing error:', e);
        } finally {
          setIsProcessingVoice(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [value, onChange]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (file.type.startsWith('audio/')) return <Mic className="w-4 h-4" />;
    return <Paperclip className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-2">
      {/* Attached Files */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-lg">
          {attachedFiles.map((file, index) => (
            <div 
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-full border text-sm"
            >
              {getFileIcon(file)}
              <span className="max-w-[150px] truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              <button
                onClick={() => removeFile(index)}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="relative flex items-end bg-background border border-input rounded-xl overflow-hidden focus-within:border-primary transition-all">
        {/* Attachment Buttons */}
        <div className="flex items-center p-2 border-r border-input">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*,.fastq,.fq,.bam,.sam,.vcf,.bed,.fasta,.fa,.csv,.tsv,.txt,.json"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 w-8"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 w-8"
          >
            <Image className="w-4 h-4" />
          </Button>
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={isRecording ? stopRecording : startRecording}
            className={cn("h-8 w-8", isRecording && "text-red-500")}
            disabled={isProcessingVoice}
          >
            {isProcessingVoice ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Text Input */}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { 
            if (e.key === 'Enter' && !e.shiftKey) { 
              e.preventDefault(); 
              onSubmit(e); 
            } 
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-foreground px-3 py-2 max-h-24 md:max-h-32 outline-none resize-none placeholder:text-muted-foreground text-sm"
          rows={1}
          disabled={disabled}
        />

        {/* Submit Button */}
        <div className="p-2 flex-shrink-0">
          <Button 
            type="submit"
            onClick={onSubmit}
            disabled={!value.trim() || isLoading || disabled}
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Voice Recording Indicator */}
      {isRecording && (
        <div className="flex items-center justify-center gap-2 text-sm text-red-500 animate-pulse">
          <Mic className="w-4 h-4" />
          <span>Recording... Click to stop</span>
        </div>
      )}
    </div>
  );
}
