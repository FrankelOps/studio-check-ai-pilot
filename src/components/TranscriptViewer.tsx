import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, Clock, User, Copy, Check, FileText, Code, Loader2, Pencil, Save, X } from "lucide-react";
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
  const [editingSpeaker, setEditingSpeaker] = useState<{ blockIndex: number; originalName: string } | null>(null);
  const [editedSpeakerName, setEditedSpeakerName] = useState<string>("");
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
      console.log('Formatting transcript with enhanced speaker attribution...');
      const { data, error } = await supabase.functions.invoke('format-transcript', {
        body: {
          speakerSegments: speakerSegments || null,
          transcriptText: transcript || ""
        }
      });

      if (error) throw error;
      
      // Validate and clean the formatted transcript
      let cleanedTranscript = data.formattedTranscript;
      
      // Ensure every speaker block has proper formatting
      if (cleanedTranscript) {
        // Validate timestamp format and fix if needed
        cleanedTranscript = cleanedTranscript.replace(
          /\[([^,\]]+),?\s*([^\]]*)\]:\s*/g, 
          (match, speaker, timestamp) => {
            // Ensure timestamp is in MM:SS format
            if (!timestamp || !timestamp.match(/^\d{1,2}:\d{2}$/)) {
              // If no valid timestamp, use placeholder
              timestamp = '00:00';
            }
            return `[${speaker.trim()}, ${timestamp}]:\n`;
          }
        );
        
        // Ensure proper spacing between blocks
        cleanedTranscript = cleanedTranscript
          .replace(/\n{3,}/g, '\n\n') // Max 2 line breaks
          .replace(/\]\:\n([^\n])/g, ']:\n$1') // Ensure newline after speaker label
          .trim();
      }
      
      setFormattedTranscript(cleanedTranscript);
      console.log('Transcript formatting completed successfully');
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

  const handleEditSpeaker = (blockIndex: number, currentName: string) => {
    setEditingSpeaker({ blockIndex, originalName: currentName });
    setEditedSpeakerName(currentName);
  };

  const handleSaveSpeakerEdit = () => {
    if (!editingSpeaker || !editedSpeakerName.trim()) return;
    
    // Update the formatted transcript with the new speaker name
    const updatedTranscript = formattedTranscript.replace(
      new RegExp(`\\[${editingSpeaker.originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`, 'g'),
      `[${editedSpeakerName.trim()},`
    );
    
    setFormattedTranscript(updatedTranscript);
    setEditingSpeaker(null);
    setEditedSpeakerName("");
  };

  const handleCancelSpeakerEdit = () => {
    setEditingSpeaker(null);
    setEditedSpeakerName("");
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

    // Split transcript into speaker blocks for enhanced rendering
    const blocks = formattedTranscript.split('\n\n').filter(block => block.trim());
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            AI-formatted transcript with enhanced speaker attribution and editing
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={formatTranscriptWithGPT}
            disabled={isFormatting}
            className="flex items-center gap-1"
          >
            <FileText className="h-3 w-3" />
            Re-format
          </Button>
        </div>
        
        {blocks.map((block, blockIndex) => {
          const lowerBlock = block.toLowerCase();
          const searchLower = searchTerm.toLowerCase();
          
          if (searchTerm && !lowerBlock.includes(searchLower)) {
            return null;
          }

          // Extract speaker name and timestamp from block
          const speakerMatch = block.match(/^\[([^,\]]+)(?:,\s*([^\]]+))?\]:/);
          const speakerName = speakerMatch ? speakerMatch[1] : null;
          const timestamp = speakerMatch ? speakerMatch[2] : null;
          
          // Extract the text content after the speaker label
          const textContent = block.replace(/^\[[^\]]+\]:\s*/, '');
          
          return (
            <div key={blockIndex} className="group border-l-2 border-primary/20 pl-4 py-3 hover:border-primary/40 transition-colors">
              {/* Speaker Header with Edit Button */}
              {speakerName && (
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {speakerName}
                    </Badge>
                    {timestamp && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timestamp}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Edit Speaker Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditSpeaker(blockIndex, speakerName)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    title="Edit speaker name"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              {/* Text Content */}
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {highlightText(textContent, searchTerm)}
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Speaker editing modal */}
        {editingSpeaker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg shadow-lg w-80 border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Edit Speaker Name</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelSpeakerEdit}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Speaker Name</label>
                  <Input
                    value={editedSpeakerName}
                    onChange={(e) => setEditedSpeakerName(e.target.value)}
                    placeholder="Enter speaker name"
                    className="mt-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveSpeakerEdit();
                      } else if (e.key === 'Escape') {
                        handleCancelSpeakerEdit();
                      }
                    }}
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelSpeakerEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveSpeakerEdit}
                    className="flex items-center gap-1"
                  >
                    <Save className="h-3 w-3" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
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