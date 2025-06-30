import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, register } from 'prom-client';
import { VideoWorkflowState } from '../../../shares/types/workflow.types';

@Injectable()
export class WorkflowMetricsService {
  // Gauge for current shares in each workflow state
  private readonly workflowStateGauge: Gauge<string>;
  
  // Counter for workflow state transitions
  private readonly workflowTransitionCounter: Counter<string>;
  
  // Histogram for workflow duration
  private readonly workflowDurationHistogram: Histogram<string>;
  
  // Counter for stuck workflow detections
  private readonly stuckWorkflowCounter: Counter<string>;
  
  // Gauge for enhancement version tracking
  private readonly enhancementVersionGauge: Gauge<string>;

  constructor() {
    // Initialize workflow state gauge
    this.workflowStateGauge = new Gauge({
      name: 'video_workflow_state_current',
      help: 'Current number of shares in each workflow state',
      labelNames: ['state'],
      registers: [register],
    });

    // Initialize transition counter
    this.workflowTransitionCounter = new Counter({
      name: 'video_workflow_transitions_total',
      help: 'Total number of workflow state transitions',
      labelNames: ['from_state', 'to_state'],
      registers: [register],
    });

    // Initialize duration histogram
    this.workflowDurationHistogram = new Histogram({
      name: 'video_workflow_duration_seconds',
      help: 'Duration of video workflow stages in seconds',
      labelNames: ['stage'],
      buckets: [30, 60, 120, 300, 600, 1200, 1800, 3600], // 30s to 1h
      registers: [register],
    });

    // Initialize stuck workflow counter
    this.stuckWorkflowCounter = new Counter({
      name: 'video_workflow_stuck_total',
      help: 'Total number of workflows detected as stuck',
      labelNames: ['state', 'duration_minutes'],
      registers: [register],
    });

    // Initialize enhancement version gauge
    this.enhancementVersionGauge = new Gauge({
      name: 'video_enhancement_version',
      help: 'Current enhancement version for video workflows',
      labelNames: ['version'],
      registers: [register],
    });

    // Set initial enhancement version
    this.enhancementVersionGauge.set({ version: '2.0' }, 1);
  }

  /**
   * Update gauge for workflow states
   */
  updateWorkflowStateGauge(stats: Array<{ workflowState: string; count: number }>) {
    // Reset all gauges first
    this.workflowStateGauge.reset();
    
    // Set current values
    stats.forEach(({ workflowState, count }) => {
      if (workflowState) {
        this.workflowStateGauge.set({ state: workflowState }, count);
      }
    });
  }

  /**
   * Record a workflow state transition
   */
  recordWorkflowTransition(fromState: string | null, toState: string) {
    this.workflowTransitionCounter.inc({
      from_state: fromState || 'none',
      to_state: toState,
    });
  }

  /**
   * Record workflow stage duration
   */
  recordWorkflowDuration(stage: string, durationSeconds: number) {
    this.workflowDurationHistogram.observe({ stage }, durationSeconds);
  }

  /**
   * Record a stuck workflow detection
   */
  recordStuckWorkflow(state: string, durationMinutes: number) {
    const durationBucket = this.getDurationBucket(durationMinutes);
    this.stuckWorkflowCounter.inc({
      state,
      duration_minutes: durationBucket,
    });
  }

  /**
   * Get duration bucket for stuck workflow metrics
   */
  private getDurationBucket(minutes: number): string {
    if (minutes <= 30) return '0-30';
    if (minutes <= 60) return '31-60';
    if (minutes <= 120) return '61-120';
    if (minutes <= 240) return '121-240';
    return '240+';
  }

  /**
   * Calculate and record workflow completion time
   */
  recordWorkflowCompletion(startedAt: Date, completedAt: Date) {
    const durationSeconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
    this.workflowDurationHistogram.observe({ stage: 'complete' }, durationSeconds);
  }

  /**
   * Record transcription stage duration
   */
  recordTranscriptionDuration(durationSeconds: number) {
    this.workflowDurationHistogram.observe({ stage: VideoWorkflowState.TRANSCRIBING }, durationSeconds);
  }

  /**
   * Record summarization stage duration
   */
  recordSummarizationDuration(durationSeconds: number) {
    this.workflowDurationHistogram.observe({ stage: VideoWorkflowState.SUMMARIZING }, durationSeconds);
  }
}