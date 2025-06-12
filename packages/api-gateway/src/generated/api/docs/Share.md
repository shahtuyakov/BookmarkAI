# Share


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **string** |  | [default to undefined]
**url** | **string** |  | [default to undefined]
**title** | **string** |  | [optional] [default to undefined]
**notes** | **string** |  | [optional] [default to undefined]
**status** | [**ShareStatus**](ShareStatus.md) |  | [default to undefined]
**platform** | [**Platform**](Platform.md) |  | [default to undefined]
**userId** | **string** |  | [default to undefined]
**metadata** | **{ [key: string]: any; }** | Platform-specific metadata (when processed) | [optional] [default to undefined]
**createdAt** | **string** |  | [default to undefined]
**updatedAt** | **string** |  | [default to undefined]
**processedAt** | **string** | When processing completed (if status is \&#39;done\&#39;) | [optional] [default to undefined]

## Example

```typescript
import { Share } from '@bookmarkai/api-types';

const instance: Share = {
    id,
    url,
    title,
    notes,
    status,
    platform,
    userId,
    metadata,
    createdAt,
    updatedAt,
    processedAt,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
