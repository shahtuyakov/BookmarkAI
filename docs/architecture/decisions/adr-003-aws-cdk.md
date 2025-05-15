# Architecture Decision Record: Using AWS CDK for Infrastructure as Code

## Status

Accepted

## Context

BookmarkAI requires a robust and maintainable approach to infrastructure provisioning. We needed a solution that would:

1. Allow infrastructure to be version-controlled
2. Support TypeScript for consistency with our application codebase
3. Provide reliable and reproducible deployments
4. Enable proper environment separation (dev, staging, production)
5. Support infrastructure as code best practices

## Decision

We have chosen to use AWS Cloud Development Kit (CDK) for infrastructure provisioning. Key aspects of this decision:

- Using TypeScript as the language for CDK to maintain consistency with our application code
- Structuring the infrastructure in modular stacks for different components:
  - Database Stack: PostgreSQL with pgvector and Redis
  - API Stack: Fastify/NestJS API service
  - Worker Stack: Background job processing
  - ML Stack: Python-based ML services
- Implementing proper separation of concerns between stacks
- Designing the infrastructure with security best practices (VPC isolation, security groups, etc.)

## Alternatives Considered

1. **CloudFormation Templates (YAML/JSON)**: More verbose, lacks native TypeScript support
2. **Terraform**: Excellent multi-cloud support, but introduces a different language (HCL)
3. **Serverless Framework**: Strong for Lambda-based architectures, but less flexible for container workloads
4. **AWS SAM**: Good for serverless, but limited for the mixed architecture (containers + databases) we need

## Consequences

### Positive

- Type safety through TypeScript
- Consistent infrastructure and application codebase
- Higher-level abstractions reduce boilerplate
- Native AWS integration
- Support for local development through Docker Compose for consistency
- Good support for our container-based architecture

### Challenging 

- CDK is still evolving and has some quirks (circular dependency challenges)
- Requires careful management of stack boundaries to prevent circular dependencies
- Some AWS constructs aren't fully represented in CDK

## Implementation Notes

1. Each stack focuses on a specific concern (databases, API, workers, ML)
2. VPC resources are created in the Database stack and shared with other stacks
3. Security groups are designed to avoid circular dependencies
4. Cross-stack references are carefully managed

## Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/latest/guide/home.html)
- [Best Practices for AWS CDK](https://aws.amazon.com/blogs/devops/best-practices-for-developing-cloud-applications-with-aws-cdk/)