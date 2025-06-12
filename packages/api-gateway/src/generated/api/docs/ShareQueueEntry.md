# ShareQueueEntry


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **string** | ULID format identifier | [default to undefined]
**url** | **string** | URL to be shared | [default to undefined]
**createdAt** | **string** | ISO 8601 timestamp | [default to undefined]
**status** | **string** | Processing status | [default to undefined]
**source** | **string** | Platform that created the share | [default to undefined]
**metadata** | [**ShareQueueEntryMetadata**](ShareQueueEntryMetadata.md) |  | [optional] [default to undefined]

## Example

```typescript
import { ShareQueueEntry } from '@bookmarkai/api-types';

const instance: ShareQueueEntry = {
    id,
    url,
    createdAt,
    status,
    source,
    metadata,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
