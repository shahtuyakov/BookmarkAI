# ApiError


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**code** | **string** | Hierarchical error code | [default to undefined]
**message** | **string** | Human-readable error message | [default to undefined]
**details** | [**ApiErrorDetails**](ApiErrorDetails.md) |  | [optional] [default to undefined]
**timestamp** | **string** | When the error occurred | [default to undefined]
**traceId** | **string** | Trace ID for debugging | [default to undefined]

## Example

```typescript
import { ApiError } from '@bookmarkai/api-types';

const instance: ApiError = {
    code,
    message,
    details,
    timestamp,
    traceId,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
