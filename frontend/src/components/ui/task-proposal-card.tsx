'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, Play, X, ChevronDown, ChevronUp, Check, Bot, Code, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TaskProposalCardProps {
  planData: {
    type?: string;
    strategy?: string;
    matched_tools?: Array<{
      tool_id: string;
      tool_name: string;
      match_score?: number;
      inferred_params?: Record<string, unknown>;
      description?: string;
    }>;
    steps?: Array<{
      step: number;
      tool: string;
      params?: Record<string, unknown>;
    }>;
    code?: string;
    suggested_params?: Record<string, unknown>;
  };
  onConfirm: () => void;
  onReject?: () => void;
  isExecuting?: boolean;
}

export function TaskProposalCard({
  planData,
  onConfirm,
  onReject,
  isExecuting = false,
}: TaskProposalCardProps) {
  const [isCodeExpanded, setIsCodeExpanded] = useState(false);
  const [selectedToolIndex, setSelectedToolIndex] = useState(0);

  const planType = planData.type || 'single';
  const matchedTools = planData.matched_tools || [];
  const steps = planData.steps || [];
  const isToolChoice = planType === 'tool_choice' || planType === 'tool_recommendation';

  const getTypeBadge = () => {
    switch (planType) {
      case 'tool_recommendation':
        return <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">Recommended</Badge>;
      case 'tool_choice':
        return <Badge variant="secondary">Tool Selection</Badge>;
      case 'multi':
        return <Badge variant="default" className="bg-amber-500/20 text-amber-400 border-amber-500/30">Multi-Step</Badge>;
      default:
        return <Badge variant="outline">Single Task</Badge>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "relative overflow-hidden rounded-xl",
        "bg-card/80 backdrop-blur-xl border border-border/50",
        "shadow-lg shadow-primary/5"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-purple-500" />
      
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10">
              {isToolChoice ? (
                <Zap className="w-5 h-5 text-primary" />
              ) : planType === 'multi' ? (
                <FlaskConical className="w-5 h-5 text-primary" />
              ) : (
                <Bot className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-foreground">Analysis Plan</h4>
                {getTypeBadge()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isToolChoice ? 'Select a tool to proceed' : 'Review and confirm execution'}
              </p>
            </div>
          </div>
        </div>

        {planData.strategy && (
          <div className="bg-muted/50 rounded-lg p-4 mb-4 border border-border/50">
            <p className="text-sm text-foreground/90 leading-relaxed">
              {planData.strategy}
            </p>
          </div>
        )}

        {isToolChoice && matchedTools.length > 0 && (
          <div className="space-y-2 mb-4">
            {matchedTools.map((tool, index) => {
              const score = Math.round((tool.match_score || 0) * 100);
              const isSelected = index === selectedToolIndex;
              
              return (
                <button
                  key={tool.tool_id}
                  onClick={() => setSelectedToolIndex(index)}
                  className={cn(
                    "w-full text-left p-4 rounded-lg border transition-all",
                    isSelected
                      ? "bg-primary/10 border-primary/50"
                      : "bg-muted/30 border-border/50 hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        isSelected ? "bg-primary/20" : "bg-muted"
                      )}>
                        <Code className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{tool.tool_name}</div>
                        {tool.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {tool.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {score > 0 && (
                      <div className={cn(
                        "text-xs font-medium px-2 py-1 rounded-full",
                        score >= 75 ? "bg-emerald-500/20 text-emerald-400" :
                        score >= 50 ? "bg-amber-500/20 text-amber-400" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {score}%
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {planType === 'multi' && steps.length > 0 && (
          <div className="space-y-2 mb-4">
            {steps.map((step, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center">
                  {step.step}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{step.tool}</div>
                </div>
                <Check className="w-4 h-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}

        {planData.code && (
          <div className="mb-4">
            <button
              onClick={() => setIsCodeExpanded(!isCodeExpanded)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <Code className="w-4 h-4" />
              <span>View code</span>
              {isCodeExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <AnimatePresence>
              {isCodeExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ScrollArea className="h-48 rounded-lg bg-muted/50 border border-border/50">
                    <pre className="p-4 text-xs font-mono text-foreground/90">
                      {planData.code}
                    </pre>
                  </ScrollArea>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-border/50">
          <Button
            onClick={onConfirm}
            disabled={isExecuting}
            className="flex-1"
          >
            {isExecuting ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                <span>Executing...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Execute</span>
              </>
            )}
          </Button>
          {onReject && (
            <Button
              variant="outline"
              onClick={onReject}
              disabled={isExecuting}
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
