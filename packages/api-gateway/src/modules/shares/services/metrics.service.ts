import { Injectable } from '@nestjs/common';

/**
 * Metrics service for tracking idempotency-related metrics
 * Using simple in-memory counters for MVP - in production, integrate with Prometheus
 */
@Injectable()
export class MetricsService {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = this.createMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
  }

  /**
   * Record a histogram observation
   */
  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.createMetricKey(name, labels);
    const current = this.histograms.get(key) || [];
    current.push(value);
    this.histograms.set(key, current);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels: Record<string, string> = {}): number {
    const key = this.createMetricKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get histogram percentile
   */
  getHistogramPercentile(
    name: string,
    percentile: number,
    labels: Record<string, string> = {},
  ): number {
    const key = this.createMetricKey(name, labels);
    const values = this.histograms.get(key) || [];

    if (values.length === 0) return 0;

    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get all metrics for debugging/monitoring
   */
  getAllMetrics(): {
    counters: Record<string, number>;
    histograms: Record<string, { count: number; p95: number }>;
  } {
    const counters: Record<string, number> = {};
    const histograms: Record<string, { count: number; p95: number }> = {};

    for (const [key, value] of this.counters.entries()) {
      counters[key] = value;
    }

    for (const [key, values] of this.histograms.entries()) {
      histograms[key] = {
        count: values.length,
        p95: this.getHistogramPercentile(key.split('{')[0], 95, {}),
      };
    }

    return { counters, histograms };
  }

  /**
   * Create a metric key with labels
   */
  private createMetricKey(name: string, labels: Record<string, string>): string {
    const labelString = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    return labelString ? `${name}{${labelString}}` : name;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}
