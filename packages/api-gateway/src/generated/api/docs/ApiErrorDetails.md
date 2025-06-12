# ApiErrorDetails

Additional error context

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**field** | **string** | Field that caused validation error | [optional] [default to undefined]
**constraint** | **string** | Validation rule that was violated | [optional] [default to undefined]
**suggestion** | **string** | How to fix the error | [optional] [default to undefined]

## Example

```typescript
import { ApiErrorDetails } from '@bookmarkai/api-types';

const instance: ApiErrorDetails = {
    field,
    constraint,
    suggestion,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
