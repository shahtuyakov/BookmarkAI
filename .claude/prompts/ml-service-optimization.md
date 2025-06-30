# ML Service Optimization Prompt

I need to optimize the {SERVICE_NAME} ML service for better performance. Current issues:
- {ISSUE_1}
- {ISSUE_2}

Please analyze and optimize:

1. **Model Loading**
   - Check if model is loaded once at startup
   - Verify model caching strategy
   - Review memory usage patterns

2. **Batch Processing**
   - Implement request batching if not present
   - Optimize batch sizes for GPU/CPU
   - Add queue-based processing

3. **Resource Management**
   - Review thread pool configuration
   - Check for memory leaks
   - Optimize Docker resource limits

4. **Caching Strategy**
   - Implement Redis caching for repeated requests
   - Add embedding cache for vector service
   - Cache preprocessed data

5. **Monitoring**
   - Add Prometheus metrics for inference time
   - Track queue depths
   - Monitor resource utilization

Focus on maintaining accuracy while improving throughput.