# Debug Microservice Prompt

I need to debug an issue in the {SERVICE_NAME} microservice. The symptoms are:

1. {SYMPTOM_1}
2. {SYMPTOM_2}

Please:
1. Check the service logs in docker/logs/
2. Review the service implementation in python/{SERVICE_NAME}/
3. Check message queue interactions with RabbitMQ
4. Verify database queries if applicable
5. Look for any error patterns in the orchestrator logs

Focus on:
- Race conditions in async operations
- Message queue connection issues
- Database connection pool problems
- Memory leaks in long-running processes