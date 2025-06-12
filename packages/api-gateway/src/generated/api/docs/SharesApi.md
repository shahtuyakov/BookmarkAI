# SharesApi

All URIs are relative to *https://api.bookmarkai.com/v1*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createShare**](#createshare) | **POST** /shares | Create a new share|
|[**createSharesBatch**](#createsharesbatch) | **POST** /shares/batch | Create multiple shares in batch|
|[**getShare**](#getshare) | **GET** /shares/{shareId} | Get a specific share|
|[**listShares**](#listshares) | **GET** /shares | List user\&#39;s shares|

# **createShare**
> ShareResponse createShare(createShareRequest)


### Example

```typescript
import {
    SharesApi,
    Configuration,
    CreateShareRequest
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SharesApi(configuration);

let idempotencyKey: string; //Unique key to prevent duplicate operations (default to undefined)
let createShareRequest: CreateShareRequest; //
let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.createShare(
    idempotencyKey,
    createShareRequest,
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createShareRequest** | **CreateShareRequest**|  | |
| **idempotencyKey** | [**string**] | Unique key to prevent duplicate operations | defaults to undefined|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**ShareResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**202** | Share accepted for processing |  * X-Request-ID -  <br>  |
|**400** | Invalid request parameters |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |
|**409** | Request conflicts with current state |  * X-Request-ID -  <br>  |
|**429** | Too many requests |  * X-Request-ID -  <br>  * X-Rate-Limit-Limit -  <br>  * X-Rate-Limit-Remaining -  <br>  * X-Rate-Limit-Reset -  <br>  * Retry-After -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createSharesBatch**
> SharesBatchResponse createSharesBatch(createSharesBatchRequest)


### Example

```typescript
import {
    SharesApi,
    Configuration,
    CreateSharesBatchRequest
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SharesApi(configuration);

let createSharesBatchRequest: CreateSharesBatchRequest; //
let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.createSharesBatch(
    createSharesBatchRequest,
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **createSharesBatchRequest** | **CreateSharesBatchRequest**|  | |
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**SharesBatchResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**202** | Batch operation accepted |  * X-Request-ID -  <br>  |
|**400** | Invalid request parameters |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |
|**429** | Too many requests |  * X-Request-ID -  <br>  * X-Rate-Limit-Limit -  <br>  * X-Rate-Limit-Remaining -  <br>  * X-Rate-Limit-Reset -  <br>  * Retry-After -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getShare**
> ShareResponse getShare()


### Example

```typescript
import {
    SharesApi,
    Configuration
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SharesApi(configuration);

let shareId: string; //Share UUID (default to undefined)
let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)
let fields: Array<string>; //Select specific fields to return (optional) (default to undefined)

const { status, data } = await apiInstance.getShare(
    shareId,
    xRequestID,
    fields
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **shareId** | [**string**] | Share UUID | defaults to undefined|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|
| **fields** | **Array&lt;string&gt;** | Select specific fields to return | (optional) defaults to undefined|


### Return type

**ShareResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Share details |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |
|**404** | Resource not found |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listShares**
> ShareListResponse listShares()


### Example

```typescript
import {
    SharesApi,
    Configuration
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SharesApi(configuration);

let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)
let cursor: string; //Pagination cursor in format: `{timestamp}_{id}` Use the cursor from previous response to get next page  (optional) (default to undefined)
let limit: number; //Number of items to return (1-100) (optional) (default to 20)
let status: ShareStatus; //Filter by processing status (optional) (default to undefined)
let platform: Array<Platform>; //Filter by platform (comma-separated for OR) (optional) (default to undefined)
let createdAfter: string; //Filter shares created after this date (optional) (default to undefined)
let createdBefore: string; //Filter shares created before this date (optional) (default to undefined)
let sort: string; //Sort fields (comma-separated). Prefix with `-` for descending order. Available fields: createdAt, platform, status  (optional) (default to '-createdAt')
let fields: Array<string>; //Select specific fields (comma-separated) to reduce response size. Available fields: id, url, platform, status, createdAt, updatedAt, title, notes  (optional) (default to undefined)

const { status, data } = await apiInstance.listShares(
    xRequestID,
    cursor,
    limit,
    status,
    platform,
    createdAfter,
    createdBefore,
    sort,
    fields
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|
| **cursor** | [**string**] | Pagination cursor in format: &#x60;{timestamp}_{id}&#x60; Use the cursor from previous response to get next page  | (optional) defaults to undefined|
| **limit** | [**number**] | Number of items to return (1-100) | (optional) defaults to 20|
| **status** | **ShareStatus** | Filter by processing status | (optional) defaults to undefined|
| **platform** | **Array&lt;Platform&gt;** | Filter by platform (comma-separated for OR) | (optional) defaults to undefined|
| **createdAfter** | [**string**] | Filter shares created after this date | (optional) defaults to undefined|
| **createdBefore** | [**string**] | Filter shares created before this date | (optional) defaults to undefined|
| **sort** | [**string**] | Sort fields (comma-separated). Prefix with &#x60;-&#x60; for descending order. Available fields: createdAt, platform, status  | (optional) defaults to '-createdAt'|
| **fields** | **Array&lt;string&gt;** | Select specific fields (comma-separated) to reduce response size. Available fields: id, url, platform, status, createdAt, updatedAt, title, notes  | (optional) defaults to undefined|


### Return type

**ShareListResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | List of shares |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

