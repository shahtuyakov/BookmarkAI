# AuthenticationApi

All URIs are relative to *https://api.bookmarkai.com/v1*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**login**](#login) | **POST** /auth/login | Login user|
|[**logout**](#logout) | **POST** /auth/logout | Logout user|
|[**refreshToken**](#refreshtoken) | **POST** /auth/refresh | Refresh access token|

# **login**
> LoginResponse login(loginRequest)


### Example

```typescript
import {
    AuthenticationApi,
    Configuration,
    LoginRequest
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new AuthenticationApi(configuration);

let loginRequest: LoginRequest; //
let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.login(
    loginRequest,
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **loginRequest** | **LoginRequest**|  | |
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**LoginResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful login |  * X-Request-ID -  <br>  |
|**400** | Invalid request parameters |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |
|**429** | Too many requests |  * X-Request-ID -  <br>  * X-Rate-Limit-Limit -  <br>  * X-Rate-Limit-Remaining -  <br>  * X-Rate-Limit-Reset -  <br>  * Retry-After -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **logout**
> logout()


### Example

```typescript
import {
    AuthenticationApi,
    Configuration
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new AuthenticationApi(configuration);

let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.logout(
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**204** | Successfully logged out |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **refreshToken**
> TokenResponse refreshToken(refreshTokenRequest)


### Example

```typescript
import {
    AuthenticationApi,
    Configuration,
    RefreshTokenRequest
} from '@bookmarkai/api-types';

const configuration = new Configuration();
const apiInstance = new AuthenticationApi(configuration);

let refreshTokenRequest: RefreshTokenRequest; //
let xRequestID: string; //Optional request ID for tracing. If not provided, one will be generated. (optional) (default to undefined)

const { status, data } = await apiInstance.refreshToken(
    refreshTokenRequest,
    xRequestID
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **refreshTokenRequest** | **RefreshTokenRequest**|  | |
| **xRequestID** | [**string**] | Optional request ID for tracing. If not provided, one will be generated. | (optional) defaults to undefined|


### Return type

**TokenResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Token refreshed successfully |  * X-Request-ID -  <br>  |
|**401** | Authentication required or invalid |  * X-Request-ID -  <br>  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

