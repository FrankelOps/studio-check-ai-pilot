import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, Clock, User, Copy, Check, FileText, Code, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SpeakerSegment {
  speaker: string;
  start_time: string;
  end_time: string;
  text: string;
}

interface TranscriptViewerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  date?: string;
  transcript: string;
  speakerSegments?: SpeakerSegment[];
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  isOpen,
  onClose,
  title,
  date,
  transcript,
  speakerSegments = []
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);
  const [isCleanView, setIsCleanView] = useState(true);
  const [formattedTranscript, setFormattedTranscript] = useState<string>("");
  const [isFormatting, setIsFormatting] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const handleCopyTranscript = async () => {
    try {
      const textToCopy = isCleanView && formattedTranscript ? formattedTranscript : transcript;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transcript:', err);
    }
  };

  const formatTranscriptWithGPT = async () => {
    if (!transcript && (!speakerSegments || speakerSegments.length === 0)) return;
    
    setIsFormatting(true);
    try {
      const { data, error } = await supabase.functions.invoke('format-transcript', {
        body: {
          speakerSegments: speakerSegments || null,
          transcriptText: transcript || ""
        }
      });

      if (error) throw error;
      
      setFormattedTranscript(data.formattedTranscript);
    } catch (error) {
      console.error('Failed to format transcript:', error);
      // Fallback to basic formatting if GPT fails
      setFormattedTranscript(transcript);
    } finally {
      setIsFormatting(false);
    }
  };

  useEffect(() => {
    if (isOpen && isCleanView && !formattedTranscript && !isFormatting) {
      formatTranscriptWithGPT();
    }
  }, [isOpen, isCleanView, transcript, speakerSegments]);

  const handleToggleView = () => {
    // Preserve scroll position
    const currentScrollTop = scrollAreaRef.current?.scrollTop || 0;
    setIsCleanView(!isCleanView);
    
    // Restore scroll position after state update
    setTimeout(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = currentScrollTop;
      }
    }, 0);
  };

  const formatCleanTranscript = (text: string): string[] => {
    if (!text) return [];
    
    // Basic formatting: add paragraph breaks and improve readability
    const paragraphs = text
      .split(/\n+/)
      .filter(p => p.trim().length > 0)
      .map(paragraph => {
        // Clean up spacing and add basic punctuation
        let cleaned = paragraph.trim();
        
        // Add period if missing at end of sentences
        if (cleaned.length > 0 && !cleaned.match(/[.!?]$/)) {
          cleaned += '.';
        }
        
        return cleaned;
      });

    return paragraphs;
  };

  const renderCleanView = () => {
    if (isFormatting) {
      return (
        <div className="flex items-center justify-center py-8 space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Formatting transcript for readability...</span>
        </div>
      );
    }

    if (!formattedTranscript) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            No formatted transcript available
          </p>
          <Button 
            variant="outline" 
            onClick={formatTranscriptWithGPT}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Format Transcript
          </Button>
        </div>
      );
    }

    // Filter formatted transcript by search term
    const filteredText = !searchTerm 
      ? formattedTranscript 
      : formattedTranscript
          .split('\n')
          .filter(line => line.toLowerCase().includes(searchTerm.toLowerCase()))
          .join('\n');

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground mb-4">
          AI-formatted transcript with enhanced readability
        </p>
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <div className="whitespace-pre-wrap text-base leading-relaxed">
            {highlightText(filteredText, searchTerm)}
          </div>
        </div>
      </div>
    );
  };

  const highlightText = (text: string, search: string) => {
    if (!text || !search.trim()) return text;
    
    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-primary/20 text-primary-foreground rounded px-1">
          {part}
        </mark>
      ) : part
    );
  };

  const renderSpeakerSegments = () => {
    if (!speakerSegments || !speakerSegments.length) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-4">
            Full transcript (speaker segments not available)
          </p>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {transcript ? highlightText(transcript, searchTerm) : 'No transcript available'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Transcript with speaker identification
        </p>
        {speakerSegments
          .filter(segment => 
            !searchTerm || 
            segment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
            segment.speaker.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .map((segment, index) => (
            <div key={index} className="border-l-2 border-primary/20 pl-4 py-2">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {segment.speaker}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {segment.start_time} - {segment.end_time}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed">
                {highlightText(segment.text, searchTerm)}
              </p>
            </div>
          ))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Sticky Header */}
        <DialogHeader className="sticky top-0 bg-background border-b pb-4 z-10">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold truncate">{title}</h3>
              {date && (
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(date).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyTranscript}
              className="flex items-center gap-2 ml-4 shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Transcript
                </>
              )}
            </Button>
          </DialogTitle>

          {/* View Toggle & Search Bar */}
          <div className="space-y-3 pt-4">
            {/* View Toggle */}
            <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Raw View</span>
                </div>
                <Switch 
                  checked={isCleanView}
                  onCheckedChange={handleToggleView}
                  className="data-[state=checked]:bg-primary"
                />
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Clean View</span>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {isCleanView ? 'Formatted' : 'Original'}
              </Badge>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transcript..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <ScrollArea ref={scrollAreaRef} className="overflow-auto px-4 py-2 h-full flex-1">
          <div className="text-base leading-relaxed">
            {isCleanView ? renderCleanView() : renderSpeakerSegments()}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};