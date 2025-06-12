## @bookmarkai/api-types@1.0.0

This generator creates TypeScript/JavaScript client that utilizes [axios](https://github.com/axios/axios). The generated Node module can be used in the following environments:

Environment
* Node.js
* Webpack
* Browserify

Language level
* ES5 - you must have a Promises/A+ library installed
* ES6

Module system
* CommonJS
* ES6 module system

It can be used in both TypeScript and JavaScript. In TypeScript, the definition will be automatically resolved via `package.json`. ([Reference](https://www.typescriptlang.org/docs/handbook/declaration-files/consumption.html))

### Building

To build and compile the typescript sources to javascript use:
```
npm install
npm run build
```

### Publishing

First build the package then run `npm publish`

### Consuming

navigate to the folder of your consuming project and run one of the following commands.

_published:_

```
npm install @bookmarkai/api-types@1.0.0 --save
```

_unPublished (not recommended):_

```
npm install PATH_TO_GENERATED_PACKAGE --save
```

### Documentation for API Endpoints

All URIs are relative to *https://api.bookmarkai.com/v1*

Class | Method | HTTP request | Description
------------ | ------------- | ------------- | -------------
*AuthenticationApi* | [**login**](docs/AuthenticationApi.md#login) | **POST** /auth/login | Login user
*AuthenticationApi* | [**logout**](docs/AuthenticationApi.md#logout) | **POST** /auth/logout | Logout user
*AuthenticationApi* | [**refreshToken**](docs/AuthenticationApi.md#refreshtoken) | **POST** /auth/refresh | Refresh access token
*SharesApi* | [**createShare**](docs/SharesApi.md#createshare) | **POST** /shares | Create a new share
*SharesApi* | [**createSharesBatch**](docs/SharesApi.md#createsharesbatch) | **POST** /shares/batch | Create multiple shares in batch
*SharesApi* | [**getShare**](docs/SharesApi.md#getshare) | **GET** /shares/{shareId} | Get a specific share
*SharesApi* | [**listShares**](docs/SharesApi.md#listshares) | **GET** /shares | List user\&#39;s shares
*SystemApi* | [**getFeatures**](docs/SystemApi.md#getfeatures) | **GET** /features | Get feature flags
*SystemApi* | [**getOperationStatus**](docs/SystemApi.md#getoperationstatus) | **GET** /operations/{operationId} | Check async operation status
*SystemApi* | [**healthCheck**](docs/SystemApi.md#healthcheck) | **GET** /health | Health check endpoint
*SystemApi* | [**subscribeToEvents**](docs/SystemApi.md#subscribetoevents) | **GET** /events | Server-sent events for real-time updates


### Documentation For Models

 - [ApiError](docs/ApiError.md)
 - [ApiErrorDetails](docs/ApiErrorDetails.md)
 - [AsyncOperationResponse](docs/AsyncOperationResponse.md)
 - [AsyncOperationResponseAllOfData](docs/AsyncOperationResponseAllOfData.md)
 - [AsyncOperationResponseAllOfDataError](docs/AsyncOperationResponseAllOfDataError.md)
 - [AsyncOperationResponseAllOfDataProgress](docs/AsyncOperationResponseAllOfDataProgress.md)
 - [CreateShareRequest](docs/CreateShareRequest.md)
 - [CreateSharesBatchRequest](docs/CreateSharesBatchRequest.md)
 - [CreateSharesBatchRequestOperationsInner](docs/CreateSharesBatchRequestOperationsInner.md)
 - [ErrorResponse](docs/ErrorResponse.md)
 - [FeaturesResponse](docs/FeaturesResponse.md)
 - [HealthResponse](docs/HealthResponse.md)
 - [HealthResponseAllOfData](docs/HealthResponseAllOfData.md)
 - [HealthResponseAllOfDataChecks](docs/HealthResponseAllOfDataChecks.md)
 - [LoginRequest](docs/LoginRequest.md)
 - [LoginResponse](docs/LoginResponse.md)
 - [LoginResponseAllOfData](docs/LoginResponseAllOfData.md)
 - [Platform](docs/Platform.md)
 - [RefreshTokenRequest](docs/RefreshTokenRequest.md)
 - [ResponseMeta](docs/ResponseMeta.md)
 - [Share](docs/Share.md)
 - [ShareListResponse](docs/ShareListResponse.md)
 - [ShareListResponseAllOfData](docs/ShareListResponseAllOfData.md)
 - [ShareQueueEntry](docs/ShareQueueEntry.md)
 - [ShareQueueEntryMetadata](docs/ShareQueueEntryMetadata.md)
 - [ShareResponse](docs/ShareResponse.md)
 - [ShareStatus](docs/ShareStatus.md)
 - [SharesBatchResponse](docs/SharesBatchResponse.md)
 - [SharesBatchResponseAllOfData](docs/SharesBatchResponseAllOfData.md)
 - [SharesBatchResponseAllOfDataFailed](docs/SharesBatchResponseAllOfDataFailed.md)
 - [SharesBatchResponseAllOfDataItem](docs/SharesBatchResponseAllOfDataItem.md)
 - [SuccessResponse](docs/SuccessResponse.md)
 - [TokenResponse](docs/TokenResponse.md)
 - [TokenResponseAllOfData](docs/TokenResponseAllOfData.md)
 - [User](docs/User.md)


<a id="documentation-for-authorization"></a>
## Documentation For Authorization


Authentication schemes defined for the API:
<a id="bearerAuth"></a>
### bearerAuth

- **Type**: Bearer authentication (JWT)

