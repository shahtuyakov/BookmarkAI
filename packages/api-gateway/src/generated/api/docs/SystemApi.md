# SystemApi

All URIs are relative to *https://api.bookmarkai.com/v1*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getFeatures**](#getfeatures) | **GET** /features | Get feature flags|
|[**getOperationStatus**](#getoperationstatus) | **GET** /operations/{operationId} | Check async operation status|
|[**healthCheck**](#healthcheck) | **GET** /health | Health check endpoint|
|[**subscribeToEvents**](#subscribetoevents) | **GET** /events | Server-sent events for real-time updates|

# **getFeatures**
> FeaturesResponse getFeatures()


### Example

```typescript
import {
    SystemApi,
    Configuration
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SystemApi(configuration);

let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.getFeatures(
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**FeaturesResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Feature flags |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getOperationStatus**
> AsyncOperationResponse getOperationStatus()


### Example

```typescript
import {
    SystemApi,
    Configuration
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SystemApi(configuration);

let operationId: string; //Operation ID returned from async endpoint (default to undefined)
let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.getOperationStatus(
    operationId,
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **operationId** | [**string**] | Operation ID returned from async endpoint | defaults to undefined|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**AsyncOperationResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Operation status |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |
|**404** | Resource not found |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **healthCheck**
> HealthResponse healthCheck()


### Example

```typescript
import {
    SystemApi,
    Configuration
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SystemApi(configuration);

let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.healthCheck(
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**HealthResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Service is healthy |  * X-Request-ID -  <br>  |
|**503** | Service is unhealthy |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **subscribeToEvents**
> string subscribeToEvents()


### Example

```typescript
import {
    SystemApi,
    Configuration
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new SystemApi(configuration);

let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.subscribeToEvents(
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**string**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: text/event-stream, application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | SSE stream established |  * X-Request-ID -  <br>  * Cache-Control -  <br>  * Connection -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

