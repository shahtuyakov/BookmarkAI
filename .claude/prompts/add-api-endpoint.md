# Add API Endpoint Prompt

I need to add a new API endpoint for {FEATURE_NAME}. The endpoint should:

- Method: {HTTP_METHOD}
- Path: /api/v1/{RESOURCE_PATH}
- Purpose: {PURPOSE}
- Input: {INPUT_DESCRIPTION}
- Output: {OUTPUT_DESCRIPTION}

Please:
1. Create the DTO in packages/api-gateway/src/modules/{module}/dto/
2. Add the controller method with proper decorators
3. Implement the service logic following repository pattern
4. Add input validation using class-validator
5. Create or update the corresponding tests
6. Update the OpenAPI documentation
7. Add the endpoint to packages/sdk/ for client access

Remember to:
- Use proper NestJS decorators
- Follow existing error handling patterns
- Add rate limiting if needed
- Implement proper authorization guards