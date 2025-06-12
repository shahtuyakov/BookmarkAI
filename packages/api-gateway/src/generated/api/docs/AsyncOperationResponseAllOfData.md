# AsyncOperationResponseAllOfData


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **string** | Operation identifier | [default to undefined]
**status** | **string** |  | [default to undefined]
**statusUrl** | **string** | URL to check operation status | [default to undefined]
**progress** | [**AsyncOperationResponseAllOfDataProgress**](AsyncOperationResponseAllOfDataProgress.md) |  | [optional] [default to undefined]
**result** | **{ [key: string]: any; }** | Operation result (when status is \&#39;completed\&#39;) | [optional] [default to undefined]
**error** | [**AsyncOperationResponseAllOfDataError**](AsyncOperationResponseAllOfDataError.md) |  | [optional] [default to undefined]

## Example

```typescript
import { AsyncOperationResponseAllOfData } from '@bookmarkai/api-types';

const instance: AsyncOperationResponseAllOfData = {
    id,
    status,
    statusUrl,
    progress,
    result,
    error,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
