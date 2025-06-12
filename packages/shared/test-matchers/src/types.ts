// Pact matcher types that work across different versions
export interface PactMatcher {
  'pact:matcher:type': string;
  value?: any;
  regex?: string;
  min?: number;
  max?: number;
  'pact:generator:type'?: string;
  format?: string;
  'pact:matcher:values'?: any[];
  'pact:matcher:nullable'?: boolean;
}

export interface PactInteraction {
  state?: string;
  uponReceiving: string;
  withRequest: {
    method: string;
    path: string;
    headers?: Record<string, any>;
    body?: any;
    query?: Record<string, any>;
  };
  willRespondWith: {
    status: number;
    headers?: Record<string, any>;
    body?: any;
  };
}