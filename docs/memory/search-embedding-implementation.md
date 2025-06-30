# Search Embedding Implementation Memory

## Date: 2025-06-30

### Overview
Implemented real-time semantic search functionality using OpenAI embeddings to replace mock embeddings in the search service.

### What We Did

#### 1. Created Synchronous Embedding Service
- **File**: `packages/api-gateway/src/modules/ml/services/embedding.service.ts`
- **Purpose**: Provide real-time embedding generation for search queries
- **Key Features**:
  - Direct OpenAI API integration using `@nestjs/axios`
  - Redis caching with 24-hour TTL for embeddings
  - Fallback to mock embeddings if OpenAI fails
  - Support for different embedding models (ada-002, text-embedding-3-small/large)

#### 2. Updated ML Module
- **File**: `packages/api-gateway/src/modules/ml/ml.module.ts`
- **Changes**:
  - Added `HttpModule` from `@nestjs/axios`
  - Added Redis provider for caching
  - Exported `EmbeddingService` for use in other modules
  - Installed `@nestjs/axios` package (v4.0.0)

#### 3. Updated Search Service
- **File**: `packages/api-gateway/src/modules/shares/services/search.service.ts`
- **Changes**:
  - Replaced mock embedding generation with real OpenAI embeddings
  - Added `EmbeddingService` injection
  - Maintained fallback to mock embeddings for resilience
  - Used `embeddingService.generateEmbedding()` in `generateQueryEmbedding()` method

#### 4. Added Search Endpoints to OpenAPI Spec
- **File**: `apps/api/openapi.yaml`
- **New Endpoints**:
  - `POST /v1/shares/search/text` - Text-based semantic search
  - `POST /v1/shares/search/share/{shareId}` - Find similar shares
- **New DTOs**:
  - `SearchByTextDto` - Request body for text search
  - `SearchByShareDto` - Request body for similarity search
  - `SearchResultDto` - Extended ShareDto with similarity score, preview, and highlights
  - `PaginatedSearchResultsDto` - Paginated search results

#### 5. Regenerated SDK
- **Command**: `cd packages/sdk && pnpm generate`
- **Result**: SDK now includes:
  - `sharesControllerSearchByText()` method
  - `sharesControllerSearchBySimilarity()` method
  - All search-related types

#### 6. Implemented Mobile Search UI
- **File**: `packages/mobile/bookmarkaimobile/src/screens/main/SearchScreen.tsx`
- **Features**:
  - Debounced search (300ms delay) using `use-debounce` package
  - Reuses existing `ShareCard` component for consistency
  - Shows similarity percentage badge on each result
  - Pagination support with infinite scroll
  - Loading states and empty states
  - Direct API calls using SDK client's `request()` method

### Technical Decisions

1. **Synchronous Embeddings**: Created a dedicated service for real-time embedding generation instead of using the async queue system, as search needs immediate results.

2. **Caching Strategy**: Implemented Redis caching for embeddings to reduce API costs and improve performance for repeated searches.

3. **Fallback Mechanism**: Added fallback to mock embeddings to ensure search functionality continues even if OpenAI is unavailable.

4. **SDK Architecture**: Discovered the SDK has two different implementations:
   - Generated SDK from OpenAPI spec (what we need for search)
   - Custom SDK client (what the mobile app uses)
   - Worked around this by using the client's `request()` method directly

### Issues Encountered and Solutions

1. **Missing @nestjs/axios**: Installed the package to use HttpModule
2. **SDK Structure Confusion**: The mobile app uses a custom BookmarkAIClient that doesn't have the generated search methods
3. **Authentication Token**: Initial implementation tried to manually handle auth tokens, but the SDK client already handles this

### Dependencies Added
- `@nestjs/axios@4.0.0` - For HTTP requests in NestJS
- `use-debounce@10.0.5` - For search input debouncing in React Native

### Environment Variables Required
- `OPENAI_API_KEY` - For generating embeddings
- `EMBEDDING_MODEL` - Model to use (default: text-embedding-3-small)

### Testing Instructions

1. Ensure OpenAI API key is configured in the API Gateway
2. Run the iOS app: `cd packages/mobile/bookmarkaimobile && pnpm ios`
3. Navigate to Search tab
4. Type search queries - results should be semantically related
5. Check Redis for cached embeddings
6. Test fallback by removing OpenAI API key

### Next Steps

1. Add search filters (platform, status) to the UI
2. Implement search analytics
3. Add search suggestions/autocomplete
4. Consider implementing a dedicated search index (Elasticsearch/Algolia)
5. Add highlighting of matched terms in results

### Performance Considerations

- First search for a query: ~200-500ms (OpenAI API call)
- Subsequent searches for same query: ~50ms (Redis cache)
- Fallback to mock embeddings: ~10ms

### Cost Implications

- Each search query generates one embedding
- Cost: ~$0.00002 per search (text-embedding-3-small)
- Caching reduces costs for repeated searches
- Consider implementing rate limiting for search API