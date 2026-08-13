## ADDED Requirements

### Requirement: Alias-Based Bedrock Model Catalog
The LiteLLM proxy SHALL expose a configured catalog of Bedrock-backed model aliases (`model_name` entries in its `model_list` configuration) that core-api and other internal clients invoke by alias rather than by raw Bedrock model ID. The catalog SHALL be defined per deployment environment (production/staging via the `litellm` Helm chart's ConfigMap, local dev via the compose stack's LiteLLM config file), and both environments' catalogs SHALL be kept in sync with each other in the same change whenever an alias is added, removed, or repointed.

#### Scenario: Adding a model requires only configuration
- **WHEN** a new Bedrock model alias (for example `claude-sonnet-5`, `claude-opus-5`, or `glm-5`) is added to the proxy's `model_list` configuration in both the production ConfigMap and the local-dev config file
- **THEN** core-api can request completions using that alias name without any core-api code change, and no IAM/IRSA policy change is required as long as the underlying Bedrock model is within the proxy's already-granted `foundation-model`/`inference-profile` permissions

#### Scenario: Catalog is discoverable via the proxy's model listing
- **WHEN** a client calls the LiteLLM proxy's `/v1/models` endpoint
- **THEN** the response includes every alias currently defined in that environment's `model_list`, including any newly added aliases, without requiring a proxy restart beyond the config-change rollout the deployment already performs

#### Scenario: Environment catalogs stay in sync
- **WHEN** an alias is added to the production/staging `model_list`
- **THEN** the same alias (using that environment's applicable Bedrock ID form — cross-region inference profile in production, direct account ID in local dev, or an identical ID in both when no cross-region profile exists for that model) is also present in the local-dev `model_list`, so a developer's local behavior matches production for that alias
