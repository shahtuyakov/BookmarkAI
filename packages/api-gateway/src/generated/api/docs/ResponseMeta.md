# ResponseMeta


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**requestId** | **string** | Request correlation ID | [default to undefined]
**version** | **string** | API version | [optional] [default to undefined]
**deprecation** | **string** | Deprecation date (if applicable) | [optional] [default to undefined]

## Example

```typescript
import { ResponseMeta } from '@bookmarkai/api-types';

const instance: ResponseMeta = {
    requestId,
    version,
    deprecation,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
