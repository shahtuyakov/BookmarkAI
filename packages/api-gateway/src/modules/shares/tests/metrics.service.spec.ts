import { MetricsService } from '../services/metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  describe('Counters', () => {
    it('should increment counters correctly', () => {
      service.incrementCounter('test_counter');
      service.incrementCounter('test_counter');
      service.incrementCounter('test_counter', { label: 'value' });

      expect(service.getCounter('test_counter')).toBe(2);
      expect(service.getCounter('test_counter', { label: 'value' })).toBe(1);
    });

    it('should handle counters with labels', () => {
      service.incrementCounter('labeled_counter', { type: 'success' });
      service.incrementCounter('labeled_counter', { type: 'error' });
      service.incrementCounter('labeled_counter', { type: 'success' });

      expect(service.getCounter('labeled_counter', { type: 'success' })).toBe(2);
      expect(service.getCounter('labeled_counter', { type: 'error' })).toBe(1);
    });
  });

  describe('Histograms', () => {
    it('should record histogram observations', () => {
      service.observeHistogram('response_time', 100);
      service.observeHistogram('response_time', 200);
      service.observeHistogram('response_time', 300);

      const p95 = service.getHistogramPercentile('response_time', 95);
      expect(p95).toBe(300);
    });

    it('should calculate percentiles correctly', () => {
      // Add values: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
      for (let i = 1; i <= 10; i++) {
        service.observeHistogram('percentile_test', i * 10);
      }

      expect(service.getHistogramPercentile('percentile_test', 50)).toBe(50);
      expect(service.getHistogramPercentile('percentile_test', 95)).toBe(100);
      expect(service.getHistogramPercentile('percentile_test', 0)).toBe(10);
    });

    it('should handle empty histograms', () => {
      expect(service.getHistogramPercentile('empty_histogram', 95)).toBe(0);
    });

    it('should handle histograms with labels', () => {
      service.observeHistogram('labeled_histogram', 100, { endpoint: '/api/v1/shares' });
      service.observeHistogram('labeled_histogram', 200, { endpoint: '/api/v1/users' });

      const sharesP95 = service.getHistogramPercentile('labeled_histogram', 95, {
        endpoint: '/api/v1/shares',
      });
      const usersP95 = service.getHistogramPercentile('labeled_histogram', 95, {
        endpoint: '/api/v1/users',
      });

      expect(sharesP95).toBe(100);
      expect(usersP95).toBe(200);
    });
  });

  describe('Metric Key Generation', () => {
    it('should create correct metric keys without labels', () => {
      const createMetricKey = (service as any).createMetricKey.bind(service);

      expect(createMetricKey('test_metric', {})).toBe('test_metric');
    });

    it('should create correct metric keys with labels', () => {
      const createMetricKey = (service as any).createMetricKey.bind(service);

      const key = createMetricKey('test_metric', {
        platform: 'ios',
        endpoint: '/shares',
      });

      expect(key).toBe('test_metric{platform="ios",endpoint="/shares"}');
    });

    it('should handle special characters in labels', () => {
      const createMetricKey = (service as any).createMetricKey.bind(service);

      const key = createMetricKey('test_metric', {
        url: 'https://example.com/path?query=value',
      });

      expect(key).toContain('url="https://example.com/path?query=value"');
    });
  });

  describe('Get All Metrics', () => {
    it('should return all metrics in correct format', () => {
      service.incrementCounter('requests_total', { status: 'success' });
      service.incrementCounter('requests_total', { status: 'error' });
      service.observeHistogram('response_time', 150);
      service.observeHistogram('response_time', 250);

      const metrics = service.getAllMetrics();

      expect(metrics.counters).toHaveProperty('requests_total{status="success"}', 1);
      expect(metrics.counters).toHaveProperty('requests_total{status="error"}', 1);
      expect(metrics.histograms).toHaveProperty('response_time');
      expect(metrics.histograms['response_time'].count).toBe(2);
      expect(metrics.histograms['response_time'].p95).toBeGreaterThan(0);
    });

    it('should handle empty metrics', () => {
      const metrics = service.getAllMetrics();

      expect(metrics.counters).toEqual({});
      expect(metrics.histograms).toEqual({});
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      service.incrementCounter('test_counter');
      service.observeHistogram('test_histogram', 100);

      expect(service.getCounter('test_counter')).toBe(1);
      expect(service.getHistogramPercentile('test_histogram', 95)).toBe(100);

      service.reset();

      expect(service.getCounter('test_counter')).toBe(0);
      expect(service.getHistogramPercentile('test_histogram', 95)).toBe(0);
    });
  });
});
