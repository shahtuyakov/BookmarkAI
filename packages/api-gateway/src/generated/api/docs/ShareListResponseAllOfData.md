# ShareListResponseAllOfData


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**items** | [**Array&lt;Share&gt;**](Share.md) |  | [default to undefined]
**cursor** | **string** | Cursor for next page (if hasMore is true) | [optional] [default to undefined]
**hasMore** | **boolean** | Whether more items are available | [default to undefined]
**limit** | **number** | Number of items requested | [default to undefined]
**total** | **number** | Total count (only if efficiently countable) | [optional] [default to undefined]

## Example

```typescript
import { ShareListResponseAllOfData } from '@bookmarkai/api-types';

const instance: ShareListResponseAllOfData = {
    items,
    cursor,
    hasMore,
    limit,
    total,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
